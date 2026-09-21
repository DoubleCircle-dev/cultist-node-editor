import { NODE_FIELD_STATS } from './nodeFieldStats.js';

/**
 * nodePropertyLevels.js —— 节点属性的「必要 / 非必要」划分与「属性档位」（最低 / 标准 / 全部）
 *
 * 两条规则：
 *
 * 1. **所有非必要属性都收进「修改可选属性」池**（`exProperties`）。
 *    模板（`nodeTypes.js`）里的 `properties`（常驻属性目录）与 `modeProperties`（各模式的
 *    属性目录）都是**完整目录**，运行时按**原版真实数据的字段出现率**逐个切开
 *    （`nodeFieldStats.js`，由 `frontend/scripts/gen-node-field-stats.mjs` 从
 *    `content/core/**` 全量条目统计）：
 *      · **必要属性**（出现率 ≥ `ESSENTIAL_FREQUENCY`，或结构必需的模式切换器 /
 *        `alwaysVisible`）→ 留在原处常驻显示；
 *      · **非必要属性**（其余）→ 全部进「可选属性」池，随时可勾选加回来，一个都不丢。
 *    某个目录一个必要属性都挑不出来时兜底保留出现率最高的一项（如 elements 的卡牌模式
 *    保留 `aspects`；slots 保留 `actionId`），节点不至于空着。
 *    没有对应原版结构的类型（test / blank / extends / copies / text / number / nodeSet /
 *    images）不做划分，模板原样。
 *
 *    ⚠️ 池子是**全局**的（不分模式）：从模式目录降下来的属性被加回来后，在另一个模式下也会
 *    显示（与「模式属性」原有设计一致——池里本来就不区分模式）。
 *
 * 2. 档位（最低 / 标准 / 全部）只决定**建节点时初始加载多少个可选属性**
 *    （`PROPERTY_LEVEL_INITIAL_OPTIONAL`）：最低 0 个、标准最常用的 3 个、全部全加载。
 *    池内顺序 = 出现率降序，所以「最常用的 N 个」就是池子最前面那几项。
 *
 * 生效时机：划分与初始加载都发生在**创建节点时**（`NodeTypeRegistry.getType` +
 * `NodeGenerator.createNode`），因此切换档位只影响此后新建的节点，画布上已有节点不变。
 */

/** 档位取值（顺序即初始加载从少到多） */
export const PROPERTY_LEVELS = ['minimal', 'standard', 'full'];

/** 默认档位 */
export const DEFAULT_PROPERTY_LEVEL = 'standard';

/**
 * 档位 → 建节点时**初始加载**的可选属性个数
 *
 * 可选属性总数少于该数时按实际数量全加载（`full` = 全加载）。
 */
export const PROPERTY_LEVEL_INITIAL_OPTIONAL = {
    minimal: 0,
    standard: 3,
    full: Infinity,
};

/**
 * 「必要属性」的出现率门槛（%）
 *
 * 原版数据里出现率 ≥ 该值的字段视为该类型的必备字段（如 recipes 的 `actionid` 99.5%），
 * 其余一律算非必要、进可选属性池。
 */
export const ESSENTIAL_FREQUENCY = 80;

/** 设置面板用的档位选项（`index.js` 的 ⚙️ 设置直接渲染这三项） */
export const PROPERTY_LEVEL_OPTIONS = [
    {
        value: 'minimal',
        label: '最低',
        description: '只显示必要属性（原版数据里普遍存在的字段），可选属性一个都不加载',
    },
    {
        value: 'standard',
        label: '标准',
        description: '必要属性 + 最常用的 3 个可选属性，其余留在「修改可选属性」池里（推荐）',
    },
    {
        value: 'full',
        label: '全部',
        description: '必要属性 + 全部可选属性都加载（池子留空，仍可在节点上取消勾选）',
    },
];

/**
 * 该档位初始加载多少个可选属性
 *
 * @param {string} level - 档位取值（非法值按默认档处理）
 * @returns {number} 0 / N / Infinity
 */
