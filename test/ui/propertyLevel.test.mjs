import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { NodeTypeRegistry } from '../../frontend/src/types/nodeTypes.js';
import { NodeGenerator } from '../../frontend/src/generators/nodeGenerator.js';
import { NODE_FIELD_STATS } from '../../frontend/src/types/nodeFieldStats.js';
import {
  DEFAULT_PROPERTY_LEVEL,
  ESSENTIAL_FREQUENCY,
  PROPERTY_LEVELS,
  PROPERTY_LEVEL_INITIAL_OPTIONAL,
  applyPropertyLevel,
  collectOptionalProperties,
  initialOptionalCount,
  propertyFrequency,
  sortPropertiesByFrequency,
  splitEssentialProperties,
} from '../../frontend/src/types/nodePropertyLevels.js';

/**
 * 节点属性划分与档位测试
 *
 * 规则：
 *  - 模板 `properties` 是完整目录，运行时按**原版字段出现率**切成
 *    「必要属性（≥ 门槛，或模式切换器）」与「非必要属性」；
 *  - **非必要属性全部进「可选属性」池**（`exProperties`），一个都不丢；
 *  - 档位只决定**建节点时初始加载几个可选属性**：最低 0 / 标准 3 / 全部全加载；
 *  - 没有原版数据可依据的类型（test 等）不做划分。
 */

/** 常驻属性名（含 hub 子属性，detailProperties 已摊平） */
function visibleNames(model) {
  return model.detailProperties.map((p) => p.name);
}

/** 属性池里还没加载的可选属性名 */
function poolNames(model) {
  return (model.extendedProperties?.pool?.properties || []).map((p) => p.name);
}

/** 已加载的可选属性名（不含「修改可选属性」按钮） */
function loadedNames(model) {
  return (model.extendedProperties?.active?.properties || []).filter((p) => p.type !== 'button').map((p) => p.name);
}

/** 递归收集节点树上全部 prop id（含 pool / mode / hub 子属性） */
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

/** 属性配置是否带模式切换标记（NodePropConfig 未声明该字段，测试里按 any 读取） */
const isModeSwitcher = (prop) => !!(/** @type {any} */ (prop).isModeSwitcher);

/** 有原版统计的类型（参与划分） */
const DATA_TYPES = Object.keys(NODE_FIELD_STATS);

