'use strict';

/**
 * core/modMapping.js —— mod 原始字段 → 前端 NodeConfig 的翻译规则
 *
 * 职责：决定「mod / origin 数据里的哪些字段变成前端节点」：
 *   - inputs/outputs ：哪些对象字段变成输入/输出端口（如 recipe 的 reqs/effects）
 *   - properties      ：哪些标量字段变成属性（text/number/bool/textarea-preview）
 *   - collectAll      ：未显式列出的简单标量字段也自动收集为属性（让数据可见）
 *
 * 前端模型由 NodeConfig 定义（见 types.d.ts / ui/scripts/types/nodeTypes.js），
 * 本规则把「mod 语义字段」翻译成 NodeConfig 所需的形状，由 core/modConverter.js 消费。
 * 若需要界面化配置映射，只需把本文件改成 JSON 规则 + 少量函数即可。
 */

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
 * 对象字段 → 端口规则（如 recipe.reqs = { elementId: amount }）
 * 每个 key 生成一个端口，label/name 用 key，dataType 用 'any'（避免预览时引用缺失导致连不上）。
 *
 * @param {Record<string, any>} entry
 * @param {Array<{from:string;label?:string;multi?:boolean}>} portRules
 * @param {'input'|'output'} direction
 * @returns {Array<Record<string, any>>}
 */
function mapPorts(entry, portRules, direction) {
    /** @type {Array<Record<string, any>>} */
    const ports = [];
    if (!Array.isArray(portRules)) return ports;

    portRules.forEach((rule) => {
        const actual =
            rule.from in entry ? rule.from : Object.keys(entry).find((k) => k.toLowerCase() === rule.from.toLowerCase());
        const field = actual ? entry[actual] : undefined;
        if (!field || typeof field !== 'object' || Array.isArray(field)) return;
        Object.keys(field).forEach((key) => {
            ports.push({
                name: key,
                type: 'port',
                label: `${rule.label || rule.from}:${key}`,
                [direction === 'input' ? 'requireType' : 'returnType']: 'any',
                multiConnect: rule.multi !== false,
            });
        });
    });

    return ports;
}

/**
 * 各 category 的翻译规则。
 * colorVar 对应 ui/scripts/types/nodeTypes.js 里 nodeColorVars 的 CSS 变量名。
 */
module.exports = {
    /** 所有已定义规则（供 modConverter 查找；未定义的 category 走 fallback） */
    categories: {
        recipes: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'recipes',
            icon: '🔧',
            inputs: [
                { from: 'requirements', label: '需求', multi: true },
                { from: 'reqs', label: '需求', multi: true },
            ],
            outputs: [{ from: 'effects', label: '效果', multi: true }],
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
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
                { from: 'description_long', type: 'textarea-preview', label: '详细描述' },
            ],
        },

        decks: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'decks',
            icon: '🃏',
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
                { from: 'drawmessages', type: 'textarea-preview', label: '抽牌消息' },
            ],
        },

        endings: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'endings',
            icon: '🏁',
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
                { from: 'description_long', type: 'textarea-preview', label: '详细描述' },
            ],
        },

        legacies: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'legacies',
            icon: '📜',
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
            properties: [
                { from: 'description', type: 'textarea-preview', label: '描述' },
            ],
        },

        portals: {
            titleOf: (e) => e.label || e.id,
            colorVar: 'slots',
            icon: '🚪',
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
     * 直接展示条目原始字段。
     */
    fallback: {
        titleOf: (e) => e.label || e.id || 'untitled',
        colorVar: 'text',
        icon: '📄',
        properties: [],
        collectAll: true,
    },

    /** 供 modConverter 使用的纯函数 */
    helpers: { mapProperties, mapPorts, objectToTextProp, SIMPLE_TEXT },
};