export function initialOptionalCount(level) {
    return PROPERTY_LEVEL_INITIAL_OPTIONAL[level] ?? PROPERTY_LEVEL_INITIAL_OPTIONAL[DEFAULT_PROPERTY_LEVEL];
}

/**
 * 属性与数据字段的对应键：模板属性名（`name`）与 `nodeFieldStats` 的字段名比较时
 * **大小写不敏感**（原版数据里 `actionid` / `actionId` 两种写法都有）。
 *
 * `name` 缺省或字面量 `'undefined'`（模板占位写法）时退回 `label`。
 *
 * @param {any} prop - 模板属性配置
 * @returns {string} 归一化后的键（拿不到名字时为空串）
 */
function propKey(prop) {
    const raw = prop && prop.name !== undefined && prop.name !== 'undefined' ? prop.name : prop && prop.label;
    return raw == null ? '' : String(raw).toLowerCase();
}

/**
 * 类型键 → (小写字段名 → 出现率)
 *
 * 原版数据里同一个字段可能有多种大小写写法（`actionid` / `actionId`、`startingverbid` /
 * `startingVerbId`），所以索引统一按小写建；撞名时取最大值（宁可当作更常见）。
 * 索引只建一次，之后反复查。
 *
 * @type {Map<string, Map<string, number>>}
 */
const FREQUENCY_INDEX = new Map();

/**
 * 取某个类型的字段出现率索引
 *
 * @param {string} typeKey - 基础节点类型键
 * @returns {Map<string, number>} 小写字段名 → 出现率（无统计时为空表）
 */
function frequencyIndex(typeKey) {
    let index = FREQUENCY_INDEX.get(typeKey);
    if (!index) {
        index = new Map();
        const stats = NODE_FIELD_STATS[typeKey];
        if (stats) {
            Object.entries(stats.fields).forEach(([field, pct]) => {
                const key = field.toLowerCase();
                index.set(key, Math.max(index.get(key) ?? 0, pct));
            });
        }
        FREQUENCY_INDEX.set(typeKey, index);
    }
    return index;
}

/**
 * 属性在真实数据里的出现率（0-100，拿不到统计时为 0）
 *
 * @param {string} typeKey - 基础节点类型键
 * @param {any} prop - 模板属性配置
 * @returns {number}
 */
export function propertyFrequency(typeKey, prop) {
    const key = propKey(prop);
    if (!key) return 0;
    return frequencyIndex(typeKey).get(key) ?? 0;
}

/**
 * 结构上必须常驻、但原版数据里没有同名字段（出现率统计拿不到）的属性
 *
 * 键 = 基础节点类型键，值 = 属性名（小写）。这些属性按名字强制算「必要」。
 * 不写成模板字段（`alwaysVisible: true`）是因为模板的 `.d.ts` 由 core 分支同步至此，
 * 加字段会被同步覆盖 —— 名单集中在本模块更稳。
 *
 * @type {Record<string, string[]>}
 */
const ALWAYS_ESSENTIAL = {
    // xtriggers 的「条件」是 `xtriggers` 对象的键（如 "lantern"），不是字段
    xtriggers: ['condition'],
};

/**
 * 该属性是否**结构必需**（不参与划分，永远算必要）
 *
 * 两种情形：模式切换器（决定「当前模式有哪些属性」，挪进池子会让整个模式的属性一起消失）、
 * 以及 `ALWAYS_ESSENTIAL` 名单里的属性。
 *
 * @param {string} typeKey - 基础节点类型键
 * @param {any} prop
 * @returns {boolean}
 */
function isAlwaysVisible(typeKey, prop) {
    if (!prop) return false;
    if (prop.isModeSwitcher) return true;
    const names = ALWAYS_ESSENTIAL[typeKey];
    return !!names && names.includes(propKey(prop));
}

/**
 * 把一个属性目录切成「必要属性 / 非必要属性（进池）」两份（各自保持模板顺序）
 *
 * @param {string} typeKey - 基础节点类型键（如 `recipes`）
 * @param {any[] | undefined} list - 属性目录（模板 `properties`）
 * @param {number} [threshold] - 必要性门槛（出现率 %）
 * @returns {{ essential: any[], optional: any[] }}
 */