describe('节点属性划分与档位（最低 / 标准 / 全部）', () => {
  /** @type {import('../../frontend/src/models/nodeModels/nodeModel.js').NodeModel[]} */
  let models;

  beforeEach(() => {
    models = [];
  });

  afterEach(() => {
    models.forEach((m) => m?.dispose?.());
    models = [];
    NodeTypeRegistry.setPropertyLevel(DEFAULT_PROPERTY_LEVEL);
  });

  const build = (type, id) => {
    const model = NodeGenerator.createNode(String(id), id, type, 0, 0);
    models.push(model);
    return model;
  };

  it('档位取值与默认档符合约定', () => {
    assert.deepEqual(PROPERTY_LEVELS, ['minimal', 'standard', 'full']);
    assert.equal(DEFAULT_PROPERTY_LEVEL, 'standard');
    assert.equal(NodeTypeRegistry.propertyLevel, DEFAULT_PROPERTY_LEVEL, '默认应为标准档');
    assert.deepEqual(PROPERTY_LEVEL_INITIAL_OPTIONAL, { minimal: 0, standard: 3, full: Infinity });
    assert.equal(initialOptionalCount('不存在的档'), PROPERTY_LEVEL_INITIAL_OPTIONAL[DEFAULT_PROPERTY_LEVEL]);
  });

  it('非法档位回落到默认档', () => {
    assert.equal(NodeTypeRegistry.setPropertyLevel('不存在的档'), DEFAULT_PROPERTY_LEVEL);
    assert.equal(NodeTypeRegistry.setPropertyLevel('full'), 'full');
    assert.equal(NodeTypeRegistry.setPropertyLevel('minimal'), 'minimal');
  });

  it('所有非必要属性都进「可选属性」池，属性一个不丢（全类型）', () => {
    DATA_TYPES.forEach((type) => {
      const raw = NodeTypeRegistry.nodeTypes[type];
      const config = NodeTypeRegistry.getType(type);
      const visible = new Set(config.properties.map((p) => p.name));
      const pooled = new Set(config.exProperties.map((p) => p.name));

      assert.ok(config.properties.length > 0, `${type} 应至少保留一个必要属性`);
      raw.properties.forEach((p) => {
        assert.ok(
          visible.has(p.name) || pooled.has(p.name),
          `${type} 的模板属性 ${p.name} 既非常驻也不在可选属性池`
        );
      });
      Object.entries(raw.modeProperties || {}).forEach(([mode, list]) => {
        list.forEach((p) => {
          assert.ok(
            (config.modeProperties[mode] || []).includes(p) || pooled.has(p.name),
            `${type} 模式 ${mode} 的属性 ${p.name} 丢了`
          );
        });
      });
      (raw.exProperties || []).forEach((p) => assert.ok(pooled.has(p.name), `${type} 的原有可选属性 ${p.name} 丢了`));
    });
  });

  it('必要属性的判定 = 出现率 ≥ 门槛（或模式切换器），不足一条时兜底保留最高频项', () => {
    DATA_TYPES.forEach((type) => {
      const config = NodeTypeRegistry.getType(type);
      const lowFreq = config.properties.filter(
        (p) => !isModeSwitcher(p) && propertyFrequency(type, p) < ESSENTIAL_FREQUENCY
      );

      assert.ok(
        lowFreq.length <= 1,
        `${type} 有 ${lowFreq.length} 个低频属性被算成了必要属性（只允许兜底保留 1 个）：${lowFreq
          .map((p) => `${p.name}(${propertyFrequency(type, p)}%)`)
          .join(', ')}`
      );
      if (lowFreq.length === 1) {
        const rawProps = NodeTypeRegistry.nodeTypes[type].properties || [];
        const maxFreq = Math.max(...rawProps.map((p) => propertyFrequency(type, p)));
        assert.equal(
          propertyFrequency(type, lowFreq[0]),
          maxFreq,
          `${type} 的兜底必要属性应是模板属性里出现率最高的一项`
        );
      }
      // 反向：出现率 ≥ 门槛的属性不应被塞进可选池
      (NodeTypeRegistry.nodeTypes[type].properties || []).forEach((p) => {
        if (propertyFrequency(type, p) >= ESSENTIAL_FREQUENCY) {
          assert.ok(config.properties.includes(p), `${type} 的高频属性 ${p.name} 应是必要属性`);
        }
      });
    });
  });

  it('可选属性池按出现率降序排列（决定「标准」档加载哪几个）', () => {
    DATA_TYPES.forEach((type) => {
      const pool = collectOptionalProperties(type, NodeTypeRegistry.getType(type));
      for (let i = 1; i < pool.length; i++) {
        assert.ok(
          propertyFrequency(type, pool[i - 1]) >= propertyFrequency(type, pool[i]),
          `${type} 的可选池顺序应按出现率降序（第 ${i} 项）`
        );
      }
    });
  });

  it('最低档：只显示必要属性，一个可选属性都不加载', () => {
    NodeTypeRegistry.setPropertyLevel('minimal');
    const raw = NodeTypeRegistry.nodeTypes.recipes;
    const model = build('recipes', 1);

    assert.deepEqual(loadedNames(model), [], '最低档不应加载任何可选属性');
    assert.deepEqual(
      visibleNames(model).filter((n) => raw.properties.some((p) => p.name === n)),
      ['actionId', 'startdescription', 'requirements'],
      '最低档应只剩必要属性（出现率 ≥80% 的三项）'
    );
    ['warmup', 'description', 'effects', 'craftable', 'slots', 'hintonly'].forEach((name) =>
      assert.ok(poolNames(model).includes(name), `${name} 应在可选属性池里`)
    );
  });

  it('标准档：必要属性 + 出现率最高的 3 个可选属性', () => {
    const model = build('recipes', 1);

    assert.deepEqual(loadedNames(model), ['warmup', 'description', 'effects'], '标准档应加载出现率最高的 3 个可选属性');
    ['actionId', 'startdescription', 'requirements', 'warmup', 'description', 'effects'].forEach((name) =>
      assert.ok(visibleNames(model).includes(name), `标准档应显示 ${name}`)
    );
    assert.ok(poolNames(model).includes('craftable'), 'craftable 应留在池里');
    assert.ok(poolNames(model).includes('hintonly'), 'hintonly 应留在池里');
  });

  it('模式切换器在任何档位都常驻（被挪走会让整个模式的属性一起消失）', () => {
    NodeTypeRegistry.setPropertyLevel('minimal');
    assert.ok(NodeTypeRegistry.getType('elements').properties.some(isModeSwitcher), 'elements 的类型切换器必须常驻');
    assert.ok(NodeTypeRegistry.getType('achievements').properties.some(isModeSwitcher), 'achievements 的模式切换器必须常驻');
  });

  it('模式属性（modeProperties）同样划分：低频项进池，兜底保留模式内最高频项', () => {
    DATA_TYPES.forEach((type) => {
      const raw = NodeTypeRegistry.nodeTypes[type];
      const config = NodeTypeRegistry.getType(type);
      const pooled = new Set((config.exProperties || []).map((p) => p.name));

      Object.entries(raw.modeProperties || {}).forEach(([mode, list]) => {
        const kept = config.modeProperties[mode] || [];
        assert.ok(kept.length > 0 || list.length === 0, `${type} 的模式 ${mode} 不应被清空`);
        kept.forEach((p) => {
          assert.ok(
            isModeSwitcher(p) || propertyFrequency(type, p) >= ESSENTIAL_FREQUENCY || kept.length === 1,
            `${type} 模式 ${mode} 的 ${p.name}（${propertyFrequency(type, p)}%）不该常驻`
          );
        });
        // 降下来的模式属性必须在池里，不能丢
        list.forEach((p) => {
          assert.ok(
            kept.includes(p) || pooled.has(p.name),
            `${type} 模式 ${mode} 的属性 ${p.name} 既非常驻也不在可选属性池`
          );
        });
      });
    });
  });

  it('elements 卡牌模式：aspects 常驻，decayTo 这类低频属性进池', () => {
    const config = NodeTypeRegistry.getType('elements');
    const kept = config.modeProperties['卡牌'].map((p) => p.name);
    const pooled = config.exProperties.map((p) => p.name);

    assert.deepEqual(kept, ['aspects'], '卡牌模式应只兜底保留出现率最高的 aspects（73.2%）');
    ['decayto', 'burnto', 'animFrames', 'xexts', 'resaturate'].forEach((name) =>
      assert.ok(pooled.includes(name), `${name}（低频）应进可选属性池`)
    );
    assert.ok(!kept.includes('decayto'), 'decayTo 不应常驻');
  });

  it('没有原版数据可依据的类型（test）不做划分：模板原样', () => {
    const raw = NodeTypeRegistry.nodeTypes.test;
    const config = NodeTypeRegistry.getType('test');
    assert.deepEqual(config.properties, raw.properties, 'test 的 properties 应保持原样');
    assert.deepEqual(config.modeProperties, raw.modeProperties, 'test 的模式属性应保持原样');
    assert.deepEqual(config.exProperties, raw.exProperties, 'test 的可选属性应保持原样');
  });

  it('切档只影响此后新建的节点，已有节点属性不变', () => {
    const before = build('recipes', 1);
    const beforeCount = visibleNames(before).length;

    NodeTypeRegistry.setPropertyLevel('minimal');
    const after = build('recipes', 2);

    assert.equal(visibleNames(before).length, beforeCount, '已有节点的属性不应被改写');
    assert.ok(visibleNames(after).length < beforeCount, '新节点应按新档位（只加载必要属性）建');
  });

  it('属性池的 prop id 不与常驻属性撞车（按 id 回写不会改错属性）', () => {
    for (const level of PROPERTY_LEVELS) {
      NodeTypeRegistry.setPropertyLevel(level);
      ['recipes', 'elements', 'slots'].forEach((type) => {
        const ids = collectIds(build(type, `${type}-${level}`));
        assert.equal(new Set(ids).size, ids.length, `${type} 在 ${level} 档存在重复 prop id`);
      });
    }
  });

  it('全部档：必要属性 + 全部可选属性都加载，池子留空且可取消勾选退回池里', () => {
    NodeTypeRegistry.setPropertyLevel('full');
    const model = build('recipes', 1);
    const raw = NodeTypeRegistry.nodeTypes.recipes;
    const visible = new Set(visibleNames(model));

    assert.deepEqual(poolNames(model), [], '全部档的可选池应为空（可选属性已全部加载）');
    [...raw.properties, ...raw.exProperties].forEach((p) => assert.ok(visible.has(p.name), `全部档应显示 ${p.name}`));

    // 仍可增减：取消勾选会把它移回属性池
    const target = (model.extendedProperties?.active?.properties || []).find((p) => p.type !== 'button');
    assert.ok(target, '「当前属性」里应有可选属性');
    assert.ok(model.removeExtendProp(target.id), 'removeExtendProp 应成功');
    assert.ok(poolNames(model).includes(target.name), '取消勾选后应回到属性池');
  });

  it('划分与排序都是纯函数：不改动原模板对象', () => {
    const raw = NodeTypeRegistry.nodeTypes.recipes;
    const rawPropsLength = raw.properties.length;
    const rawPoolLength = raw.exProperties.length;
    const firstPoolName = raw.exProperties[0].name;

    applyPropertyLevel('recipes', raw);
    collectOptionalProperties('recipes', raw);
    splitEssentialProperties('recipes', raw.properties);
    sortPropertiesByFrequency('recipes', raw.exProperties);

    assert.equal(raw.properties.length, rawPropsLength, '模板 properties 不应被改写');
    assert.equal(raw.exProperties.length, rawPoolLength, '模板 exProperties 不应被改写');
    assert.equal(raw.exProperties[0].name, firstPoolName, '模板 exProperties 顺序不应被改写');
  });
});
