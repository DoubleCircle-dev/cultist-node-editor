import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';
import { graphToDataPool, nodeModelToContractNode, nodesToContractGraph } from '../../frontend/src/dataContract.js';
import { ModDataRegistry } from '../../frontend/src/modDataRegistry.js';

/**
 * 数据契约往返测试（中间态 JSON → 前端节点模型 → 中间态 JSON）。
 *
 * 覆盖：
 *  - 中间态节点 → 数据池 → 节点实例：字段值按名填进属性
 *  - 节点模型 → 中间态：props（name/kind/value/links/materialize）与 connections
 *  - 纯端口字段（无值输入）只进 connections，不进 props
 *  - 连线 → edges（出线端 out / 入线端 in，朝向取端口 direction）
 */

/** 构造一个「中间态」节点（core 新契约形态：props = { name, kind, value, links, materialize }） */
function makeContractNode() {
  return {
    uid: 'test-ns:recipes:r1',
    id: 'r1',
    type: 'recipes',
    category: 'recipes',
    title: '测试配方',
    file: 'recipes/test.json',
    source: 'mod',
    refCount: 1,
    props: [
      { name: 'warmup', kind: 'number', value: 30, links: [], materialize: null },
      { name: 'startdescription', kind: 'string', value: '开始', links: [], materialize: null },
      {
        name: 'actionId',
        kind: 'string',
        value: 'work',
        links: [{ port: 'actionId', direction: 'input', targets: ['verbs'], multi: false, extract: 'id' }],
        materialize: null,
      },
      {
        name: 'effects',
        kind: 'dict',
        value: { lantern: 1 },
        links: [{ port: 'effects', direction: 'output', targets: ['elements'], multi: true, extract: 'map', plugin: 'my-plugin' }],
        materialize: null,
      },
      {
        // alt：跳转条件写在目标身上（后端声明 direction='input'，朝向由后端变换成 out=目标 / in=本条目）
        name: 'alt',
        kind: 'list',
        value: [{ id: 'r2' }],
        links: [{ port: 'alt', direction: 'input', targets: ['recipes'], multi: true, extract: 'id-list' }],
        materialize: null,
      },
    ],
    connections: [],
  };
}

/** 中间态节点 → 注册进数据池 */
function registerNode(node, namespace = 'test-ns') {
  const pool = graphToDataPool({ namespace, source: node.source, count: 1, nodes: [node], edges: [] });
  ModDataRegistry.register(pool);
  return pool.categories[node.type][0];
}