export function splitEssentialProperties(typeKey, list, threshold = ESSENTIAL_FREQUENCY) {
    if (!Array.isArray(list) || !list.length) return { essential: [], optional: [] };

    /** @type {any[]} */
    const essential = [];
    /** @type {any[]} */
    const optional = [];
    list.forEach((prop) =>
        (isAlwaysVisible(typeKey, prop) || propertyFrequency(typeKey, prop) >= threshold ? essential : optional).push(prop)
    );

    // 兜底：一个必要属性都没有时，保留出现率最高的一项（并列取模板靠前的）
    if (!essential.length) {
        let bestIndex = 0;
        optional.forEach((prop, index) => {
            if (propertyFrequency(typeKey, prop) > propertyFrequency(typeKey, optional[bestIndex])) bestIndex = index;
        });
        essential.push(optional.splice(bestIndex, 1)[0]);
    }

    return { essential, optional };
}

/**
 * 属性列表按出现率降序排序（同率保持原顺序；无统计的类型原样返回）
 *
 * 池内顺序决定「标准」档初始加载哪几项，也决定「修改可选属性」面板里从上到下的顺序：
 * 常用的排前面，没在原版里出现过的排最后。
 *
 * @param {string} typeKey - 基础节点类型键（如 `recipes`）
 * @param {any[]} list - 属性配置数组
 * @returns {any[]} 新数组（不改动入参）
 */
export function sortPropertiesByFrequency(typeKey, list) {
    if (!Array.isArray(list) || !list.length || !NODE_FIELD_STATS[typeKey]) return [...(list || [])];

    return list
        .map((prop, index) => ({ prop, index, freq: propertyFrequency(typeKey, prop) }))
        .sort((a, b) => b.freq - a.freq || a.index - b.index)
        .map((item) => item.prop);
}

/**
 * 某个类型的全部可选属性（非必要属性），已按出现率降序
 *
 * @param {string} typeKey - 基础节点类型键（如 `recipes`）
 * @param {NodeConfig} config - 模板配置
 * @returns {any[]} 可选属性数组
 */
export function collectOptionalProperties(typeKey, config) {
    return sortPropertiesByFrequency(typeKey, config?.exProperties || []);
}

/**
 * 按「必要 / 非必要」重排一个节点类型的配置
 *
 * 返回的是**新对象**（`properties` / `exProperties` 都是新数组），原模板
 * `NodeTypeRegistry.nodeTypes` 不受影响，切档也不会改动它。
 *
 * @param {string} typeKey - 基础节点类型键（如 `recipes`）
 * @param {NodeConfig} config - 模板配置
 * @returns {NodeConfig} `properties` = 必要属性，`exProperties` = 全部非必要属性（已按出现率降序）
 */
export function applyPropertyLevel(typeKey, config) {
    // 没有真实数据可依据的类型：不做划分，模板原样（池子顺序也保持原样）
    if (!config || !NODE_FIELD_STATS[typeKey]) return config;

    // 常驻属性目录 + 每个模式各自的属性目录，各自切「必要 / 非必要」
    const { essential, optional } = splitEssentialProperties(typeKey, config.properties);

    /** @type {Record<string, any[]>} */
    const modeProperties = {};
    /** @type {any[]} */
    const optionalFromModes = [];
    Object.entries(config.modeProperties || {}).forEach(([mode, list]) => {
        const split = splitEssentialProperties(typeKey, list);
        modeProperties[mode] = split.essential;
        optionalFromModes.push(...split.optional);
    });

    // 非必要属性全部收进池子：从常驻目录、各模式目录降下来的 + 模板原本就在池里的，
    // 合并后统一按出现率降序（决定「标准」档加载哪几项、面板里的排列顺序）
    const merged = [...optional, ...optionalFromModes, ...(config.exProperties || [])];
    const seen = new Set();
    const exProperties = sortPropertiesByFrequency(typeKey, merged).filter((prop) => {
        const key = propKey(prop);
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return {
        ...config,
        properties: essential,
        modeProperties: Object.keys(modeProperties).length ? modeProperties : config.modeProperties,
        exProperties,
    };
}
