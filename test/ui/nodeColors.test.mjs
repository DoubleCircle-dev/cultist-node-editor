import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { NodeTypeRegistry } from '../../frontend/src/types/nodeTypes.js';
import { NodeGenerator } from '../../frontend/src/generators/nodeGenerator.js';
import {
  NODE_COLOR_ITEMS,
  NODE_COLOR_KEYS,
  getNodeColor,
  getNodeColors,
  getUserNodeColors,
  nodeColorKeyOf,
  normalizeNodeColor,
  resetNodeColors,
  setFactoryNodeColors,
  setNodeColor,
  setNodeColors,
} from '../../frontend/src/types/nodeColors.js';

/**
 * 节点配色（可自定义）测试
 *
 * 规则：
 *  - 默认值来自 `NODE_COLOR_ITEMS`（原先散在 variables.css 的 `--node-*` 已删）；
 *  - 覆盖分两层：config.json 的出厂默认 → 用户本地自定义（localStorage，优先）；
 *  - 取色统一走 `getNodeColor()`；节点类型配置与端口数据类型（`text` / `set` …）共用这张表；
 *  - 改配色要刷新画布上已有节点：`NodeTypeRegistry.setNodeColor()` 后调 `core.applyNodeColors()`。
 */

const STORAGE_KEY = 'nodeEditor.nodeColors';

/** 递归收集节点树上全部 prop id */
function collectIds(model) {
  const ids = [];
  const walk = (prop) => {
    if (!prop || typeof prop.id !== 'string') return;
    ids.push(prop.id);
    if (Array.isArray(prop.properties)) prop.properties.forEach(walk);
  };
  (model['_properties'] || []).forEach(walk);
  Object.values(model.modeProperties || {}).forEach(walk);
  if (model.extendedProperties?.active) walk(model.extendedProperties.active);
  if (model.extendedProperties?.pool) walk(model.extendedProperties.pool);
  return ids;
}

