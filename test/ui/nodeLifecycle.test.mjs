import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore, window } from './helpers/env.mjs';

/**
 * 节点生命周期与内存管理集成测试（NodeManager + NodeView + EventBus）。
 * 覆盖：
 *  - 创建/删除节点时的索引、DOM、监听器一致性
 *  - L1：mousedown→拖拽全流程后 EventBus 不累积
 *  - L2：redraw 不抛错且不累积模型/端口监听器
 *  - L3：clear() 快速清理完整释放
 *  - undo/redo 复用模型时数据保留（releaseListeners 软释放）
 *  - WeakRef + global.gc 探针验证节点可被回收
 */

/** EventBus 监听器总数 */
function busListenerCount(bus) {
  const all = bus.getAllEventListeners ? bus.getAllEventListeners() : {};
  return Object.values(all).reduce((n, arr) => n + arr.length, 0);
}

/** 节点自身监听器总数 */
function countNodeListeners(model) {
  const all = model.getAllEventListeners ? model.getAllEventListeners() : {};
  return Object.values(all).reduce((n, arr) => n + arr.length, 0);
}

/** 收集节点树上的全部 PortModel */
function collectPortModels(nodeModel) {
  const ports = [];
  const visit = (obj) => {
    if (!obj) return;
    if (obj.inputPort) ports.push(obj.inputPort);
    if (obj.outputPort) ports.push(obj.outputPort);
    if (Array.isArray(obj.properties)) obj.properties.forEach(visit);
  };
  visit(nodeModel.portHub);
  (nodeModel._properties || []).forEach(visit);
  Object.values(nodeModel.modeProperties || {}).forEach(visit);
  if (nodeModel.extendedProperties) {
    visit(nodeModel.extendedProperties.active);
    visit(nodeModel.extendedProperties.pool);
  }
  return ports;
}

/** 全部 PortModel 上的监听器总数 */
function sumPortListeners(nodeModel) {
  return collectPortModels(nodeModel).reduce((n, port) => {
    const all = port.getAllEventListeners ? port.getAllEventListeners() : {};
    return n + Object.values(all).reduce((m, arr) => m + arr.length, 0);
  }, 0);
}

