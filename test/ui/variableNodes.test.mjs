import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';
import { graphToDataPool } from '../../frontend/src/dataContract.js';
import { ModDataRegistry } from '../../frontend/src/modDataRegistry.js';
import { collectVariableFields, rowsAndColumns } from '../../frontend/src/variableNodes.js';

/**
 * 「额外解析」（设置 extraParseListVariables）测试：字段值 → 列表 / 字典变量节点（`table` / `list`）+ 连线。
 *
 * 覆盖：
 *  - 纯逻辑：哪些字段该解析（kind / 有端口 / 条目数门槛）、行列怎么算
 *  - 集成：attachVariableNodes 建节点并连线、幂等（重复 attach 不累积）、detachVariableNodes 清理
 *  - 开关关闭时不动画布
 */

/** 一条带 dict / list 字段的 recipes 条目（`effects` 3 键、`linked` 3 项、`alt` 只有 1 项） */
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
      { name: 'warmup', kind: 'number', value: 30, links: [], materialize: null },
      {
        name: 'effects',
        kind: 'dict',
        value: { lantern: 1, forge: 2, winter: 3 },
        links: [{ port: 'effects', direction: 'output', targets: ['elements'], multi: true, extract: 'map' }],
        materialize: null,
      },
      {
        name: 'linked',
        kind: 'list',
        value: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        links: [{ port: 'linked', direction: 'output', targets: ['recipes'], multi: true, extract: 'id-list' }],
        materialize: null,
      },
      {
        name: 'alt',
        kind: 'list',
        value: [{ id: 'x' }],
        links: [{ port: 'alt', direction: 'input', targets: ['recipes'], multi: true, extract: 'id-list' }],
        materialize: null,
      },
    ],
  };
}

/** 注册进数据池并返回池内条目 */
function register(entry, namespace = 'test-ns') {
  const pool = graphToDataPool({ namespace, source: 'mod', count: 1, nodes: [entry], edges: [] });
  ModDataRegistry.register(pool);
  return pool.categories[entry.type][0];
}

describe('额外解析：字段 → 列表 / 字典变量节点（table / list）', () => {
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

  it('纯逻辑：只挑「有端口 + 条目数够」的 list / dict 字段', () => {
    const entry = register(makeEntry());
    const fields = collectVariableFields(entry);

    assert.deepEqual(
      fields.map((f) => `${f.name}:${f.kind}`),
      ['effects:table', 'linked:list'],
      'warmup（number）与 alt（只有 1 项）不该被解析'
    );
    assert.equal(fields[0].rows.length, 3, 'dict → 一行一个键值对');
    assert.deepEqual(fields[0].columns.map((c) => c.field), ['key', 'value']);
    assert.deepEqual(fields[1].columns.map((c) => c.field), ['id'], '对象数组 → 列 = 元素字段并集');
    assert.equal(fields[1].rows[0].id, 'a');
  });

  it('行列换算：dict 两列、标量数组单列、对象数组按字段展开', () => {
    assert.deepEqual(rowsAndColumns('dict', { a: 1, b: { c: 2 } }).rows, [
      { key: 'a', value: '1' },
      { key: 'b', value: '{"c":2}' },
    ]);
    assert.deepEqual(rowsAndColumns('list', ['x', 2]).columns.map((c) => c.field), ['value']);
    assert.deepEqual(rowsAndColumns('list', [{ a: 1, b: 2 }]).columns.map((c) => c.field), ['a', 'b']);
  });

  it('集成：开关打开 → 建变量节点并连线；重复 attach 不累积；detach 清理', () => {
    const entry = register(makeEntry());
    const host = core.nodeManager.addNodeFromData('recipes', entry, 0, 0);
    assert.ok(host);

    // 开关关闭：不动画布
    core.setting.extraParseListVariables = false;
    assert.deepEqual(core.attachVariableNodes(), { created: 0, linked: 0, skipped: 0 });
    assert.equal(core.nodeManager.nodes.size, 1);

    core.setting.extraParseListVariables = true;
    const stats = core.attachVariableNodes();
    assert.equal(stats.created, 2, 'effects + linked 各一个变量节点');
    assert.equal(stats.linked, 2, '两个都应与宿主连线');
    assert.equal(core.nodeManager.nodes.size, 3);

    const tools = Array.from(core.nodeManager.nodes.values()).filter((n) => n.type === 'table' || n.type === 'list');
    assert.deepEqual(tools.map((n) => n.type).sort(), ['list', 'table']);
    assert.equal(core.connectionManager.connections.size, 2, '变量节点与宿主字段端口相连');

    // 幂等：再 attach 一次，数量不变
    core.attachVariableNodes();
    assert.equal(core.nodeManager.nodes.size, 3, '重复解析不应累积节点');
    assert.equal(core.connectionManager.connections.size, 2);

    assert.equal(core.detachVariableNodes(), 2);
    assert.equal(core.nodeManager.nodes.size, 1, 'detach 后只剩宿主节点');
    assert.equal(core.connectionManager.connections.size, 0, '连线应随变量节点一起清理');
  });
});