describe('节点配色（可自定义）', () => {
  /** @type {import('../../frontend/src/models/nodeModels/nodeModel.js').NodeModel[]} */
  let models;

  beforeEach(() => {
    models = [];
    localStorage.removeItem(STORAGE_KEY);
    setFactoryNodeColors({}, { apply: false });
    resetNodeColors();
  });

  afterEach(() => {
    models.forEach((m) => m?.dispose?.());
    models = [];
    resetNodeColors();
    setFactoryNodeColors({}, { apply: false });
    localStorage.removeItem(STORAGE_KEY);
  });

  const build = (type, id) => {
    const model = NodeGenerator.createNode(String(id), id, type, 0, 0);
    models.push(model);
    return model;
  };

  it('配色表覆盖全部节点类型键，默认值都是合法颜色', () => {
    const keys = Object.keys(NodeTypeRegistry.nodeTypes).map(nodeColorKeyOf);
    keys.forEach((key) => assert.ok(NODE_COLOR_KEYS.includes(key), `节点类型用到的配色键 ${key} 不在配色表里`));
    assert.equal(new Set(NODE_COLOR_KEYS).size, NODE_COLOR_KEYS.length, '配色键不应重复');

    NODE_COLOR_ITEMS.forEach((item) => {
      assert.equal(normalizeNodeColor(item.value), item.value, `${item.key} 的默认值 ${item.value} 应为规范 #rrggbb`);
      assert.ok(item.label, `${item.key} 缺少设置面板用的中文名`);
    });
  });

  it('颜色规范化：#abc 补全、大写转小写，非法值返回 null', () => {
    assert.equal(normalizeNodeColor('#ABC'), '#aabbcc');
    assert.equal(normalizeNodeColor('  #ff5719 '), '#ff5719');
    assert.equal(normalizeNodeColor('red'), null);
    assert.equal(normalizeNodeColor('#12345'), null);
    assert.equal(normalizeNodeColor(''), null);
    assert.equal(normalizeNodeColor(null), null);
  });

  it('改配色：写进配色表 + CSS 变量 + localStorage；非法值/未知键不生效', () => {
    assert.ok(setNodeColor('recipes', '#123456'));
    assert.equal(getNodeColor('recipes'), '#123456');
    assert.equal(NodeTypeRegistry.getColor('recipes'), '#123456');
    assert.equal(
      document.documentElement.style.getPropertyValue('--node-recipes'),
      '#123456',
      '应把颜色写成 --node-<key> 自定义属性'
    );
    assert.deepEqual(JSON.parse(localStorage.getItem(STORAGE_KEY)), { recipes: '#123456' }, '只存被改过的项');

    assert.equal(setNodeColor('recipes', '不是颜色'), false, '非法颜色应被拒绝');
    assert.equal(getNodeColor('recipes'), '#123456', '拒绝后保持原值');
    assert.equal(setNodeColor('不存在的键', '#ffffff'), false, '未知键应被拒绝');
  });

  it('改回默认值时清掉本地记录（不留冗余覆盖）', () => {
    const def = getNodeColors().recipes;
    setNodeColor('recipes', '#123456');
    setNodeColor('recipes', def);
    assert.equal(localStorage.getItem(STORAGE_KEY), null, '值与默认一致时不应再记在本地');
  });

  it('两层覆盖：config.json 出厂默认 < 用户本地自定义', () => {
    setFactoryNodeColors({ recipes: '#101010', elements: '#202020' });
    assert.equal(getNodeColor('recipes'), '#101010');
    assert.equal(getNodeColor('elements'), '#202020');
    assert.equal(
      getNodeColor('decks'),
      NODE_COLOR_ITEMS.find((i) => i.key === 'decks').value,
      '出厂表没写的项用内置默认'
    );

    setNodeColor('recipes', '#303030');
    assert.equal(getNodeColor('recipes'), '#303030', '用户自定义应压过出厂默认');
    assert.equal(getNodeColor('elements'), '#202020', '未改过的项仍用出厂默认');

    resetNodeColors();
    assert.equal(getNodeColor('recipes'), '#101010', '恢复默认应回到出厂默认而不是内置值');
    assert.deepEqual(getUserNodeColors(), {});
  });

  it('批量改配色 + 恢复默认', () => {
    assert.deepEqual(setNodeColors({ recipes: '#111111', elements: '#222222' }), ['recipes', 'elements']);
    assert.equal(getNodeColor('recipes'), '#111111');
    resetNodeColors();
    assert.equal(getNodeColor('recipes'), NODE_COLOR_ITEMS.find((i) => i.key === 'recipes').value);
    assert.equal(localStorage.getItem(STORAGE_KEY), null);
  });

  it('模块载入时从 localStorage 恢复（刷新页面后仍是用户配色）', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ recipes: '#abcdef' }));
    // 重新导入整个模块图（带查询串绕过 ESM 缓存），模拟刷新页面。
    // 说明符用变量：让 TS 不去解析这个带查询串的路径。
    const specifier = '../../frontend/src/types/nodeColors.js?reload';
    const fresh = await import(specifier);
    assert.equal(fresh.getNodeColor('recipes'), '#abcdef');
    assert.equal(document.documentElement.style.getPropertyValue('--node-recipes'), '#abcdef');
  });

  it('节点类型配置带当前配色；改配色后新建节点立即用新色', () => {
    const before = build('recipes', 1);
    const oldColor = before.color;
    assert.equal(oldColor, getNodeColor('recipes'), '节点模型应带配色表里的颜色');

    NodeTypeRegistry.setNodeColor('recipes', '#0a0b0c');
    assert.equal(NodeTypeRegistry.getType('recipes').color, '#0a0b0c', '类型配置应现取颜色（缓存要失效）');
    const after = build('recipes', 2);
    assert.equal(after.color, '#0a0b0c', '新建节点应立即用新配色');
    assert.equal(before.color, oldColor, '旧模型颜色不被改写（由画布刷新负责）');
  });

  it('core.applyNodeColors()：改配色后画布上已有节点立即换色（重建视图）', async () => {
    const { createCore, destroyCore } = await import('./helpers/env.mjs');
    const { core } = await createCore();
    try {
      core.nodeManager.addNode('recipes', 0, 0);
      const node = core.nodes[core.nodes.length - 1];
      const view = core.nodeManager.nodeViews.get(String(node.id));
      assert.equal(node.color, getNodeColor('recipes'));

      NodeTypeRegistry.setNodeColor('recipes', '#123456');
      const refreshed = core.applyNodeColors();

      assert.equal(refreshed, 1, '应刷新 1 个节点');
      assert.equal(node.color, '#123456', '模型颜色应更新');
      // jsdom 会把 inline 的 #rrggbb 规范成 rgb(r, g, b)，两种写法都接受
      const border = view.element.style.borderColor;
      const rgb = `rgb(${parseInt('12', 16)}, ${parseInt('34', 16)}, ${parseInt('56', 16)})`;
      assert.ok(
        border === '#123456' || border === rgb,
        `视图重建后边框应为新色，实际是 ${border}`
      );
    } finally {
      destroyCore(core);
    }
  });

  it('端口数据类型共用同一张配色表（未知类型退回 blank）', () => {
    assert.equal(NodeTypeRegistry.getColor('set'), getNodeColor('set'));
    assert.equal(NodeTypeRegistry.getColor('text'), getNodeColor('text'));
    assert.equal(NodeTypeRegistry.getColor('不存在的类型'), getNodeColor('blank'));
  });

  it('allTypesList 带最新配色（侧边栏/节点面板用）', () => {
    NodeTypeRegistry.setNodeColor('recipes', '#445566');
    const item = NodeTypeRegistry.allTypesList.find((t) => t.type === 'recipes');
    assert.equal(item.color, '#445566');
  });

  it('core.applyNodeColors()：顺带刷新侧边栏列表面板（添加节点 / 查找节点）', async () => {
    const { createCore, destroyCore } = await import('./helpers/env.mjs');
    const { core } = await createCore();
    try {
      const pm = core.panelManager;
      const pick = (type) => (pm.addNodesPanel?.rawData || []).find((t) => t.type === type);

      assert.ok(pick('recipes'), '「添加节点」面板应有类型列表（含 recipes）');
      assert.equal(pick('recipes').color, getNodeColor('recipes'));

      NodeTypeRegistry.setNodeColor('recipes', '#0f0f0f');
      const refreshed = pm.refreshColorPanels();

      assert.ok(refreshed >= 1, '至少应刷新「添加节点」面板');
      assert.equal(pick('recipes').color, '#0f0f0f', '类型列表要重新取数，不能留快照旧色');
      assert.equal(pm.addNodesPanel.rawData, pm.addNodesPanel._rawData);
    } finally {
      destroyCore(core);
    }
  });

  it('改配色会经 applyNodeColors 自动带上列表面板刷新', async () => {
    const { createCore, destroyCore } = await import('./helpers/env.mjs');
    const { core } = await createCore();
    try {
      NodeTypeRegistry.setNodeColor('elements', '#010203');
      core.applyNodeColors();
      const item = (core.panelManager.addNodesPanel?.rawData || []).find((t) => t.type === 'elements');
      assert.equal(item?.color, '#010203', 'applyNodeColors 应触发面板重新取数');
    } finally {
      destroyCore(core);
    }
  });

  it('改配色不会破坏节点属性结构（id 不撞车、属性数量不变）', () => {
    const ids = collectIds(build('recipes', 1));
    NodeTypeRegistry.setNodeColor('recipes', '#abcdef');
    const idsAfter = collectIds(build('recipes', 2));

    assert.equal(ids.length, idsAfter.length);
    assert.equal(new Set(idsAfter).size, idsAfter.length, '重绘后不应出现重复 prop id');
  });
});