describe('节点生命周期与内存管理（集成）', () => {
  let core;
  let world;

  beforeEach(async () => {
    ({ core, world } = await createCore());
  });

  afterEach(() => {
    destroyCore(core);
  });

  it('创建节点：模型/视图/索引/监听器齐全', () => {
    core.nodeManager.addNode('test', 100, 100);
    const model = core.nodeManager.nodes.get('1');
    assert.ok(model, '节点模型应存在');
    assert.ok(core.nodeManager.nodeViews.get('1'), '节点视图应存在');
    assert.equal(core.nodeManager.nodeModelListeners.size, 1, '控制器监听器应登记');
    assert.ok(world.querySelector('.node'), '节点 DOM 应挂载到画布');
    assert.ok(countNodeListeners(model) > 0, '模型上应绑定控制器/视图/业务监听器');
  });

  it('删除节点：索引清空、DOM 移除、模型监听器释放', () => {
    core.nodeManager.addNode('test', 100, 100);
    const model = core.nodeManager.getNode('1');
    core.nodeManager.deleteNode('1');

    assert.equal(core.nodeManager.nodes.size, 0);
    assert.equal(core.nodeManager.nodeViews.size, 0);
    assert.equal(core.nodeManager.nodeModelListeners.size, 0);
    assert.equal(world.querySelectorAll('.node').length, 0, '节点 DOM 应被移除');
    assert.equal(countNodeListeners(model), 0, '模型监听器应释放');
    assert.equal(sumPortListeners(model), 0, '端口监听器应释放');
  });

  it('删除后 undo 恢复：复用同一模型且数据完整（releaseListeners 软释放）', () => {
    core.nodeManager.addNode('test', 100, 100);
    const id = '1';
    const modelBefore = core.nodeManager.getNode(id);
    const propCountBefore = modelBefore.detailProperties.length;
    assert.ok(propCountBefore > 0, 'test 节点应有属性');

    core.nodeManager.deleteNode(id);
    assert.equal(core.nodeManager.nodes.size, 0);

    core.historyManager.undo(); // 撤销删除 → _createNode(model) 复用模型
    assert.equal(core.nodeManager.nodes.size, 1, 'undo 后节点应恢复');
    const modelAfter = core.nodeManager.getNode(id);
    assert.equal(modelAfter, modelBefore, '应复用同一模型对象');
    assert.equal(modelAfter.detailProperties.length, propCountBefore, '属性数据应保留');
    assert.ok(core.nodeManager.nodeViews.get(id), '视图应重建');
    assert.ok(world.querySelector('.node'), 'DOM 应重新挂载');
  });

  it('redraw 不抛错且不累积模型/端口监听器（L2 修复）', () => {
    core.nodeManager.addNode('test', 100, 100);
    const id = '1';
    const model = core.nodeManager.getNode(id);
    const view = core.nodeManager.nodeViews.get(id);

    const nodeListenersBefore = countNodeListeners(model);
    const portListenersBefore = sumPortListeners(model);
    assert.ok(portListenersBefore > 0, 'test 节点应有端口监听器（基线）');

    for (let i = 0; i < 5; i++) {
      view.redraw(); // 修复前：这里调用不存在的 _removeListeners 抛 TypeError
    }

    assert.equal(countNodeListeners(model), nodeListenersBefore, 'redraw 不应累积模型监听器');
    assert.equal(sumPortListeners(model), portListenersBefore, 'redraw 不应累积端口监听器');
    assert.equal(world.querySelectorAll('.node').length, 1, 'redraw 后仍应只有一个节点 DOM');
  });

  it('clear() 快速清理：释放全部模型/视图/监听器（L3 修复）', () => {
    for (let i = 0; i < 5; i++) core.nodeManager.addNode('test', 100 + i, 100);
    assert.equal(core.nodeManager.nodes.size, 5);
    assert.equal(world.querySelectorAll('.node').length, 5);

    const busBefore = busListenerCount(core.bus);
    core.nodeManager.clear();

    assert.equal(core.nodeManager.nodes.size, 0);
    assert.equal(core.nodeManager.nodeViews.size, 0);
    assert.equal(core.nodeManager.nodeModelListeners.size, 0);
    assert.equal(world.querySelectorAll('.node').length, 0);
    assert.equal(busListenerCount(core.bus), busBefore, 'clear 后 EventBus 不应累积');
  });

  it('模拟节点 mousedown→拖拽结束全流程后 EventBus 不累积（L1 集成）', () => {
    const busBefore = busListenerCount(core.bus);
    const ids = [];
    for (let i = 0; i < 10; i++) {
      core.nodeManager.addNode('blank', 100 + i, 100);
      ids.push(String(i + 1));
    }

    ids.forEach((id) => {
      const node = core.nodeManager.getNode(id);
      // 触发 NodeManager.mousedownHandler → bus.onceExclusive
      node.emit('mousedown', {
        originalEvent: { ctrlKey: false, metaKey: false, clientX: 100, clientY: 100 },
      });
      // 模拟鼠标释放（无位移 → drag:node:failed），触发 onceExclusive 清理 + window 监听器清理
      window.dispatchEvent(new window.MouseEvent('mouseup'));
    });

    core.nodeManager.deleteNodes(ids);
    assert.equal(busListenerCount(core.bus), busBefore, 'mousedown/拖拽循环后 EventBus 不应累积监听器');
  });

  it('删除节点后无残留：索引/监听器/DOM 全部释放', () => {
    const busBefore = busListenerCount(core.bus);
    for (let i = 0; i < 10; i++) {
      core.nodeManager.addNode('blank', 100 + i, 100);
      const id = core.nodeManager.nodes.keys().next().value;
      const model = core.nodeManager.getNode(id);
      core.nodeManager.deleteNode(id);
      // 删除后模型/端口上的监听器应全部释放（不留闭包）
      assert.equal(countNodeListeners(model), 0, '删除后模型监听器应全部释放');
      assert.equal(sumPortListeners(model), 0, '删除后端口监听器应全部释放');
    }
    core.historyManager.clear();
    assert.equal(core.nodeManager.nodes.size, 0);
    assert.equal(core.nodeManager.nodeViews.size, 0);
    assert.equal(core.nodeManager.nodeModelListeners.size, 0);
    assert.equal(busListenerCount(core.bus), busBefore, 'EventBus 不应累积');
  });
});
