import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';

/**
 * 整理布局的集成测试（ControllerCore.organizeLayout）。
 *
 * 纯算法在 flowLayout.test.mjs；这里验证接线：
 *  - 从 ConnectionManager 取连线方向并据此铺行
 *  - 连线两端不一定是数据流向：辅助节点是「宿主输入端口 ← 文本节点输出端口」，
 *    必须按端口方向判定，否则文本节点会被排到宿主右侧
 *  - 空画布不抛错
 *  - 位置真正落到节点模型上（setPosition → DOM left/top）
 */

/** 造一对可连的节点（'1'=数字变量有输出端口，'2'=test 节点的数值字段有输入端口） */
function buildLinkedPair(core) {
  core.nodeManager.addNode('number', 100, 100);
  core.nodeManager.addNode('test', 100, 100);

  const source = core.nodeManager.getNode('1');
  const target = core.nodeManager.getNode('2');
  const output = source.detailProperties.find((prop) => prop.outputPort);
  const input = target.detailProperties.find((prop) => prop.name === 'testRange');
  assert.ok(output?.outputPort && input?.inputPort, '测试节点应具备可连的端口');

  const connection = core.connectionManager.createProgrammaticConnection(
    source,
    output.outputPort,
    target,
    input.inputPort
  );
  assert.ok(connection, '应能建立程序化连线');
  return { source, target };
}

describe('整理布局（按连线方向左入右出）', () => {
  let core;

  beforeEach(async () => {
    ({ core } = await createCore());
  });

  afterEach(() => {
    destroyCore(core);
  });

  it('按连线方向重排：输出侧节点在左，被引用节点在右', () => {
    const { source, target } = buildLinkedPair(core);

    const result = core.organizeLayout({ fit: false });

    assert.equal(result.count, 2, '两个节点都应被摆放');
    assert.ok(result.columns >= 2, '有连线的两端至少占两个位置');
    assert.ok(source.x < target.x, '输出端口所在节点应排在左侧');
  });

  it('位置落到节点模型与 DOM 上', () => {
    const { source } = buildLinkedPair(core);
    core.organizeLayout({ fit: false });

    const element = core.nodeManager.nodeViews.get(String(source.id)).element;
    assert.equal(parseFloat(element.style.left), source.x);
    assert.equal(parseFloat(element.style.top), source.y);
  });

  it('空画布返回 0 且不抛错', () => {
    const result = core.organizeLayout({ fit: false });
    assert.equal(result.count, 0);
    assert.equal(result.rows, 0);
    assert.equal(result.columns, 0);
  });

  it('默认会按可读缩放展示（不抛错）', () => {
    buildLinkedPair(core);
    assert.doesNotThrow(() => core.organizeLayout());
  });

  it('文本变量节点识别为辅助节点，贴到宿主下方（不占行内位置）', () => {
    core.nodeManager.addNode('test', 100, 100);
    core.nodeManager.addNode('text', 1000, 1000);
    const host = core.nodeManager.getNode('1');
    const text = core.nodeManager.getNode('2');
    // 与 NodeManager._createTextVariableForField 一致：宿主「文本字段」的输入端口 ← 文本节点的输出端口
    const fieldProp = host.detailProperties.find((prop) => prop.type === 'text' && prop.inputPort);
    const output = text.detailProperties.find((prop) => prop.outputPort);
    assert.ok(fieldProp?.inputPort && output?.outputPort, '应具备可连的端口');
    assert.ok(
      core.connectionManager.createProgrammaticConnection(
        host,
        fieldProp.inputPort,
        text,
        output.outputPort
      ),
      '应能建立辅助节点连线'
    );

    const result = core.organizeLayout({ fit: false });

    // 端口方向判定正确时：文本节点被当成宿主的辅助节点 → 排到宿主左侧的辅助列，且不占行内位置
    assert.ok(text.x < host.x, `文本节点应在宿主左侧（实际 ${text.x} vs ${host.x}）`);
    assert.ok(Math.abs(text.y - host.y) <= 400, `应与宿主高度接近（实际 ${text.y} vs ${host.y}）`);
    assert.equal(result.rows, 1, '宿主与其辅助节点属于同一行带');
  });

  it('无连线节点不参与分层，排在主图下方', () => {
    buildLinkedPair(core);
    core.nodeManager.addNode('blank', 5000, 5000);

    const { source, target } = { source: core.nodeManager.getNode('1'), target: core.nodeManager.getNode('2') };
    const solo = core.nodeManager.getNode('3');
    core.organizeLayout({ fit: false });

    const mainBottom = Math.max(source.y, target.y);
    assert.ok(solo.y > mainBottom, '孤立节点应排在主图下方');
  });
});
