import './helpers/domSetup.mjs';
import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import { PropGenerator, PropRenderer } from '../../frontend/src/generators/propGenerator.js';
import { PortProp } from '../../frontend/src/models/propModels/portProp.js';

/**
 * 端口属性的「值输入」测试（recipes.actionId：端口 + 可编辑文本）
 *
 * 语义：**未连线**时输入框可编辑，改的就是该字段本身的值（`recipes.actionid`）；
 * **连上 verb 节点后**值以连线为准 → 输入框只读，显示连线目标节点的数据 id；
 * 断开连线恢复可编辑。
 *
 * 声明形状与 `types/nodeTypes.js` 里 recipes 的 actionId 一致：
 * `{ type: 'port', requireType: 'verbs', multiConnect: false, valueType: 'text' }`
 */

/** 按 recipes.actionId 的声明造一个端口属性 */
function makeActionIdProp(overrides = {}) {
  const prop = PropGenerator.createProp(
    'node1-port-0',
    'port',
    {
      name: 'actionId',
      label: '使用行动',
      type: 'port',
      requireType: 'verbs',
      multiConnect: false,
      valueType: 'text',
      ...overrides,
    },
    // 假的父节点：changeValue 会向父节点冒泡事件，给它一个 emit 免得刷错误日志
    new WeakRef({ emit() {} })
  );
  return prop;
}

/** 造一个「verb 节点」的输出端口属性（供连线用），并挂上数据 id */
function makeVerbPortProp(dataId = 'study') {
  const prop = PropGenerator.createProp('verb9-port-0', 'port', {
    name: 'verbs',
    label: 'verb',
    type: 'port',
    direction: 'output',
    returnType: 'verbs',
    multiConnect: true,
  });
  prop.parentNode = new WeakRef({ dataId, title: '学习' });
  return prop;
}

describe('端口属性的值输入（recipes.actionId）', () => {
  it('声明带 valueType：端口照旧（verbs / 单连接），并记下值类型', () => {
    const prop = makeActionIdProp();
    assert.ok(prop instanceof PortProp, '端口属性应是 PortProp');
    assert.equal(prop.valueType, 'text');
    assert.equal(prop.inputPort.dataType, 'verbs');
    assert.equal(prop.inputPort.maxLinks, 1);
    assert.equal(prop.outputPort, null, '只声明了入端口');
  });

  it('未连线：渲染出可编辑输入框，值随字段刷新', () => {
    const prop = makeActionIdProp();
    const { element } = PropRenderer.render(prop);
    const input = element.querySelector('input');
    assert.ok(input, '应渲染出值输入框');
    assert.equal(input.readOnly, false);
    assert.equal(input.classList.contains('from-link'), false);

    prop.updateValue('work');
    assert.equal(input.value, 'work', '外部改写值（数据填充/撤销）应刷新显示');
  });

  it('未连线：编辑输入框写回字段值', () => {
    const prop = makeActionIdProp();
    const { element } = PropRenderer.render(prop);
    const input = element.querySelector('input');

    input.value = 'dream';
    input.dispatchEvent(new Event('change'));
    assert.equal(prop.value, 'dream');
  });

  it('连线后：只读并显示连线目标 id；断开后恢复可编辑', () => {
    const prop = makeActionIdProp();
    prop.updateValue('study'); // 字段里原本的值
    const verb = makeVerbPortProp('dream'); // 连上的 verb 与字段值不同 → 能验出显示的是连线
    const { element } = PropRenderer.render(prop);
    const input = element.querySelector('input');

    prop.inputPort.ConnectTo(verb.outputPort);
    assert.equal(input.readOnly, true, '有连线 → 值以连线为准，不可编辑');
    assert.equal(input.classList.contains('from-link'), true);
    assert.equal(input.value, 'dream', '显示连线目标节点的数据 id');

    prop.inputPort.remove(verb.outputPort);
    assert.equal(input.readOnly, false, '断开连线 → 恢复可编辑');
    assert.equal(input.classList.contains('from-link'), false);
    assert.equal(input.value, 'study', '回到字段自己的值');
  });

  it('不带 valueType 的纯端口：仍然只渲染按钮', () => {
    const prop = makeActionIdProp({ valueType: undefined });
    const { element } = PropRenderer.render(prop);
    assert.equal(element.tagName, 'BUTTON');
    assert.equal(element.querySelector('input'), null);
  });
});
