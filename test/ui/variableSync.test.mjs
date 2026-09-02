import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';

function findProp(model, predicate) {
  return model.detailProperties.find(predicate);
}

describe('变量同步', () => {
  let core;

  beforeEach(async () => {
    ({ core } = await createCore());
  });

  afterEach(() => {
    destroyCore(core);
  });

  it('数字变量可以同步到数值输入字段', () => {
    core.nodeManager.addNode('number', 100, 100);
    core.nodeManager.addNode('test', 260, 100);

    const sourceNode = core.nodeManager.getNode('1');
    const targetNode = core.nodeManager.getNode('2');

    const modeSwitcher = findProp(targetNode, (prop) => prop.isModeSwitcher);
    modeSwitcher.changeValue('选项2');

    const sourceOutput = findProp(sourceNode, (prop) => prop.outputPort);
    const targetInput = findProp(targetNode, (prop) => prop.name === 'testNumber');

    assert.ok(sourceOutput?.outputPort, '数字节点应有输出端口');
    assert.ok(targetInput?.inputPort, '目标数值字段应有输入端口');

    const connection = core.connectionManager.createProgrammaticConnection(
      sourceNode,
      sourceOutput.outputPort,
      targetNode,
      targetInput.inputPort
    );

    assert.ok(connection, '数字变量应允许建立同步连接');

    sourceNode.detailProperties.find((prop) => prop.type === 'number').changeValue(77);

    assert.equal(targetInput.value, 77, '目标数值字段应被同步更新');
  });

  it('图片变量可以同步到图片预览字段', () => {
    core.nodeManager.addNode('images', 100, 100);
    core.nodeManager.addNode('images', 260, 100);

    const sourceNode = core.nodeManager.getNode('1');
    const targetNode = core.nodeManager.getNode('2');

    const sourceOutput = findProp(sourceNode, (prop) => prop.outputPort);
    const targetPreview = findProp(targetNode, (prop) => prop.type === 'image-preview');

    assert.ok(sourceOutput?.outputPort, '图片节点应有输出端口');
    assert.ok(targetPreview?.inputPort, '图片预览字段应有输入端口');

    const connection = core.connectionManager.createProgrammaticConnection(
      sourceNode,
      sourceOutput.outputPort,
      targetNode,
      targetPreview.inputPort
    );

    assert.ok(connection, '图片变量应允许建立同步连接');

    const imageValue = 'assets/img/placeholder.png';
    sourceNode.detailProperties.find((prop) => prop.type === 'image-preview').changeValue(imageValue);

    assert.equal(targetPreview.value, imageValue, '目标图片预览值应被同步更新');

    const targetImage = core.nodeManager.nodeViews.get('2').element.querySelector('.prop-card img');
    assert.ok(targetImage, '图片预览应渲染出 img');
    assert.ok(String(targetImage.getAttribute('src') || '').includes('placeholder.png'), '图片预览 img 应刷新到同步值');
  });
});
