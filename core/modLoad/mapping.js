'use strict';

/**
 * core/modLoad/mapping.js —— mod 原始字段 → 前端节点端口 / 属性的翻译规则
 *
 * 职责：决定「mod / origin 数据里的哪些字段参与什么」：
 *
 *   - inputs / outputs ：**连接性检测白名单**（本文件的规则 = 唯一的引用判定依据）。
 *                        只有这里显式声明的字段才会产出「连接线」（edge），
 *                        未声明的对象/数组字段一律当普通值处理，不猜、不推断。
 *                        `side` 由所在数组决定：inputs = 前置/依赖（入端口），
 *                        outputs = 结果/后续（出端口）。
 *   - properties       ：哪些标量字段变成属性（text/number/bool/textarea-preview）
 *   - collectAll       ：未显式列出的简单标量字段也自动收集为属性（让数据可见）
 *
 * 引用字段的取值方式由每条规则的 extract 声明（见 EXTRACT_KINDS）：
 *
 * | extract       | 字段形态                              | 目标 id 来源            | 典型字段 |
 * | ------------- | ------------------------------------- | ---------------------- | -------- |
 * | `map`         | 对象，值多为数字                       | 对象的**键**            | requirements / effects / aspects / weights |
 * | `id-list`     | 对象数组                              | 元素 `.id`              | linked / alt / induces / consequences |
 * | `scalar-list` | 标量数组                              | 数组元素本身            | decks.spec / statusbarelements |
 * | `id`          | 标量字符串                            | 值本身                  | actionid / ending / decayTo |
 * | `nested-map`  | 对象 或 对象数组（槽位定义等）          | 子字段（keys）的**键**  | slots[].required / verbs.slot.required |
 * | `nested-id`   | 对象数组                              | 子字段（keys）的值      | mutations[].mutate |
 *
 * 规则来源：对 `core/origin_resources/StreamingAssets/content/core/**` 全量字段形态扫描
 * （见 agent-scratch 的字段扫描脚本），只声明真实出现过的引用字段。
 * 需要界面化配置映射时，只需把本文件改成「JSON 规则 + 少量函数」即可。
 */

/** extract 取值说明（供调用方/文档引用，不参与逻辑） */
const EXTRACT_KINDS = ['map', 'id-list', 'scalar-list', 'id', 'nested-map', 'nested-id'];

/** 嵌套取值（nested-*）默认探查的子字段：CS 的槽位定义用 required/forbidden/essential/consumes */
const SLOT_SUB_KEYS = ['required', 'forbidden', 'essential', 'consumes'];

const SIMPLE_TEXT = { type: 'text', label: '字段值' };

/** 对象字段兜底：转为 text（JSON 字符串）展示原始结构 */
function objectToTextProp(entry, key, label) {
    if (!(key in entry) || entry[key] == null) return null;
    const v = entry[key];
    if (typeof v === 'object') {
        return { type: 'text', name: key, label: label || key, default: JSON.stringify(v) };
    }
    return null;
}

/**
 * 组装一个 category 的属性映射结果（含 collectAll 兜底）
 *
 * @param {Record<string, any>} entry - mod 原始条目
 * @param {{ properties?: Array<{from:string;type:string;label?:string;extra?:any}>, collectAll?: boolean, skip?: string[] }} rule
 * @returns {Array<Record<string, any>>}
 */
function mapProperties(entry, rule) {
    /** @type {Array<Record<string, any>>} */
    const props = [];
    const collected = new Set(['id']);

    const add = (from, type, label, extra = {}) => {
        // 大小写不敏感匹配（CS 原始数据既有 actionId 也有 actionid 写法）
        const actual = from in entry ? from : Object.keys(entry).find((k) => k.toLowerCase() === from.toLowerCase());
        if (!actual || entry[actual] == null) return;
        collected.add(actual);
        props.push({ type, name: actual, label: label || from, default: entry[actual], ...extra });
    };

    // 1. category 显式规则
    (rule.properties || []).forEach((r) => add(r.from, r.type, r.label, r.extra));

    // 2. 兜底：收集未列出的简单标量字段（collectAll 开启时）
    if (rule.collectAll !== false) {
        Object.entries(entry).forEach(([k, v]) => {
            if (collected.has(k)) return;
            if ((rule.skip || []).includes(k)) return;
            if (typeof v === 'string') add(k, 'text', k);
            else if (typeof v === 'number') add(k, 'number', k);
            else if (typeof v === 'boolean') add(k, 'bool', k);
        });
    }

    // 3. 明显的长文本描述字段，若未显式配置则补为 textarea-preview
    ['description_long', 'startdescription'].forEach((k) => {
        if (typeof entry[k] === 'string' && !collected.has(k)) {
            add(k, 'textarea-preview', k === 'startdescription' ? '开始描述' : '详细描述');
        }
    });

    return props;
}

