import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';
import { graphToDataPool } from '../../frontend/src/dataContract.js';
import { ModDataRegistry } from '../../frontend/src/modDataRegistry.js';

/**
 * 转发端口测试：把成员节点的端口暴露到容器节点上，可增可删、可持久化。
 *
 * ⚠️ 目前只覆盖「显示 / 增删 / 快照」；外部连线与内部端口的自动镜像（透传）尚未实现。
 */

function makeHost() {
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

function makeChild() {
  return {
    uid: 'test-ns:text:c1',
    id: 'c1',
    type: 'text',
    category: 'text',
    title: 'c1',
    file: 'recipes/test.json',
    source: 'mod',
    inline: {
      hostUid: 'test-ns:recipes:r1',
      hostCategory: 'recipes',
      hostId: 'r1',
      field: 'startdescription',
      index: 0,
      syntheticId: true,
    },
    props: [],
  };
}

function register(entry, namespace = 'test-ns') {
  const pool = graphToDataPool({ namespace, source: 'mod', count: 1, nodes: [entry], edges: [] });
  ModDataRegistry.register(pool);
  return pool.categories[entry.type][0];
}

describe('容器节点：转发端口（增 / 删 / 持久化）', () => {
  let core;

  beforeEach(async () => {
    ({ core } = await createCore());
    ModDataRegistry.categories = {};
    ModDataRegistry.sources = {};
    ModDataRegistry.files = {};
    ModDataRegistry.externals = {};
    ModDataRegistry.index = new Map();
    localStorage.clear();
  });

  afterEach(() => {
    destroyCore(core);
  });

  /** 建一个容器（把几个普通节点合并进去） */
  function setup() {
    core.nodeManager.addNode('test', 0, 0);
    core.nodeManager.addNode('test', 400, 0);
    const [first, second] = core.nodes;
    const frame = core.mergeToContainer([first.id, second.id]);
    return { host: frame, child: second };
  }

  it('增加转发端口：容器上出现 forward 端口，收起态也—直显示', () => {
    const { host } = setup();

    const entry = core.addForwardPort(host.id, { side: 'input', name: 'startdescription', label: '起始描述' });
    assert.ok(entry, '应加成功');
    assert.equal(entry.key, 'input:startdescription');
    assert.deepEqual(core.listForwardPorts(host.id).map((p) => p.key), ['input:startdescription']);

    const forwardProp = host.detailProperties.find((p) => p && p.forward);
    assert.ok(forwardProp, '容器上应有转发端口属性');
    assert.ok(forwardProp.inputPort, '入侧转发端口要有 PortModel');

    // 重复添加同一个 key → 不重复
    core.addForwardPort(host.id, { side: 'input', name: 'startdescription' });
    assert.equal(core.listForwardPorts(host.id).length, 1);

    const view = core.nodeManager.nodeViews.get(String(host.id));
    assert.ok(view.element.querySelector('.prop-forward'), 'DOM 上应标出 .prop-forward');
  });

  it('删除转发端口：属性与记账一起清掉', () => {
    const { host } = setup();
    core.addForwardPort(host.id, { side: 'output', name: 'value', label: '数据' });
    assert.equal(core.listForwardPorts(host.id).length, 1);

    assert.equal(core.removeForwardPort(host.id, 'output:value'), true);
    assert.deepEqual(core.listForwardPorts(host.id), []);
    assert.ok(!host.detailProperties.some((p) => p && p.forward), '端口属性应被摘掉');

    assert.equal(core.removeForwardPort(host.id, 'output:value'), false, '重复删除返回 false');
  });

  it('持久化：saveContainers 写入 localStorage，restoreContainers 能恢复', () => {
    const { host } = setup();
    core.addForwardPort(host.id, { side: 'input', name: 'slots', label: '卡槽' });
    assert.equal(core.toggleContainer(host.id), true, '先收起');

    assert.equal(core.saveContainers(), true);
    assert.ok(localStorage.getItem('nodeEditor.containers'), '应写入本地存储');

    // 模拟页面重载：只清运行态记账（容器节点与它的连线都还在画布上），
    // 存储里用「刚保存的那份快照」——`removeForwardPort` 自己也会重写存储，所以先留一份
    const snapshot = localStorage.getItem('nodeEditor.containers');
    const frameId = String(host.id);
    core.removeForwardPort(frameId, 'input:slots');
    core.containerNodes.clear();
    core.containerMemberOf.clear();
    localStorage.setItem('nodeEditor.containers', snapshot);
    assert.equal(core.listForwardPorts(frameId).length, 0);

    const restored = core.restoreContainers();
    assert.equal(restored, 1);
    assert.deepEqual(core.listForwardPorts(frameId).map((p) => p.key), ['input:slots']);
    assert.equal(core.containerNodes.get(frameId).collapsed, true, '收起态也应恢复');
    assert.deepEqual(core.containerMembers(frameId), ['1', '2'], '成员归属也应恢复');
  });
});
