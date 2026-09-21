import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';
import { graphToDataPool } from '../../frontend/src/dataContract.js';
import { ModDataRegistry } from '../../frontend/src/modDataRegistry.js';

/**
 * 悬空端口（文件外目标的占位节点）测试。
 *
 * 覆盖：
 *  - 契约 `external` → 按「目标类别 + 目标 id」合并（多宿主引用合成一条 + refs 累加）
 *  - 只给画布上已有宿主的引用建节点；只有端口、无属性
 *  - 幂等（重复 attach 不累积）、detach 清理、开关关闭时不建
 */

/** 一条带 `effects` 字段的 recipes 条目 */
function makeEntry() {
  return {
    uid: 'test-ns:recipes:r1',
    id: 'r1',
    type: 'recipes',
    category: 'recipes',
    title: 'r1',
    file: 'recipes/test.json',
    source: 'mod',
    props: [
      {
        name: 'effects',
        kind: 'dict',
        value: { lantern_legacy: 1 },
        links: [{ port: 'effects', direction: 'output', targets: ['elements'], multi: true, extract: 'map' }],
        materialize: null,
      },
    ],
  };
}

/** 契约里的一条「文件外节点」连接线（目标不在本次加载范围） */
function makeExternal(field = 'effects') {
  return {
    id: `test-ns:recipes:r1.${field}#output#lantern_legacy`,
    kind: 'link',
    from: {
      uid: 'test-ns:recipes:r1',
      type: 'recipes',
      category: 'recipes',
      id: 'r1',
      field,
      port: field,
      side: 'output',
      targets: ['elements'],
      extract: 'map',
      multi: true,
      sources: ['mapping'],
    },
    targetId: 'lantern_legacy',
    amount: 1,
    out: { uid: 'test-ns:recipes:r1', type: 'recipes', category: 'recipes', id: 'r1', field, side: 'output', port: `output:${field}` },
    in: { uid: null, side: 'input', port: 'link' },
    status: 'external-origin',
    to: null,
  };
}

/** 注册进数据池并返回池内条目 */
function register(entry, external = [], namespace = 'test-ns') {
  const pool = graphToDataPool({ namespace, source: 'mod', count: 1, nodes: [entry], edges: [], external });
  ModDataRegistry.register(pool);
  return pool.categories[entry.type][0];
}

describe('悬空端口（文件外目标的占位节点）', () => {
  let core;

  beforeEach(async () => {
    ({ core } = await createCore());
    ModDataRegistry.categories = {};
    ModDataRegistry.sources = {};
    ModDataRegistry.files = {};
    ModDataRegistry.externals = {};
    ModDataRegistry.index = new Map();
  });

  afterEach(() => {
    destroyCore(core);
  });

  it('契约 external → 按目标合并（多宿主引用合成一条 + refs 累加）', () => {
    const pool = graphToDataPool({
      namespace: 'test-ns',
      source: 'mod',
      count: 1,
      nodes: [makeEntry()],
      edges: [],
      external: [makeExternal('effects'), makeExternal('linked')],
    });

    assert.equal(pool.externals.length, 1, '同一目标只留一条');
    const item = pool.externals[0];
    assert.equal(item.key, 'elements:lantern_legacy', '按「目标类别:目标 id」做键');
    assert.equal(item.targetId, 'lantern_legacy');
    assert.equal(item.category, 'elements');
    assert.equal(item.status, 'external-origin');
    assert.deepEqual(
      item.refs.map((r) => r.field),
      ['effects', 'linked'],
      '两个宿主字段都记在 refs 里'
    );
  });

  it('集成：只给画布上的宿主建节点，幂等 + detach + 开关生效', () => {
    const entry = register(makeEntry(), [makeExternal()]);

    // 宿主还没上画布 → 不建（前端只负责当前页面）
    assert.deepEqual(core.attachDanglingPorts(), { created: 0, linked: 0, skipped: 0 });

    const host = core.nodeManager.addNodeFromData('recipes', entry, 0, 0);
    assert.ok(host);

    // 开关关闭 → 不建
    core.setting.showDanglingPorts = false;
    assert.deepEqual(core.attachDanglingPorts(), { created: 0, linked: 0, skipped: 0 });
    assert.equal(core.nodeManager.nodes.size, 1);

    core.setting.showDanglingPorts = true;
    const stats = core.attachDanglingPorts();
    assert.equal(stats.created, 1);
    assert.equal(stats.linked, 1, '宿主字段端口应与悬空端口连上');
    assert.equal(core.nodeManager.nodes.size, 2);

    const dangling = Array.from(core.nodeManager.nodes.values()).find((n) => n.type === 'danglingPort');
    assert.ok(dangling, '应建出 danglingPort 节点');
    assert.equal(dangling.title, 'lantern_legacy');
    assert.ok(
      dangling.detailProperties.length > 0 && dangling.detailProperties.every((p) => p.type === 'port'),
      '只有端口：没有任何值属性'
    );
    assert.equal(dangling.danglingRefs.length, 1);
    assert.equal(dangling.danglingStatus, 'external-origin');
    assert.equal(core.connectionManager.connections.size, 1);

    // 幂等
    core.attachDanglingPorts();
    assert.equal(core.nodeManager.nodes.size, 2, '重复 attach 不应累积');
    assert.equal(core.connectionManager.connections.size, 1);

    assert.equal(core.detachDanglingPorts(), 1);
    assert.equal(core.nodeManager.nodes.size, 1);
    assert.equal(core.connectionManager.connections.size, 0, '连线随节点一起清理');
  });
});