describe('数据契约：节点模型 → 中间态 JSON', () => {
  let core;

  beforeEach(async () => {
    ({ core } = await createCore());
    ModDataRegistry.categories = {};
    ModDataRegistry.sources = {};
    ModDataRegistry.files = {};
    ModDataRegistry.index = new Map();
  });

  afterEach(() => {
    destroyCore(core);
  });

  it('翻译单个节点：id/title/来源 + props 的 kind/value/links', () => {
    const entry = registerNode(makeContractNode());
    const model = core.nodeManager.addNodeFromData('recipes', entry);
    assert.ok(model, '节点应创建成功');

    const back = nodeModelToContractNode(model);
    console.log('[契约] 单节点翻译结果:', JSON.stringify(back, null, 2));

    assert.equal(back.id, 'r1');
    assert.equal(back.type, 'recipes');
    assert.equal(back.category, 'recipes');
    assert.equal(back.source, 'mod');
    assert.equal(back.file, 'recipes/test.json');

    const warmup = back.props.find((p) => p.name === 'warmup');
    assert.ok(warmup, 'warmup 应出现在 props 里');
    assert.equal(warmup.kind, 'number');
    assert.equal(warmup.value, 30);

    const effects = back.props.find((p) => p.name === 'effects');
    assert.ok(effects, 'effects（端口属性，有值输入）应出现在 props 里');
    assert.deepEqual(effects.value, { lantern: 1 }, 'composite 值应从 JSON 字符串还原为对象');
    assert.equal(effects.kind, 'dict');
    assert.equal(effects.links[0].extract, 'map', 'link 声明优先使用来源条目的');
    assert.deepEqual(effects.links[0].targets, ['elements']);
    assert.equal(effects.links[0].direction, 'output', 'links.direction 取来源声明');

    const effectsConn = back.connections.find((c) => c.field === 'effects');
    assert.ok(effectsConn, 'connections 应包含 effects');
    assert.equal(effectsConn.side, 'output', 'connections.side 取来源声明（effects 产出 elements）');
    assert.equal(
      effectsConn.portSide,
      'input',
      '模板把 effects 建成了输入端口 —— portSide 留痕，暴露模板与 mapping 语义的不一致'
    );

    // 纯端口（模板 inputs，没有值输入框）只在 connections 里
    assert.ok(
      back.connections.some((c) => c.field === 'prerequisite'),
      'connections 应包含纯端口 prerequisite'
    );
    assert.ok(
      !back.props.some((p) => p.name === 'prerequisite'),
      'prerequisite 不应作为属性交付'
    );

    // 端口属性两侧都有：connections + props
    assert.ok(back.connections.some((c) => c.field === 'actionId'));
    assert.ok(back.props.some((p) => p.name === 'actionId'));

    // connections 的契约字段：sources（规则来源）与 targetIds（已解析目标）
    assert.ok(
      back.connections.every((c) => Array.isArray(c.sources) && Array.isArray(c.targetIds)),
      'connections 应带 sources / targetIds'
    );
    assert.deepEqual(effectsConn.sources, ['my-plugin'], 'sources 应来自声明里的 plugin');
    assert.deepEqual(effectsConn.targetIds, [], '未连线时 targetIds 为空');
  });

  it('alt 声明 input（跳转条件写在目标身上）→ out 是目标、in 是本条目', () => {
    const entryA = registerNode(makeContractNode());
    const entryB = registerNode({ ...makeContractNode(), uid: 'test-ns:recipes:r2', id: 'r2', title: '目标配方' });
    const recipeA = core.nodeManager.addNodeFromData('recipes', entryA, 0, 0);
    const recipeB = core.nodeManager.addNodeFromData('recipes', entryB, 400, 0);

    const altPort = recipeA.detailProperties.find((p) => p.name === 'alt');
    const prereqPort = recipeB.detailProperties.find((p) => p.name === 'prerequisite');
    assert.ok(altPort?.outputPort, 'alt 应有输出端口');
    assert.ok(prereqPort?.inputPort, 'prerequisite 应有输入端口');

    const conn = core.connectionManager.createProgrammaticConnection(
      recipeA,
      altPort.outputPort,
      recipeB,
      prereqPort.inputPort
    );
    assert.ok(conn, '连线应建立成功');

    const graph = nodesToContractGraph(core.nodeManager.nodes.values(), { namespace: 'test-ns' });
    console.log('[契约] alt 边:', JSON.stringify(graph.edges, null, 2));

    const uidA = entryA.uid;
    const uidB = entryB.uid;
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.format, 'cne-node-graph');
    assert.equal(graph.version, 1);

    const edge = graph.edges[0];
    assert.equal(edge.kind, 'link');
    assert.equal(edge.status, 'resolved');
    assert.equal(edge.from.uid, uidA, 'from = 引用关系本身（声明所在端）');
    assert.equal(edge.from.field, 'alt');
    assert.equal(edge.from.side, 'input', 'alt 的跳转条件写在目标身上 → 本条目是入线端');
    assert.equal(edge.out.uid, uidB, 'out = 目标（被引用的那一条）');
    assert.equal(edge.out.port, 'link', '目标端统一走通用入口');
    assert.equal(edge.in.uid, uidA, 'in = 本条目');
    assert.equal(edge.in.field, 'alt');
    assert.equal(edge.in.port, 'input:alt', '声明侧的端口 key = <side>:<端口名>');
    assert.equal(edge.targetId, 'r2', 'targetId 是引用目标（出线端）的 id');
    assert.equal(edge.id, `${uidA}.alt#input#r2`, 'edge id 与 core 规则一致');
    assert.deepEqual(edge.to, { uid: uidB, type: 'recipes', category: 'recipes', id: 'r2' });

    const nodeA = graph.nodes.find((n) => n.uid === uidA);
    assert.equal(nodeA.refCount, 1, 'refCount 应统计实际连线数');
  });

  it('声明方向与画布端口相反时，按声明还原 edge 朝向', () => {
    // warmup：来源声明 direction='output'（我指向别人），模板却把数值字段建成了 input 端口
    const base = makeContractNode();
    const declared = {
      ...base,
      uid: 'test-ns:recipes:r4',
      id: 'r4',
      props: base.props.map((p) =>
        p.name === 'warmup'
          ? {
              ...p,
              links: [
                { port: 'warmup', direction: 'output', targets: ['number'], multi: true, extract: null, plugin: 'warmup-plugin' },
              ],
            }
          : p
      ),
    };
    const entryA = registerNode(declared);
    const recipeA = core.nodeManager.addNodeFromData('recipes', entryA, 0, 0);
    core.nodeManager.addNode('number', 400, 0);
    const numberNode = core.nodeManager.getNode('2');

    const warmupProp = recipeA.detailProperties.find((p) => p.name === 'warmup');
    const numberOutput = numberNode.detailProperties.find((p) => p.outputPort);
    assert.ok(warmupProp?.inputPort, '模板把 warmup 建成了输入端口');
    assert.ok(numberOutput?.outputPort, 'number 节点应有输出端口');

    const conn = core.connectionManager.createProgrammaticConnection(
      numberNode,
      numberOutput.outputPort,
      recipeA,
      warmupProp.inputPort
    );
    assert.ok(conn, '连线应建立成功');

    const graph = nodesToContractGraph(core.nodeManager.nodes.values());
    assert.equal(graph.edges.length, 1);

    const edge = graph.edges[0];
    assert.equal(edge.out.uid, entryA.uid, 'warmup 声明 output → 出线端应是 recipeA（与画布方向相反）');
    assert.equal(edge.out.field, 'warmup');
    assert.equal(edge.out.port, 'output:warmup');
    assert.equal(edge.in.uid, numberNode.uid, '手工节点没有来源 uid 时才回退画布 uid');
    assert.equal(edge.in.port, 'link');
    assert.equal(edge.from.uid, entryA.uid, 'from = 引用关系本身（声明所在端）');
    assert.equal(edge.from.side, 'output');
    assert.deepEqual(edge.from.sources, ['warmup-plugin']);
  });

  it('inline 子节点产出 contains 边；无 mapping 声明的连线被跳过', () => {
    const host = registerNode(makeContractNode());
    const childEntry = registerNode({
      ...makeContractNode(),
      uid: 'test-ns:recipes:r5',
      id: 'r5',
      inline: {
        hostUid: host.uid,
        hostCategory: 'recipes',
        hostId: 'r1',
        field: 'slots',
        index: 0,
        syntheticId: false,
      },
    });
    const hostModel = core.nodeManager.addNodeFromData('recipes', host, 0, 0);
    const childModel = core.nodeManager.addNodeFromData('recipes', childEntry, 300, 0);
    assert.deepEqual(childModel.inline, childEntry.inline, '导入时 inline 元数据应留在节点模型上');

    // 两端都没声明的连线（如数值变量同步）→ 不是契约里的引用关系，导出时跳过
    core.nodeManager.addNode('number', 600, 0);
    const numberNode = core.nodeManager.getNode('3');
    const warmupInput = hostModel.detailProperties.find((p) => p.name === 'warmup');
    const numberOutput = numberNode.detailProperties.find((p) => p.outputPort);
    assert.ok(warmupInput?.inputPort && numberOutput?.outputPort);
    const conn = core.connectionManager.createProgrammaticConnection(
      numberNode,
      numberOutput.outputPort,
      hostModel,
      warmupInput.inputPort
    );
    assert.ok(conn, '连线应建立成功');

    const graph = nodesToContractGraph(core.nodeManager.nodes.values());
    console.log('[契约] contains 用例:', JSON.stringify({ edges: graph.edges, warnings: graph.warnings }, null, 2));
    const contains = graph.edges.filter((e) => e.kind === 'contains');
    assert.equal(contains.length, 1, '应产出一条 contains 边');
    assert.equal(contains[0].out.uid, host.uid);
    assert.equal(contains[0].out.port, 'output:slots');
    assert.equal(contains[0].in.uid, childEntry.uid, 'in.uid 用 core 的稳定 uid');
    assert.equal(contains[0].in.port, 'link');
    assert.equal(contains[0].targetId, 'r5');

    assert.equal(graph.edges.filter((e) => e.kind === 'link').length, 0, '无声明的连线不产出 link 边');
    assert.deepEqual(graph.warnings, [], '数据↔前端变量节点（文本 / 列表 / 字典）的值同步线是设计内的，不告警');
    assert.ok(
      graph.nodes.every((n) => 'inline' in n),
      '每个节点都带 inline 字段（根节点为 null）'
    );
  });

  it('数据↔数据的无声明连线才告警（带明细）', () => {
    const entryA = registerNode(makeContractNode());
    // number 类条目也注册进数据池 → 这个 number 节点算「数据节点」（不是手工变量节点）
    const entryN = registerNode({
      uid: 'test-ns:number:n1',
      id: 'n1',
      type: 'number',
      category: 'number',
      title: 'n1',
      source: 'mod',
      props: [],
      connections: [],
    });
    const recipeA = core.nodeManager.addNodeFromData('recipes', entryA, 0, 0);
    const numModel = core.nodeManager.addNodeFromData('number', entryN, 400, 0);

    const warmupProp = recipeA.detailProperties.find((p) => p.name === 'warmup');
    const numberOutput = numModel.detailProperties.find((p) => p.outputPort);
    assert.ok(warmupProp?.inputPort && numberOutput?.outputPort);
    const conn = core.connectionManager.createProgrammaticConnection(
      numModel,
      numberOutput.outputPort,
      recipeA,
      warmupProp.inputPort
    );
    assert.ok(conn, '连线应建立成功');

    const graph = nodesToContractGraph(core.nodeManager.nodes.values());
    assert.equal(graph.edges.filter((e) => e.kind === 'link').length, 0, '无声明的连线不产出 link 边');
    assert.equal(graph.warnings.length, 1, '数据↔数据缺声明应告警');
    assert.match(graph.warnings[0], /数据↔数据连线缺 mapping 声明/);
    assert.match(graph.warnings[0], /recipes:r1\.warmup → number:n1/, '告警要带明细');
  });

  it('数据池维护位置索引与文件清单（悬空端口跳转 / 三态排查用）', () => {
    registerNode(makeContractNode());

    const hit = ModDataRegistry.locate('recipes', 'r1');
    assert.ok(hit, 'locate 应命中已注册的条目');
    assert.equal(hit.file, 'recipes/test.json');
    assert.equal(hit.namespace, 'test-ns');
    assert.deepEqual(ModDataRegistry.filesOf('test-ns'), ['recipes/test.json']);
    assert.equal(ModDataRegistry.locate('recipes', 'nope'), null, '未注册的 id 应返回 null');

    ModDataRegistry.unregister('test-ns');
    assert.equal(ModDataRegistry.locate('recipes', 'r1'), null, '卸载后位置索引应清理');
    assert.deepEqual(ModDataRegistry.filesOf('test-ns'), []);
  });

  it('无数据来源的手工节点也能翻译（id 为空 / source = editor）', () => {
    core.nodeManager.addNode('number', 100, 100);
    const model = core.nodeManager.getNode('1');

    const back = nodeModelToContractNode(model);
    assert.equal(back.id, '');
    assert.equal(back.source, 'editor');
    assert.equal(back.type, 'number');
    assert.ok(Array.isArray(back.props));
    assert.ok(Array.isArray(back.connections));
  });
});
