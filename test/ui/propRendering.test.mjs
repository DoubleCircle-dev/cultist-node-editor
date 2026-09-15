import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { NodeTypeRegistry } from '../../ui/scripts/types/nodeTypes.js';
import { NodeGenerator } from '../../ui/scripts/generators/nodeGenerator.js';
import { PropView } from '../../ui/scripts/generators/propViewGenerator.js';
import { PropRenderer } from '../../ui/scripts/generators/propGenerator.js';
import { HubProp } from '../../ui/scripts/models/propModels/hubProp.js';
import { BaseProp } from '../../ui/scripts/models/propModels/baseProp.js';
import { NumericProp } from '../../ui/scripts/models/propModels/numericProp.js';
import { ViewProp } from '../../ui/scripts/models/propModels/viewProp.js';
import { PortProp } from '../../ui/scripts/models/propModels/portProp.js';
import { OptionsProp } from '../../ui/scripts/models/propModels/optionsProp.js';

/**
 * 全量属性渲染检测
 *
 * 对 NodeTypeRegistry 中全部节点类型：
 *  - 配置层：properties / modeProperties / exProperties（含 hub 子属性）里的每个
 *    prop type 都必须能解析成可渲染类型（RenderMap 覆盖，或 hub 由 instanceof 特判）。
 *  - 模型层：用 NodeGenerator.createNode 创建模型后递归收集全部属性（端口 hub、
 *    普通属性、所有模式属性、扩展属性池），逐个 PropView.renderProp 渲染，
 *    断言不抛异常、结果有效、不回退到 .prop-error。
 */

/** 渲染器已覆盖的类型 */
const renderMapKeys = Object.keys(PropRenderer.RenderMap);

/** 配置 type -> 创建后 Prop 实例 type（PropGenerator.createProp 的转换） */
const RESOLVED = { range: 'slider', table: 'table-preview' };
function resolveConfigType(t) {
  return RESOLVED[t] || t;
}

/** 配置 type 是否可渲染（hub 由 PropView.renderProp 的 instanceof HubProp 特判） */
function isRenderableType(t) {
  const r = resolveConfigType(t);
  return r === 'hub' || renderMapKeys.includes(r);
}

/**
 * 从节点配置递归收集属性 type（含 hub 子属性 / modeProperties / exProperties）
 * @param {string} nodeType
 * @param {any} config
 * @param {Map<string, number>} into
 */
function collectConfigTypes(nodeType, config, into = new Map()) {
  const record = (t) => into.set(t, (into.get(t) || 0) + 1);
  const walk = (props) => {
    if (!Array.isArray(props)) return;
    props.forEach((p) => {
      if (!p || typeof p.type !== 'string') return;
      record(p.type);
      if (p.type === 'hub' && Array.isArray(p.properties)) walk(p.properties);
    });
  };
  walk(config.properties);
  if (config.modeProperties) Object.values(config.modeProperties).forEach(walk);
  walk(config.exProperties);
  return into;
}

/**
 * 递归收集节点模型上的全部属性（按对象身份去重）
 * @param {import('../../ui/scripts/models/nodeModels/nodeModel.js').NodeModel} model
 * @returns {import('../../ui/scripts/models/propModels/baseProp.js').BaseProp[]}
 */
function collectModelProps(model) {
  const props = [];
  const seen = new Set();
  const add = (p) => {
    if (p && !seen.has(p)) {
      seen.add(p);
      props.push(p);
    }
  };
  const walk = (prop) => {
    add(prop);
    if (prop instanceof HubProp && Array.isArray(prop.properties)) {
      prop.properties.forEach(walk);
    }
  };
  if (model.portHub) walk(model.portHub);
  (model['_properties'] || []).forEach(walk);
  Object.values(model.modeProperties || {}).forEach(walk);
  if (model.extendedProperties?.active) walk(model.extendedProperties.active);
  if (model.extendedProperties?.pool) walk(model.extendedProperties.pool);
  return props;
}

/** 渲染单个属性并返回诊断（不抛异常） */
function renderPropSafe(prop) {
  const diag = { prop, error: null, element: null, listeners: null };
  try {
    const { element, listeners } = PropView.renderProp(prop);
    diag.element = element;
    diag.listeners = Array.isArray(listeners) ? listeners.length : 0;
    if (!isElement(element)) {
      diag.error = `结果不是 DOM 元素 (${String(element)})`;
    } else if (element.classList.contains('prop-error')) {
      diag.error = `回退到 .prop-error: "${element.textContent}"`;
    }
  } catch (e) {
    diag.error = `抛异常: ${e?.message || e}`;
  }
  return diag;
}