/**
 * 大小写不敏感地取字段真实名（CS 原始数据既有 actionId 也有 actionid 写法）
 *
 * @param {Record<string, any>} entry - 原始条目
 * @param {string} name - 声明里的字段名
 * @returns {string|null} 条目里实际存在的字段名
 */
function actualFieldName(entry, name) {
    if (name in entry) return name;
    const hit = Object.keys(entry).find((k) => k.toLowerCase() === name.toLowerCase());
    return hit || null;
}

/**
 * 按规则从引用字段值里抽出「目标 id + 数量」（连接性检测的取值层）。
 *
 * 只做形态解析，不做存在性判断 —— 目标是否存在由调用方（toData 的解析阶段）按 id 索引决定。
 * 形态不符（如声明 map 却给数组）时返回空数组，不抛错、不猜测。
 *
 * @param {any} value - 字段原始值
 * @param {{ extract?: string, keys?: string[], label?: string, from?: string }} rule - 字段规则
 * @returns {{ targetId: string; amount: number|null }[]} 目标 id 列表（已去重）
 */
function collectRefTargets(value, rule) {
    const kind = rule.extract || 'map';
    /** @type {{ targetId: string; amount: number|null }[]} */
    const out = [];

    /** 收一个目标（跳过空串/空值） */
    const push = (targetId, amount = null) => {
        const id = typeof targetId === 'string' ? targetId.trim() : '';
        if (!id) return;
        if (out.some((t) => t.targetId === id)) return;
        out.push({ targetId: id, amount: typeof amount === 'number' ? amount : null });
    };

    /** 一个「键=目标 id」的映射对象 */
    const collectMap = (obj) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
        Object.entries(obj).forEach(([key, v]) => push(key, v));
    };

    /** 遍历「对象 或 对象数组」里的每个对象 */
    const eachItem = (v, fn) => {
        if (Array.isArray(v)) v.forEach((item) => item && typeof item === 'object' && !Array.isArray(item) && fn(item));
        else if (v && typeof v === 'object') fn(v);
    };

    switch (kind) {
        case 'map':
            collectMap(value);
            break;

        case 'id-list':
            (Array.isArray(value) ? value : []).forEach((item) => {
                if (item && typeof item === 'object' && !Array.isArray(item)) push(item.id, item.chance);
                else if (typeof item === 'string') push(item);
            });
            break;

        case 'scalar-list':
            (Array.isArray(value) ? value : []).forEach((item) => {
                if (typeof item === 'string' || typeof item === 'number') push(String(item));
            });
            break;

        case 'id':
            if (typeof value === 'string') push(value);
            break;

        case 'nested-map':
            eachItem(value, (item) => {
                (rule.keys || SLOT_SUB_KEYS).forEach((key) => collectMap(item[key]));
            });
            break;

        case 'nested-id':
            eachItem(value, (item) => {
                (rule.keys || []).forEach((key) => {
                    if (typeof item[key] === 'string') push(item[key]);
                });
            });
            break;

        default:
            break;
    }

    return out;
}

/**
 * 对象字段 → 端口规则（如 recipe.reqs = { elementId: amount }）
 * 每个 key 生成一个端口，label/name 用 key，dataType 用 'any'（避免预览时引用缺失导致连不上）。
 *
 * @param {Record<string, any>} entry
 * @param {Array<{from:string;label?:string;multi?:boolean;extract?:string;keys?:string[]}>} portRules
 * @param {'input'|'output'} direction
 * @returns {Array<Record<string, any>>}
 */
