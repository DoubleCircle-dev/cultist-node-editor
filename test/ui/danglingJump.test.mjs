import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';
import { graphToDataPool } from '../../frontend/src/dataContract.js';
import { ModDataRegistry } from '../../frontend/src/modDataRegistry.js';

/**
 * 悬空端口跳转（P3）测试：前端数据内定位 + 三态排查。
 *
 * 三种落点：canvas（已在当前画布）/ laid（已加载但没铺图 → 就地铺出）/ 未命中 → not-loaded | missing | inconsistent
 */

/** 一条 recipes 条目（用来当跳转目标） */
function makeEntry() {
  return {
    uid: 'test-ns:recipes:r1',
    id: 'r1',
    type: 'recipes',
    category: 'recipes',
    title: 'r1',
    file: 'recipes/test.json',
    source: 'mod',
    props: [{ name: 'warmup', kind: 'number', value: 30, links: [], materialize: null }],
  };
}

/** 注册进数据池（source='mod'） */
function register(entry, namespace = 'test-ns') {
  const pool = graphToDataPool({ namespace, source: 'mod', count: 1, nodes: [entry], edges: [] });
  ModDataRegistry.register(pool);
  return pool.categories[entry.type][0];
}

describe('悬空端口跳转（前端数据内定位 + 三态排查）', () => {
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

  it('目标已在当前画布 → 聚焦（reason=canvas）', () => {
    const entry = register(makeEntry());
    const host = core.nodeManager.addNodeFromData('recipes', entry, 0, 0);

    const res = core.jumpToTarget('recipes', 'r1');
    assert.equal(res.ok, true);
    assert.equal(res.reason, 'canvas');
    assert.equal(res.nodeId, host.id);
  });

  it('已加载但没铺图 → 就地在当前页铺出并聚焦（reason=laid）', () => {
    register(makeEntry());
    assert.equal(core.nodeManager.nodes.size, 0);

    const res = core.jumpToTarget('recipes', 'r1');
    assert.equal(res.ok, true);
    assert.equal(res.reason, 'laid');
    assert.equal(core.nodeManager.nodes.size, 1, '应把目标铺出来');
    assert.match(res.message, /已铺出目标/);
  });

  it('未命中：没加载过 mod → not-loaded；加载过 mod → missing', () => {
    let res = core.jumpToTarget('elements', 'lantern_legacy');
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not-loaded');
    assert.match(res.message, /mod 还未加载完整/);

    register(makeEntry()); // 注册后 source='mod'（加载过 mod）
    res = core.jumpToTarget('elements', 'lantern_legacy');
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'missing');
    assert.match(res.message, /引用不存在/);
  });

  it('目标 id 为空 → inconsistent（并提示无法跳转）', () => {
    const res = core.jumpToTarget('elements', '');
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'inconsistent');
    assert.match(res.message, /没有目标 id/);
  });

  it('状态栏提示会通过 bus 事件发出', () => {
    const messages = [];
    core.bus.on('status:message', (e) => messages.push(e.detail.text));

    register(makeEntry());
    core.jumpToTarget('recipes', 'r1');
    assert.equal(messages.length, 1);
    assert.match(messages[0], /已铺出目标/);
  });
});