/** 运行时 DOM 元素判定（避免依赖 eslint 未声明的 HTMLElement 全局） */
function isElement(el) {
  return !!el && typeof el === 'object' && el.nodeType === 1;
}

/** 全部节点类型 */
const NODE_TYPES = Object.keys(NodeTypeRegistry.nodeTypes);

describe('属性渲染全量检测', () => {
  /** 每个节点类型：{ model, props, failures } */
  let renders;

  beforeEach(() => {
    renders = new Map();
    NODE_TYPES.forEach((typeKey, i) => {
      let model;
      let createError = null;
      try {
        model = NodeGenerator.createNode(typeKey, i + 1, typeKey, 0, 0);
      } catch (e) {
        createError = e;
      }
      const props = model ? collectModelProps(model) : [];
      const failures = [];
      for (const prop of props) {
        const diag = renderPropSafe(prop);
        if (diag.error) failures.push({ id: prop.id, type: prop.type, error: diag.error });
      }
      renders.set(typeKey, { model, createError, props, failures });
    });
  });

  afterEach(() => {
    renders.forEach(({ model }) => model?.dispose?.());
    renders.clear();
  });

  it('节点类型齐全（回归护栏：>=20 且含全部关键类型）', () => {
    assert.ok(NODE_TYPES.length >= 20, `节点类型数 ${NODE_TYPES.length} 应 >= 20`);
    ['test', 'recipes', 'extends', 'copies', 'elements', 'images'].forEach((t) =>
      assert.ok(NODE_TYPES.includes(t), `缺少关键节点类型 ${t}`)
    );
  });

  it('每个节点类型都能创建模型（无异常）', () => {
    const bad = [...renders].filter(([, r]) => r.createError);
    assert.deepEqual(
      bad.map(([t, r]) => `${t}: ${r.createError?.message}`),
      [],
      '下列节点类型创建失败'
    );
  });

  it('每个配置属性类型都能解析到可渲染类型（RenderMap 或 hub 特判）', () => {
    const usedTypes = new Map();
    NODE_TYPES.forEach((typeKey) => collectConfigTypes(typeKey, NodeTypeRegistry.nodeTypes[typeKey], usedTypes));
    const uncovered = [...usedTypes.keys()]
      .filter((t) => !isRenderableType(t))
      .map((t) => `${t}(配置${usedTypes.get(t)}处)`);
    assert.deepEqual(uncovered, [], '下列配置属性类型缺少渲染器');
  });

  it('全部属性渲染成功：不抛异常、不回退 .prop-error（全节点类型 × 全属性）', () => {
    let total = 0;
    const allFailures = [];
    renders.forEach(({ props, failures }, typeKey) => {
      total += props.length;
      failures.forEach((f) => allFailures.push({ nodeType: typeKey, ...f }));
    });
    assert.ok(total >= 200, `属性总数 ${total} 应 >= 200`);
    assert.deepEqual(allFailures, [], `共 ${allFailures.length} 处渲染失败`);
  });

  it('每个模型属性都产出了有效元素与监听器', () => {
    const bad = [];
    renders.forEach(({ props }, typeKey) => {
      for (const prop of props) {
        const { element, listeners } = PropView.renderProp(prop);
        if (!isElement(element)) {
          bad.push(`${typeKey} ${prop.id} 元素无效`);
        }
        if (!Array.isArray(listeners)) {
          bad.push(`${typeKey} ${prop.id} listeners 非数组`);
        }
      }
    });
    assert.deepEqual(bad, [], '存在无效渲染结果');
  });

  it('关键类型映射正确（配置 type → Prop 实例类型）', () => {
    const m = (t) => renders.get(t).model;

    // range → slider（NumericProp）
    const rangeProp = m('test').detailProperties.find((p) => p.label === '数值');
    assert.ok(rangeProp instanceof NumericProp, 'range 应创建 NumericProp');
    assert.equal(rangeProp.type, 'slider', 'range 配置应转成 slider 渲染类型');

    // table → table-preview（ViewProp）
    const tableProp = m('test').detailProperties.find((p) => p.label === '数据表格');
    assert.ok(tableProp instanceof ViewProp, 'table 应创建 ViewProp');
    assert.equal(tableProp.type, 'table-preview', 'table 配置应转成 table-preview');

    // int → NumericProp（recipes.exProperties 扩展属性池里的 maxexecutions）
    const intProp = (m('recipes').extendedProperties?.pool?.properties || []).find((p) => p.type === 'int');
    assert.ok(intProp, 'recipes 扩展属性池应包含 int 属性（maxexecutions）');
    assert.ok(intProp instanceof NumericProp, 'int 应创建 NumericProp（与 integer 一致）');

    // node / text-preview 退化为 BaseProp 但可渲染（extends/copies）
    const nodeProp = m('extends').detailProperties.find((p) => p.type === 'node');
    assert.ok(nodeProp instanceof BaseProp && !(nodeProp instanceof NumericProp), 'node 应为 BaseProp');
    const textPreviewProp = m('extends').detailProperties.find((p) => p.type === 'text-preview');
    assert.ok(textPreviewProp instanceof BaseProp, 'text-preview 应为 BaseProp');

    // select 模式切换器 → OptionsProp
    const switcher = m('test').detailProperties.find((p) => p.isModeSwitcher);
    assert.ok(switcher instanceof OptionsProp, '模式切换器应为 OptionsProp');
  });

  it('模式属性与扩展属性池也全部可渲染', () => {
    const failures = [];
    let modeCount = 0;
    let poolCount = 0;
    renders.forEach(({ model }, typeKey) => {
      Object.values(model.modeProperties || {}).forEach((hub) => {
        (hub?.properties || []).forEach((p) => {
          modeCount++;
          const d = renderPropSafe(p);
          if (d.error) failures.push(`${typeKey} mode:${p.id} -> ${d.error}`);
        });
      });
      model.extendedProperties?.pool?.properties?.forEach((p) => {
        poolCount++;
        const d = renderPropSafe(p);
        if (d.error) failures.push(`${typeKey} pool:${p.id} -> ${d.error}`);
      });
    });
    assert.ok(modeCount > 0, '应存在模式属性');
    assert.ok(poolCount > 0, '应存在扩展属性池（recipes 等节点配置了 exProperties）');
    assert.deepEqual(failures, [], `模式/扩展属性渲染失败 ${failures.length} 处`);
  });

  it('端口（PortProp）渲染出左右槽位与端口点；ViewProp 渲染预览卡片与端口', () => {
    let portCount = 0;
    let viewCount = 0;
    renders.forEach(({ props }, typeKey) => {
      props.forEach((prop) => {
        if (prop instanceof ViewProp) {
          // ViewProp 以独立视图容器渲染，卡片和可连接输入端口均在容器内
          viewCount++;
          const { element } = PropView.renderProp(prop);
          if (isElement(element)) {
            assert.ok(element.classList.contains('prop-view'), `${typeKey} ${prop.id} 根元素应为 .prop-view`);
            assert.ok(element.querySelector('.prop-card'), `${typeKey} ${prop.id} 应包含 .prop-card`);
            assert.ok(element.querySelector('.port-dot'), `${typeKey} ${prop.id} 应包含 port-dot`);
          }
          return;
        }
        if (!(prop instanceof PortProp)) return;
        portCount++;
        const { element } = PropView.renderProp(prop);
        if (!isElement(element)) return;
        assert.ok(
          element.querySelector('.port-slot'),
          `${typeKey} ${prop.id} 应包含 port-slot`
        );
        assert.ok(
          element.querySelector('.port-dot'),
          `${typeKey} ${prop.id} 应包含 port-dot`
        );
      });
    });
    assert.ok(portCount >= 40, `端口属性数 ${portCount} 应 >= 40`);
    assert.ok(viewCount >= 5, `预览属性数 ${viewCount} 应 >= 5`);
  });

  it('渲染后移除返回的监听器，重复渲染不累积（对齐 NodeView.redraw 流程）', () => {
    const model = NodeGenerator.createNode('test', 99999, 'test', 0, 0);
    try {
      const props = collectModelProps(model);
      const countAll = (m) => {
        const all = m.getAllEventListeners ? m.getAllEventListeners() : {};
        return Object.values(all).reduce((n, arr) => n + arr.length, 0);
      };
      // 模拟 NodeView.redraw：渲染 → 由调用方移除返回的监听器
      const renderOnce = () => {
        props.forEach((p) => {
          const { listeners } = PropView.renderProp(p);
          listeners.forEach((l) => {
            if (l.target && l.listener) l.target.removeEventListener(l.type, l.listener);
          });
        });
      };
      renderOnce();
      const base = props.reduce((n, p) => n + countAll(p), 0);
      assert.ok(base > 0, '基线：渲染后 prop/portModel 上应有监听器');
      for (let i = 0; i < 3; i++) renderOnce();
      const after = props.reduce((n, p) => n + countAll(p), 0);
      assert.equal(after, base, '渲染并正确移除监听器后不应在模型上累积');
    } finally {
      model.dispose();
    }
  });
});