function mapPorts(entry, portRules, direction) {
    /** @type {Array<Record<string, any>>} */
    const ports = [];
    if (!Array.isArray(portRules)) return ports;

    portRules.forEach((rule) => {
        const actual = actualFieldName(entry, rule.from);
        const value = actual ? entry[actual] : undefined;
        collectRefTargets(value, rule).forEach(({ targetId }) => {
            ports.push({
                name: targetId,
                type: 'port',
                label: `${rule.label || rule.from}:${targetId}`,
                [direction === 'input' ? 'requireType' : 'returnType']: 'any',
                multiConnect: rule.multi !== false,
            });
        });
    });

    return ports;
}

/** 数据里出现过的拼写差异 → 规范类别名（键均为小写） */
const CATEGORY_ALIASES = {
    legcies: 'legacies', // origin 数据里的真实拼写错误（content/core/legacies 下某文件根键）
    verb: 'verbs',
    recipe: 'recipes',
    element: 'elements',
    deck: 'decks',
    ending: 'endings',
    legacy: 'legacies',
    portal: 'portals',
    lever: 'levers',
    achievement: 'achievements',
    culture: 'cultures',
    dictum: 'dicta',
    setting: 'settings',
};

/**
 * 复数类别名 → 单数（recipes→recipe），用于别名兜底
 *
 * @param {string} key - 类别名
 * @returns {string} 单数形式
 */
function singularize(key) {
    if (key.endsWith('ies')) return key.slice(0, -3) + 'y';
    if (key.endsWith('s')) return key.slice(0, -1);
    return key;
}

/**
 * 各 category 的翻译规则。
 *
 * colorVar 对应前端 nodeTypes.js 里 nodeColorVars 的 CSS 变量名；
 * 数据的外围键（= 前端节点类型）与这里的键一致时规则生效，否则走 fallback。
 */
