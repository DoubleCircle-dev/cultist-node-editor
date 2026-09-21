import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';
import { PortProp } from '../../frontend/src/models/propModels/portProp.js';

/**
 * 引用副本（`ref`）测试
 *
 * 覆盖：创建副本（复制端口 / 纯端口 / refProxy / reverse 透传）、副本端口连线**落在原节点**上、
 * 受保护来源（origin / 其他 mod）拦截与报错、原节点被删后的兜底、删除副本不影响原节点。
 */

describe('引用副本（ref）', () => {
  let core;

  beforeEach(async () => {
    ({ core } = await createCore());
  });

  afterEach(() => {
    destroyCore(core);
  });

  /** 建节点并返回模型（`addNode` 不返回模型） */
  function addNode(type, x, y) {
    core.nodeManager.addNode(type, x, y);
    return core.nodes[core.nodes.length - 1];
  }

  /** 某个 hub 里的端口属性 */
  function portsOf(hub) {
    return (hub && hub.properties ? hub.properties : []).filter((prop) => prop && prop.type === 'port');
  }

  /**
   * 递归收集节点上的**全部**端口（含属性列表里直接声明的、嵌套 hub 里的、
   * 「可变属性」（modeProperties）hub 里的、扩展属性 hub 里的）
   */
  function allPorts(node) {
    const found = [];
    const walk = (props) => {
      (props || []).forEach((prop) => {
        if (!prop) return;
        if (prop.type === 'hub') {
          walk(prop.properties);
          return;
        }
        if (prop.type === 'port') found.push(prop);
      });
    };
    walk(node.properties);
    return found;
  }

  /** 端口方向：有 outputPort 而没有 inputPort → 输出 */
  function sideOf(prop) {
    return prop.outputPort && !prop.inputPort ? 'output' : 'input';
  }

  /** 源节点某一侧的全部端口名（副本应当与它一致） */
  function sourcePortNames(node, side) {
    return allPorts(node)
      .filter((prop) => sideOf(prop) === side)
      .map((prop) => prop.name);
  }

  /** 切换副本属性区排布（`copy` = 按原节点复制 / `spread` = 端口集中到两侧） */
  function setLayout(layout) {
    core.setting.refPropertyLayout = layout;
  }

  /** 副本上某个名字的端口（两种排布都能找：贴边的在 inputs / outputs，留在属性区的在属性树里） */
  function refPortByName(ref, name) {
    return allPorts(ref).find((prop) => prop.name === name);
  }

  /** 端口**模型**（拖拽 / 连线链路里传的就是它，不是 PortProp） */
  function dotOf(hub, index = 0) {
    const prop = portsOf(hub)[index];
    return prop ? prop.outputPort || prop.inputPort : null;
  }

  it('创建副本（端口集中到两侧）：端口按名字复制成纯端口（带 refProxy、reverse 透传），并记进 refNodes', () => {
    setLayout('spread');
    const src = addNode('test', 100, 100);
    const srcOut = portsOf(src.outputs)[0];
    const srcIn = portsOf(src.inputs)[0];
    assert.ok(srcOut && srcIn, '测试节点自带端口');
    srcOut.reverse = true; // 模拟 `recipes.alt` 这种反向记录端口

    const ref = core.createRefNode(String(src.id));
    assert.ok(ref, '应建出副本');
    assert.equal(ref.type, 'ref');
    assert.equal(core.refSourceOf(String(ref.id)), String(src.id));
    assert.match(ref.title, /（引用）$/);

    assert.deepEqual(portsOf(ref.outputs).map((p) => p.name), sourcePortNames(src, 'output'), '副本输出端口 = 源节点全部输出端口');
    assert.deepEqual(portsOf(ref.inputs).map((p) => p.name), sourcePortNames(src, 'input'), '副本输入端口 = 源节点全部输入端口（含嵌套 hub 里的）');

    portsOf(ref.outputs).forEach((prop) => {
      assert.equal(prop.valueType, '', '副本端口是纯端口 → 内部没有值输入框（不可编辑）');
      assert.equal(prop.refProxy.nodeId, String(src.id), '带 refProxy 指回源节点');
      assert.equal(prop.refProxy.side, 'output');
    });
    assert.equal(portsOf(ref.outputs)[0].reverse, true, 'reverse（反向记录）要一并复制');

    // 容器与副本自身都不能再产生副本
    const frame = core.mergeToContainer([String(addNode('test', 900, 100).id)]);
    assert.equal(core.createRefNode(String(frame.id)), null, '容器节点不支持引用副本');
    assert.equal(core.createRefNode(String(ref.id)), null, '副本不再生成第二层副本');
  });

  it('创建副本（默认：按原节点复制）：hub 结构、可变属性分组、端口位置都照搬（只读）', () => {
    const src = addNode('recipes', 100, 100);
    const srcHubs = (src.properties || []).filter((prop) => prop && prop.type === 'hub' && prop !== src.portHub);
    assert.ok(srcHubs.length > 0, '前提：recipes 节点有嵌套 hub（要求 / 扩展属性…）');

    const ref = core.createRefNode(String(src.id));

    // 1) hub 结构照搬：嵌套 hub 在副本上也是 hub（里面的端口跟着留在 hub 里）
    const refHubs = (ref.properties || []).filter((prop) => prop && prop.type === 'hub' && prop !== ref.portHub);
    assert.deepEqual(
      refHubs.map((hub) => hub.label),
      srcHubs.map((hub) => hub.label),
      '副本的 hub 分组 = 源节点的 hub 分组'
    );

    // 2) 顶层 inputs / outputs 的端口仍然摆到左右两侧（和源节点一样）
    assert.deepEqual(portsOf(ref.outputs).map((p) => p.name), portsOf(src.outputs).map((p) => p.name));
    assert.deepEqual(portsOf(ref.inputs).map((p) => p.name), portsOf(src.inputs).map((p) => p.name));

    // 3) 属性区里的端口留在原位（不去两侧、也不加分组前缀）
    const inline = allPorts(ref).find(
      (prop) => !portsOf(ref.inputs).includes(prop) && !portsOf(ref.outputs).includes(prop)
    );
    assert.ok(inline, '属性区 / 嵌套 hub 里的端口也要镜像（留在原处）');
    assert.equal(inline.label.includes('·'), false, '按原节点复制 → 端口标签不加分组前缀');
    assert.notEqual(inline.layout, undefined, '端口 layout 照搬（所以它还在原位置）');

    // 端口依旧是纯端口（不可编辑）+ 带精确回指
    allPorts(ref).forEach((prop) => {
      assert.equal(prop.valueType, '', '副本端口是纯端口（不可编辑）');
      assert.ok(prop.refProxy && prop.refProxy.propId, '带 refProxy.propId 精确回指源端口');
    });
  });

  it('副本端口连线：记录落在**原节点**端口上（数据里不出现副本）', () => {
    const src = addNode('test', 100, 100);
    const dst = addNode('test', 900, 100);
    const ref = core.createRefNode(String(src.id));

    const refPort = dotOf(ref.outputs);
    const dstPort = dotOf(dst.inputs);
    const resolved = core.resolveRefPort(ref, refPort);
    assert.equal(String(resolved.node.id), String(src.id), '副本端口解析到原节点端口');
    assert.equal(resolved.port.name, refPort.name, '按名字对齐到原节点的同名端口');

    // 走一遍真实的连线收尾流程（等价于拖拽松手那一步）
    const cm = core.connectionManager;
    cm.startNode = ref;
    cm.startPort = refPort;
    cm.targetNode = dst;
    cm.targetPort = dstPort;
    cm.dragState.canConnectToTarget = true;
    cm.tryCreateConnection();

    const conns = [...cm.connections.values()];
    assert.equal(conns.length, 1, '应建立一条连线');
    assert.equal(String(conns[0].fromNodeId), String(src.id), '起点是原节点，不是副本');
    assert.equal(String(conns[0].toNodeId), String(dst.id));
    assert.ok(
      ![...core.nodes].some((node) => node.type === 'ref' && String(node.id) === String(conns[0].fromNodeId)),
      '数据里不出现副本'
    );
  });

  it('受保护来源：书写端是 origin / 其他 mod 时拒绝，并给出可读原因', () => {
    const src = addNode('test', 100, 100);
    const dst = addNode('test', 900, 100);
    const ref = core.createRefNode(String(src.id));
    const refPort = dotOf(ref.outputs);
    const dstPort = dotOf(dst.inputs);

    // origin 数据只读
    src.source = 'origin';
    const blocked = core.checkConnectionAllowed(ref, refPort, dst, dstPort);
    assert.equal(blocked.ok, false, '书写端是 origin → 拒绝');
    assert.match(blocked.reason, /origin/);
    assert.equal(String(blocked.from.node.id), String(src.id), '仍返回解析后的两端');

    // 其他 mod 也只读（当前编辑命名空间不同）
    src.source = 'mod';
    src.uid = 'othermod:recipes:r1';
    core.editingNamespace = 'mymod';
    assert.equal(core.checkConnectionAllowed(ref, refPort, dst, dstPort).ok, false, '其他 mod → 拒绝');

    // 自己 mod 的数据可写
    src.uid = 'mymod:recipes:r1';
    assert.equal(core.checkConnectionAllowed(ref, refPort, dst, dstPort).ok, true, '本 mod → 放行');

    // 错误提示要落到状态栏
    const notices = [];
    core.bus.on('status:message', (e) => notices.push(e.detail.text));
    core.reportBlockedConnection(blocked.reason);
    assert.match(notices[notices.length - 1], /⛔/);
  });

  it('受保护来源：reverse 端口的语义主体在**对端**，对端只读也要拒绝', () => {
    const a = addNode('test', 100, 100);
    const b = addNode('test', 900, 100);
    const altProp = portsOf(a.outputs)[0];
    altProp.reverse = true; // 模拟 `recipes.alt`：列表写在 a 上、判定在 b 上（reverse 存在端口属性上）
    const altPort = altProp.outputPort;
    const bPort = dotOf(b.inputs);

    // b 是 origin → 语义主体在对端且只读 → 拒绝（这正是「alt 会动到被引用 recipe」的情形）
    b.source = 'origin';
    const verdict = core.checkConnectionAllowed(a, altPort, b, bPort);
    assert.equal(verdict.ok, false, 'reverse 端口 + 对端 origin → 拒绝');
    assert.match(verdict.reason, /origin/);

    // 对端改成本 mod 的数据 → 放行
    b.source = 'mod';
    b.uid = 'mymod:recipes:b';
    core.editingNamespace = 'mymod';
    assert.equal(core.checkConnectionAllowed(a, altPort, b, bPort).ok, true);
  });

  it('原节点被删后，副本端口不能再连（否则线会记在副本上，污染数据）', () => {
    const src = addNode('test', 100, 100);
    const dst = addNode('test', 900, 100);
    const ref = core.createRefNode(String(src.id));
    const refPort = dotOf(ref.outputs);

    core.nodeManager.deleteNode(String(src.id));
    const verdict = core.checkConnectionAllowed(ref, refPort, dst, dotOf(dst.inputs));
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason, /原节点/);
  });

  it('删除引用副本：原节点与连在原节点上的线都不受影响', () => {    const src = addNode('test', 100, 100);
    const dst = addNode('test', 900, 100);
    const ref = core.createRefNode(String(src.id));

    const cm = core.connectionManager;
    cm.startNode = ref;
    cm.startPort = dotOf(ref.outputs);
    cm.targetNode = dst;
    cm.targetPort = dotOf(dst.inputs);
    cm.dragState.canConnectToTarget = true;
    cm.tryCreateConnection();
    assert.equal(cm.connections.size, 1);

    assert.equal(core.removeRefNode(String(ref.id)), true, '应删掉副本');
    assert.equal(core.refSourceOf(String(ref.id)), null, '记账已清');
    assert.ok(core.nodeManager.nodes.has(String(src.id)), '原节点还在');
    assert.ok(core.nodeManager.nodes.has(String(dst.id)), '目标节点还在');
    assert.equal(cm.connections.size, 1, '连线不受影响（它本来就记在原节点上）');
    assert.equal(core.removeRefNode(String(ref.id)), false, '重复删除无效果');
  });

  it('刷新恢复：refNodes 记账存 localStorage，恢复后副本仍能对上原节点（按端口名回退）', () => {
    const src = addNode('test', 100, 100);
    const ref = core.createRefNode(String(src.id));
    const refPort = dotOf(ref.outputs);
    assert.equal(core.restoreRefNodes(), 1, '创建副本时就把记账写进了 localStorage');

    // 模拟「刷新」：清掉内存记账（端口上的 refProxy 也不该被依赖），再恢复
    refPort.parentProp.refProxy = null;
    core.refNodes.clear();
    assert.equal(core.refSourceOf(String(ref.id)), null);

    const restored = core.restoreRefNodes();
    assert.equal(restored, 1, '应从 localStorage 恢复一条记账');
    assert.equal(core.refSourceOf(String(ref.id)), String(src.id), '副本重新认出原节点');

    const resolved = core.resolveRefPort(ref, refPort);
    assert.equal(String(resolved.node.id), String(src.id), '没有 refProxy 时按「记账 + 端口名 + 方向」回退解析');
    assert.equal(resolved.port.name, refPort.name);
  });

  it('副本要能“看到内容 + 拉出线”：端口渲染出来，属性是可改不了的只读预览', () => {
    const src = addNode('test', 100, 100);
    const ref = core.createRefNode(String(src.id));
    const el = core.nodeManager.nodeViews.get(String(ref.id)).element;

    // 连接能力：端口必须真的渲染出来（否则用户看到的是个空壳、拖不出线）
    const dots = [...el.querySelectorAll('.port-dot')];
    assert.ok(dots.length > 0, '副本端口要渲染出来');
    assert.equal(dots.length, allPorts(ref).length, '端口点数与副本端口属性数一致');

    // 节点预览：能看到源节点的内容，但改不了（滑杆 / 单选 / 下拉这类 readOnly 管不住的也要禁）
    const previewControls = [...el.querySelectorAll('.node-properties input, .node-properties textarea')];
    assert.ok(previewControls.length > 0, '要有内容预览（属性行）');
    assert.ok(
      previewControls.every((item) => item.readOnly || item.disabled),
      '预览控件必须是只读的（引用副本不可编辑）'
    );
    const sliders = [...el.querySelectorAll('.node-properties input[type="range"]')];
    const radios = [...el.querySelectorAll('.node-properties input[type="radio"]')];
    const selects = [...el.querySelectorAll('.node-properties select')];
    assert.ok(
      [...sliders, ...radios, ...selects].every((item) => item.disabled),
      '滑杆 / 单选 / 下拉必须 disabled（readOnly 对它们无效）'
    );

    // 锁只读时不能把端口一起锁了
    assert.ok(
      dots.every((dot) => { const btn = dot.closest('button'); return !btn || !btn.disabled; }),
      '端口不能被连带禁用（否则拉不出线）'
    );
  });

  it('副本端口跟随源节点：源端口结构变了能重建（幂等）', () => {
    const src = addNode('test', 100, 100);
    const ref = core.createRefNode(String(src.id));
    const before = portsOf(ref.outputs).length;

    // 源节点新增一个输出端口（模拟属性档位 / 扩展属性变化）
    src.outputs.addProp(
      new PortProp(`${src.id}:output-extra`, '额外输出', 'port', '', {
        name: 'extraOut',
        layout: 'no-left',
        outputPort: { id: `${src.id}:output_port-extra`, dataType: 'any', maxLinks: Infinity },
      })
    );

    assert.equal(core.refreshRefNodesOf(String(src.id)), 1, '应刷新一个副本');
    assert.equal(portsOf(ref.outputs).length, before + 1, '副本端口跟随源节点');
    assert.ok(portsOf(ref.outputs).some((p) => p.name === 'extraOut'), '新端口也复制过来了');

    // 幂等：再刷一次不会重复堆积
    core.refreshRefNodesOf(String(src.id));
    assert.equal(portsOf(ref.outputs).length, before + 1);
  });

  it('「可变属性」（模式）里的端口也要镜像：能找得到、精确回指源端口、能拉线', () => {
    // elements 卡牌模式的可变属性里全是端口：性相 / 卡槽 / 触发器 / 消逝转化…
    const src = addNode('elements', 100, 100);
    const srcPorts = allPorts(src);
    const aspect = srcPorts.find((p) => p.name === 'aspects');
    assert.ok(aspect, '前提：elements 节点的可变属性里有 aspects 端口');

    // 默认（按原节点复制）：端口留在可变属性分组里
    const ref = core.createRefNode(String(src.id));
    const mirrored = refPortByName(ref, 'aspects');
    assert.ok(mirrored, '可变属性里的端口要出现在副本上（以前只镜像 inputs / outputs，这里全丢）');
    assert.equal(mirrored.valueType, '', '副本端口是纯端口（不可编辑）');
    assert.equal(String(mirrored.refProxy.propId), String(aspect.id), 'refProxy 精确回指源端口');

    // 端口集中到两侧的排布：同一批端口收到副本左右两侧，标签带上分组名
    setLayout('spread');
    const spreadRef = core.createRefNode(String(src.id), { x: 900, y: 100 });
    const spreadAspect = portsOf(spreadRef.inputs).find((p) => p.name === 'aspects');
    assert.ok(spreadAspect, '端口集中排布下，可变属性里的端口收到副本的输入侧');
    assert.match(spreadAspect.label, /·/, '带上所在 hub 的名字（看出是哪一组）');

    // 精确回指：解析到的是源节点那个端口模型（同名端口再多也不会认错）
    const resolved = core.resolveRefPort(ref, mirrored.inputPort);
    assert.equal(String(resolved.node.id), String(src.id));
    assert.equal(resolved.port.id, aspect.inputPort.id);

    // 拉线：从别的输出端口连到副本上的这个可变属性端口 → 记录落在**原节点**
    const other = addNode('elements', 1600, 100);
    const cm = core.connectionManager;
    cm.startNode = other;
    cm.startPort = dotOf(other.outputs);
    cm.targetNode = ref;
    cm.targetPort = mirrored.inputPort;
    cm.dragState.canConnectToTarget = true;
    cm.tryCreateConnection();
    const conns = [...cm.connections.values()];
    assert.equal(conns.length, 1, '应建立一条连线');
    assert.equal(String(conns[0].toNodeId), String(src.id), '终点是原节点，不是副本');
    assert.ok(![...core.nodes].some((node) => node.type === 'ref' && String(node.id) === String(conns[0].toNodeId)));
  });

  it('连不上的端口不渲染：容量满了的在副本上消失，断开后又回来', () => {
    const src = addNode('test', 100, 100);
    const dst = addNode('test', 900, 100);
    const single = allPorts(src).find((p) => p.inputPort && p.inputPort.maxLinks === 1);
    assert.ok(single, '前提：测试节点有单连接端口');

    const ref = core.createRefNode(String(src.id));
    assert.ok(refPortByName(ref, single.name), '还能连的端口 → 正常渲染');

    // 用真实连线把它占满（单连接端口只能接一条）
    const cm = core.connectionManager;
    cm.startNode = dst;
    cm.startPort = dotOf(dst.outputs);
    cm.targetNode = src;
    cm.targetPort = single.inputPort;
    cm.dragState.canConnectToTarget = true;
    cm.tryCreateConnection();
    assert.equal(cm.connections.size, 1, '应建立一条连线');
    assert.equal(
      refPortByName(ref, single.name),
      undefined,
      '容量满了 → 副本上不再渲染这个端口（留着也拉不出线）'
    );

    // 断开 → 端口回来（连线增删会顺手刷新副本）
    cm.deleteConnections([...cm.connections.keys()]);
    assert.ok(refPortByName(ref, single.name), '断开后端口又回来了');
  });

  it('受保护来源（origin）：连不上的方向不渲染端口，能连的方向留着', () => {
    const src = addNode('recipes', 100, 100);
    src.source = 'origin'; // 随游戏本体，只读

    const ref = core.createRefNode(String(src.id));
    const mirrored = allPorts(ref);
    assert.ok(mirrored.length > 0, '输入端口仍然能连（线写在对端节点上，指向 origin 合法）→ 要保留');
    assert.equal(
      mirrored.some((prop) => sideOf(prop) === 'output'),
      false,
      'origin 的输出端口不渲染（线会记在它身上，必被拦）'
    );
    mirrored.forEach((prop) => {
      assert.equal(sideOf(prop), 'input');
      assert.notEqual(prop.reverse, true, 'reverse 输入端口语义主体在对端（= origin）→ 也不该渲染');
    });
  });

  it('可变属性（模式）切换：副本的端口与预览自动跟着换成新那一组', () => {
    const src = addNode('elements', 100, 100);
    const ref = core.createRefNode(String(src.id));

    // 模式开关按原样镜像成只读下拉框（选项带过来了，不是空的禁用下拉）
    const modeProp = () => allPorts(ref).length && (ref.detailProperties || []).find((p) => p.type === 'select');
    const modeSelect = () => modeProp();
    assert.ok(modeSelect(), '模式开关要镜像出来');
    assert.deepEqual(modeSelect().config.opts, ['卡牌', '性相'], '下拉选项要带过来');
    assert.equal(modeSelect().value, '卡牌', '显示当前那一组可变属性的名字');
    assert.ok(refPortByName(ref, 'aspects'), '卡牌模式的可变属性端口在副本上');

    // 切到「性相」模式：源节点自己 emit（等价于用户在下拉框里改）→ 副本应自动重建
    assert.notEqual(src.switchMode('性相'), false, '前提：能切到性相模式');
    src.emit('update:mode', { mode: '性相' });

    assert.deepEqual(portsOf(ref.inputs).map((p) => p.name), portsOf(src.inputs).map((p) => p.name), '副本输入端口跟着换');
    assert.deepEqual(portsOf(ref.outputs).map((p) => p.name), portsOf(src.outputs).map((p) => p.name), '副本输出端口跟着换');
    assert.equal(modeSelect().value, '性相', '预览里的模式名也换了');
    assert.equal(
      allPorts(ref).some((p) => p.name === 'aspects'),
      false,
      '上一组可变属性的端口不该留着'
    );
  });

  it('副本端口行不能被只读锁禁用（端口按钮要能点、能拖）', () => {
    const src = addNode('elements', 100, 100);
    const ref = core.createRefNode(String(src.id));
    const el = core.nodeManager.nodeViews.get(String(ref.id)).element;

    const portButtons = [...el.querySelectorAll('.prop-row.type-port button')];
    assert.ok(portButtons.length > 0, '副本上有端口按钮');
    assert.ok(
      portButtons.every((btn) => !btn.disabled),
      '端口按钮不能被只读锁禁用（否则副本就拉不出线了）'
    );
  });

  it('引用副本不占 id 序列：用 ref:<n> 标识；标题栏有 ⌖ 按钮；预览首行写明引用自谁', () => {    const src = addNode('test', 100, 100);
    const nextIdBefore = core.nodeManager.idGenerator.nextId;
    const ref = core.createRefNode(String(src.id));

    assert.match(String(ref.id), /^ref:\d+$/, '辅助节点用 ref:<n> 标识，不占 id 序列');
    assert.equal(String(ref.uid), String(ref.id), 'uid 与模型 key 一致（前端记账用它）');
    assert.equal(core.nodeManager.idGenerator.nextId, nextIdBefore, '没有消耗 id 位图');

    // 数据节点照旧拿数字 id（不受影响）
    const data = addNode('test', 900, 100);
    assert.match(String(data.id), /^\d+$/, '数据节点仍是数字 id');

    // 标题栏 ⌖ 按钮
    const el = core.nodeManager.nodeViews.get(String(ref.id)).element;
    assert.ok(el.querySelector('.node-ref-focus'), '标题栏要有 ⌖ 定位按钮');

    // 预览首行写明引用自谁
    const info = (ref.properties || []).find((p) => String(p.id).includes('refSource'));
    assert.ok(info, '预览里有「引用自」说明行');
    assert.match(String(info.value), new RegExp(`uid ${src.uid}`), '写明了源节点 uid');
    assert.match(String(info.value), new RegExp(String(src.id)), '写明了源节点 id');
    assert.equal(info.readonly, true, '说明行只读');
  });

  it('点 ⌖ 跳到原节点：ref:focus → focusNode(源节点)', () => {
    const src = addNode('test', 100, 100);
    const ref = core.createRefNode(String(src.id));
    const el = core.nodeManager.nodeViews.get(String(ref.id)).element;

    let focused = null;
    const origFocus = core.focusNode.bind(core);
    core.focusNode = (/** @type {any} */ id) => {
      focused = String(id);
      return origFocus(id);
    };
    el.querySelector('.node-ref-focus').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(focused, String(src.id), '应聚焦到源节点');
    core.focusNode = origFocus;

    // 源节点被删 → 提示而不是报错
    core.nodeManager.deleteNode(String(src.id));
    const notices = [];
    core.bus.on('status:message', (e) => notices.push(e.detail.text));
    el.querySelector('.node-ref-focus').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.match(notices[notices.length - 1], /原节点已不在画布上/);
  });
});
