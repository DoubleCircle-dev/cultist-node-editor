import './helpers/domSetup.mjs';
import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import { NodeGenerator } from '../../ui/scripts/generators/nodeGenerator.js';

/**
 * 节点模型生命周期：releaseListeners（软释放，保留数据）与
 * dispose（全量销毁）责任链验证。
 *
 * 用 'test' 类型构建完整模型树：
 *  - 端口（inputs/outputs → PortProp → PortModel）
 *  - 普通属性（modeSwitcher/table/hub）
 *  - 模式属性（选项1/2/3 → HubProp）
 *  - 扩展属性（active/pool Hub）
 */

/** 递归收集节点模型树上的全部 IEventTarget 目标 */
function collectTargets(nodeModel) {
  const targets = new Set();
  const add = (obj) => {
    if (obj) targets.add(obj);
  };

  add(nodeModel);
  add(nodeModel.portHub);
  add(nodeModel.inputs);
  add(nodeModel.outputs);
  Object.values(nodeModel.modeProperties || {}).forEach(add);
  if (nodeModel.extendedProperties) {
    add(nodeModel.extendedProperties.active);
    add(nodeModel.extendedProperties.pool);
  }

  const visitProp = (p) => {
    if (!p) return;
    add(p);
    if (p.inputPort) add(p.inputPort);
    if (p.outputPort) add(p.outputPort);
    if (Array.isArray(p.properties)) p.properties.forEach(visitProp);
  };

  const visitHub = (h) => {
    if (h && Array.isArray(h.properties)) h.properties.forEach((p) => visitProp(p));
  };

  // 普通属性（不经过 properties getter，避免与 portHub/mode/extend 混在一起）
  (nodeModel._properties || []).forEach(visitProp);
  // portHub 的子树（inputs/outputs hub → 端口 props → PortModel）
  visitHub(nodeModel.portHub);
  // 模式 / 扩展 hub 的子树
  Object.values(nodeModel.modeProperties || {}).forEach(visitHub);
  if (nodeModel.extendedProperties) {
    visitHub(nodeModel.extendedProperties.active);
    visitHub(nodeModel.extendedProperties.pool);
  }

  return targets;
}

/** 统计节点模型树上的监听器总数 */
function totalListeners(nodeModel) {
  let n = 0;
  for (const t of collectTargets(nodeModel)) {
    const all = t.getAllEventListeners ? t.getAllEventListeners() : {};
    for (const key of Object.keys(all)) n += all[key].length;
  }
  return n;
}

describe('节点模型 dispose / releaseListeners 责任链', () => {
  it('createNode 构建的模型树已绑定业务监听器（基线 > 0）', () => {
    const m = NodeGenerator.createNode('1', 1, 'test', 0, 0);
    assert.ok(totalListeners(m) > 0, '模型/模式切换器应已绑定业务监听器');
  });

  it('releaseListeners 清空监听器但保留数据（undo 复用前提）', () => {
    const m = NodeGenerator.createNode('1', 1, 'test', 0, 0);
    const propCount = m.detailProperties.length;
    const modeCount = Object.keys(m.modeProperties).length;
    const inputs = m.inputs;
    assert.ok(propCount > 0);

    m.releaseListeners();

    assert.equal(totalListeners(m), 0, '所有模型/属性/端口监听器都应清空');
    assert.equal(m.detailProperties.length, propCount, '属性数据应保留');
    assert.equal(Object.keys(m.modeProperties).length, modeCount, '模式数据应保留');
    assert.equal(m.inputs, inputs, '端口引用应保留');
  });

  it('dispose 清空监听器并清空数据', () => {
    const m = NodeGenerator.createNode('1', 1, 'test', 0, 0);
    m.dispose();

    assert.equal(totalListeners(m), 0);
    assert.equal(m._properties.length, 0, '普通属性应清空');
    assert.equal(m.portHub, null, 'portHub 应置空');
    assert.equal(m.inputs, null);
    assert.equal(m.outputs, null);
    assert.equal(Object.keys(m.modeProperties).length, 0, '模式属性应清空');
    assert.equal(m.extendedProperties.active, null, '扩展 active 应置空');
    assert.equal(m.extendedProperties.pool, null, '扩展 pool 应置空');
  });

  it('dispose 幂等：重复调用不抛错且保持已清空', () => {
    const m = NodeGenerator.createNode('1', 1, 'test', 0, 0);
    m.dispose();
    m.dispose();
    assert.equal(totalListeners(m), 0);
    assert.equal(m._properties.length, 0);
  });

  it('dispose 后属性对象上的监听器也已清空（递归到 prop/port）', () => {
    const m = NodeGenerator.createNode('1', 1, 'test', 0, 0);
    // 取一个端口 prop 验证其 PortModel 监听器在 dispose 后为空
    const somePort = m.portHub.properties
      .flatMap((hub) => hub.properties || [])
      .find((p) => p.inputPort || p.outputPort);
    assert.ok(somePort, '测试节点应存在端口属性');
    const portModel = somePort.inputPort || somePort.outputPort;

    m.dispose();

    assert.deepEqual(portModel.getAllEventListeners(), {}, 'PortModel 监听器应清空');
    assert.equal(portModel.parentProp, null, 'PortModel 归属引用应切断');
  });

  it('releaseListeners 之后仍可正常 addEventListener（模型可复用）', () => {
    const m = NodeGenerator.createNode('1', 1, 'test', 0, 0);
    m.releaseListeners();
    const h = () => {};
    m.addEventListener('update:position', h);
    assert.equal(m.getAllEventListeners('update:position').length, 1);
  });
});