const RULES = {
    /** 所有已定义规则（供 ruleFor 查找；未定义的 category 走 fallback） */
    categories: {
        recipes: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'recipes',
            icon: '🔧',
            inputs: [
                { from: 'requirements', label: '需求', extract: 'map', multi: true },
                { from: 'reqs', label: '需求', extract: 'map', multi: true },
                { from: 'extantreqs', label: '存在需求', extract: 'map', multi: true },
                { from: 'tablereqs', label: '桌面需求', extract: 'map', multi: true },
                { from: 'actionid', label: '动作', extract: 'id', multi: false },
                { from: 'slots', label: '槽位', extract: 'nested-map', multi: true },
            ],
            outputs: [
                { from: 'effects', label: '效果', extract: 'map', multi: true },
                { from: 'deckeffects', label: '牌组效果', extract: 'map', multi: true },
                { from: 'aspects', label: '性相', extract: 'map', multi: true },
                { from: 'linked', label: '后续', extract: 'id-list', multi: true },
                { from: 'alt', label: '备选后续', extract: 'id-list', multi: true },
                { from: 'inductions', label: '引导', extract: 'id-list', multi: true },
                { from: 'purge', label: '清除', extract: 'map', multi: true },
                { from: 'deleteverb', label: '删除动作', extract: 'map', multi: true },
                { from: 'haltverb', label: '终止动作', extract: 'map', multi: true },
                { from: 'mutations', label: '突变', extract: 'nested-id', keys: ['mutate'], multi: true },
                { from: 'ending', label: '结局', extract: 'id', multi: false },
            ],
            properties: [
                { from: 'actionId', type: 'text', label: '动作' },
                { from: 'startdescription', type: 'textarea-preview', label: '开始描述' },
                { from: 'description', type: 'textarea-preview', label: '描述' },
                { from: 'warmup', type: 'number', label: '预热' },
                { from: 'craftable', type: 'bool', label: '可制作' },
            ],
        },

        elements: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'elements',
            icon: '🔮',
            inputs: [{ from: 'slots', label: '槽位', extract: 'nested-map', multi: true }],
            outputs: [
                { from: 'decayTo', label: '衰变为', extract: 'id', multi: false },
                { from: 'aspects', label: '性相', extract: 'map', multi: true },
                { from: 'xtriggers', label: '触发', extract: 'map', multi: true },
                { from: 'induces', label: '引导', extract: 'id-list', multi: true },
            ],
            properties: [
                { from: 'isAspect', type: 'bool', label: '性相' },
                { from: 'aspect', type: 'bool', label: '性相' },
                { from: 'description', type: 'textarea-preview', label: '描述' },
                { from: 'lifetime', type: 'number', label: '持续时间' },
                { from: 'decayTo', type: 'text', label: '衰变为' },
                { from: 'unique', type: 'bool', label: '唯一' },
            ],
        },

        verbs: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'verbs',
            icon: '⚙️',
            inputs: [{ from: 'slot', label: '槽位', extract: 'nested-map', multi: true }],
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
                { from: 'description_long', type: 'textarea-preview', label: '详细描述' },
            ],
        },

        decks: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'decks',
            icon: '🃏',
            outputs: [
                { from: 'spec', label: '牌面', extract: 'scalar-list', multi: true },
                { from: 'defaultcard', label: '默认牌', extract: 'id', multi: false },
            ],
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
                { from: 'drawmessages', type: 'textarea-preview', label: '抽牌消息' },
            ],
        },

        endings: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'endings',
            icon: '🏁',
            outputs: [{ from: 'achievements', label: '成就', extract: 'map', multi: true }],
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
                { from: 'description_long', type: 'textarea-preview', label: '详细描述' },
            ],
        },

        legacies: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'legacies',
            icon: '📜',
            inputs: [
                { from: 'fromending', label: '来自结局', extract: 'id', multi: false },
                { from: 'startingverbid', label: '起始动作', extract: 'id', multi: false },
            ],
            outputs: [
                { from: 'effects', label: '效果', extract: 'map', multi: true },
                { from: 'statusbarelements', label: '状态栏', extract: 'scalar-list', multi: true },
                { from: 'excludesOnEnding', label: '结局排除', extract: 'scalar-list', multi: true },
            ],
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
                { from: 'description_long', type: 'textarea-preview', label: '详细描述' },
            ],
        },

        achievements: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'achievements',
            icon: '🏆',
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
            ],
        },

        levers: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'levers',
            icon: '🕹️',
            outputs: [{ from: 'weights', label: '权重', extract: 'map', multi: true }],
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
            ],
        },

        portals: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'slots',
            icon: '🚪',
            outputs: [{ from: 'consequences', label: '后果', extract: 'id-list', multi: true }],
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
            ],
        },

        dicta: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'text',
            icon: '📝',
        },

        settings: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'text',
            icon: '⚙️',
        },

        cultures: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'elements',
            icon: '🌍',
        },
    },

    /**
     * 兜底规则：未定义映射的 category（或无法识别 category 的单个文件）
     * 直接展示条目原始字段（无端口 → 不产出任何连接线）。
     */
    fallback: {
        titleOf: (e) => e.label || e.id || 'untitled',
        colorVar: 'text',
        icon: '📄',
        inputs: [],
        outputs: [],
        properties: [],
        collectAll: true,
    },
};

const categories = RULES.categories;
const fallback = RULES.fallback;

/**
 * 由类别名取规则：精确命中 → 大小写不敏感 → 单复数/别名兜底 → fallback。
 *
 * @param {string} category - 数据文件的最外围键（= 前端节点类型名）
 * @returns {any} 类别规则
 */
function ruleFor(category) {
    const key = String(category == null ? '' : category).trim();
    if (categories[key]) return categories[key];

    const lower = key.toLowerCase();
    const ciHit = Object.keys(categories).find((k) => k.toLowerCase() === lower);
    if (ciHit) return categories[ciHit];

    const aliasKey = CATEGORY_ALIASES[lower] || CATEGORY_ALIASES[singularize(lower)] || CATEGORY_ALIASES[`${lower}s`];
    if (aliasKey && categories[aliasKey]) return categories[aliasKey];

    return fallback;
}

module.exports = {
    categories,
    fallback,
    /** 由名取规则（大小写/单复数/别名兜底；未知类别走 fallback） */
    ruleFor,
    /** 数据里出现过的拼写差异 → 规范类别名（节点类型仍用原始最外围键） */
    aliases: CATEGORY_ALIASES,
    /** 复数 → 单数（别名匹配用） */
    singularize,
    /** extract 取值清单（文档用途） */
    EXTRACT_KINDS,
    /** 供 toData / 其它调用方使用的纯函数 */
    helpers: { mapProperties, mapPorts, objectToTextProp, collectRefTargets, actualFieldName, SIMPLE_TEXT, SLOT_SUB_KEYS },
};
