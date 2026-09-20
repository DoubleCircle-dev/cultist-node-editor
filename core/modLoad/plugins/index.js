'use strict';

/**
 * core/modLoad/plugins/index.js —— 字段映射插件注册表（纯函数层，不依赖 vscode）
 *
 * 背景：`mapping.js` 只收**原版本体字段**（官方 wiki 本体表 + origin 实测）。
 * 各种扩展（The Roost Machine、导入扩展、以及任何自用扩展）新增的字段，
 * 一律以「插件」形式外挂 —— 本文件就是那套挂载点。
 *
 * 职责：
 *   - 保存插件定义（内置 + 用户注册 + 从 JSON 文件加载）与启用状态；
 *   - 把启用中的插件规则**合并**进入 mapping 的规则表（`mergeInto`，不修改本体表）；
 *   - 提供**自定义 extract 解析器**注册（插件可声明内置 7 种之外的取值方式）；
 *   - 变更通知（mapping 借此重建生效规则表）。
 *
 * ── 插件定义（JS 插件）────────────────────────────────────────────────────
 * ```js
 * module.exports = {
 *     id: 'my-extension',            // 必填，唯一，小写字母/数字/._-
 *     name: '我的扩展',               // 展示名
 *     version: '1.0.0',
 *     description: '一句话说明',
 *     homepage: 'https://…',         // 可选
 *     enabled: true,                 // 可选，默认 true（注册时的初始启用状态）
 *
 *     // ① 按类别补充字段规则（与 mapping.js 本体同格式：只写「连接需求 / 中间态转化」）
 *     categories: {
 *         recipes: {
 *             fields: [
 *                 { from: 'grandReqs', link: { direction: 'input', targets: ['elements'], extract: 'map' } },
 *                 { from: 'movements', link: { direction: 'output', targets: ['elements'], extract: 'map-values' } },
 *             ],
 *         },
 *     },
 *
 *     // ② 所有类别通用（如导入扩展的 $depends；对每个已存在类别都追加）
 *     allCategories: { fields: [{ from: '$depends', link: { direction: 'input', targets: [], extract: 'scalar-list' } }] },
 *
 *     // ③ 自定义 extract 解析器（仅 JS 插件；JSON 插件只能用内置 7 种）
 *     extracts: {
 *         'my-kind': (value, rule, ctx) => [{ targetId: 'x', amount: 1 }],
 *     },
 * };
 * ```
 *
 * ── 规则写法要点（与 mapping.js 一致）────────────────────────────────────
 *   - `from`：字段名（字符串，大小写不敏感）**或正则**（RegExp，可一次命中多个字段，
 *     如 `/^effects\$(add|remove)$/` 命中属性操作字段 `effects$add`、`effects$remove`；
 *     JSON 插件只能写字符串）；
 *   - `extract`：内置 7 种（见 BUILTIN_EXTRACT_KINDS）或插件自己注册的种类；
 *   - `link`：连接需求，写法与 mapping.js 一致：
 *       `{ direction: 'input'|'output', targets: ['elements'], multi, extract, keys, attach }`
 *       —— `targets` 是目标条目类别；`attach` 为 `target→self` 表示「由目标决定」的关系（如 alt）；
 *   - `materialize`：中间态转化（`{ as: 'node'|'tool', type, inline? }`）；
 *   - ⚠️ 插件**不写** label / icon / 颜色 / 控件类型 —— 渲染是前端的事。
 *
 * ── 合并语义 ───────────────────────────────────────────────────────────
 *   - 基础规则在前、插件规则在后（追加，不覆盖）：同一字段同方向的目标 id 取并集
 *      （见 toData.detectConnections）；
 *   - 已存在的类别**只**合并 `fields` 数组，插件写不进别的类别元信息；
 *   - 插件声明的**新类别**会建出 `{ wiki, fields }` 空壳规则。
 *
 * ── 用户自定义字段（不改代码）──────────────────────────────────────────
 * 1. 写一个 JSON 插件文件（`.json`，字段同上，只能用内置 extract、`from` 只能是字符串）：
 *    ```json
 *    {
 *      "id": "my-fields",
 *      "name": "我自己的字段",
 *      "categories": {
 *        "recipes": { "outputs": [{ "from": "myReward", "label": "自定义奖励", "extract": "map" }] }
 *      }
 *    }
 *    ```
 * 2. 在设置 `cultistNodeEditor.fieldPlugins` 里填该文件或目录路径（可多个），
 *    或直接调 `plugins.loadFile(path)` / `plugins.loadDirectory(dir)`。
 */

const fs = require('fs');
const path = require('path');

/** 内置 extract 种类（实现在 mapping.collectRefTargets；此处是同名的校验清单） */
const BUILTIN_EXTRACT_KINDS = ['map', 'map-values', 'id-list', 'scalar-list', 'id', 'nested-map', 'nested-id'];

/** 插件 id 允许的形态 */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** extract 种类允许的形态 */
const KIND_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** id → { def, builtin, enabled } */
const registry = new Map();

/** 自定义 extract：kind → 解析器 */
const extractHandlers = new Map();

/** 变更监听器 */
const listeners = new Set();

/** 内置插件（require 即得到定义；顺序 = 合并顺序） */
const BUILTINS = [require('./trm'), require('./importExtension')];

/* ────────────────────────────── 校验 ────────────────────────────── */

/**
 * 校验一个插件定义。
 *
 * @param {any} def - 插件定义
 * @param {Set<string>} [ownExtracts] - 该定义**自带**的 extract 种类（规则可以引用它们）
 * @returns {string[]} 错误消息列表（空数组 = 通过）
 */
function validate(def, ownExtracts = new Set()) {
    /** @type {string[]} */
    const errors = [];
    if (!def || typeof def !== 'object' || Array.isArray(def)) return ['插件定义必须是对象'];

    if (typeof def.id !== 'string' || !ID_PATTERN.test(def.id)) {
        errors.push(`id 非法（要求小写字母/数字/._-）：${JSON.stringify(def.id)}`);
    }

    const checkRules = (where, patch) => {
        if (patch == null) return;
        if (typeof patch !== 'object' || Array.isArray(patch)) {
            errors.push(`${where} 必须是对象`);
            return;
        }
        ['fields'].forEach((listName) => {
            const list = patch[listName];
            if (list == null) return;
            if (!Array.isArray(list)) {
                errors.push(`${where}.${listName} 必须是数组`);
                return;
            }
            list.forEach((rule, i) => {
                const at = `${where}.${listName}[${i}]`;
                if (!rule || typeof rule !== 'object') {
                    errors.push(`${at} 必须是对象`);
                    return;
                }
                if (typeof rule.from !== 'string' && !(rule.from instanceof RegExp)) {
                    errors.push(`${at}.from 必须是字符串或正则`);
                }
                if (rule.link == null) return; // 只声明中间态转化的规则：不校验 link
                if (typeof rule.link !== 'object' || Array.isArray(rule.link)) {
                    errors.push(`${at}.link 必须是对象`);
                    return;
                }
                const link = rule.link;
                if (link.direction != null && !['input', 'output'].includes(link.direction)) {
                    errors.push(`${at}.link.direction 只能是 input / output`);
                }
                if (link.attach != null && !['self→target', 'target→self'].includes(link.attach)) {
                    errors.push(`${at}.link.attach 只能是 self→target / target→self`);
                }
                if (link.targets != null && !Array.isArray(link.targets)) {
                    errors.push(`${at}.link.targets 必须是数组（目标类别名）`);
                }
                const kind = link.extract || 'map';
                if (!BUILTIN_EXTRACT_KINDS.includes(kind) && !extractHandlers.has(kind) && !ownExtracts.has(kind)) {
                    errors.push(`${at}.link.extract 未知：${kind}（内置 ${BUILTIN_EXTRACT_KINDS.join('/')}，或先注册自定义）`);
                }
                if (link.keys != null && !Array.isArray(link.keys)) errors.push(`${at}.link.keys 必须是数组`);
            });
        });
    };

    checkRules('allCategories', def.allCategories);
    if (def.categories != null) {
        if (typeof def.categories !== 'object' || Array.isArray(def.categories)) {
            errors.push('categories 必须是对象（类别名 → 规则补丁）');
        } else {
            Object.entries(def.categories).forEach(([name, patch]) => checkRules(`categories.${name}`, patch));
        }
    }

    if (def.extracts != null) {
        if (typeof def.extracts !== 'object' || Array.isArray(def.extracts)) {
            errors.push('extracts 必须是对象（种类名 → 解析函数）');
        } else {
            Object.entries(def.extracts).forEach(([kind, fn]) => {
                if (!KIND_PATTERN.test(kind)) errors.push(`extracts 种类名非法：${kind}`);
                else if (typeof fn !== 'function') errors.push(`extracts.${kind} 必须是函数（JSON 插件不支持自定义 extract）`);
                else if (BUILTIN_EXTRACT_KINDS.includes(kind)) errors.push(`extracts.${kind} 与内置 extract 同名，不能覆盖`);
            });
        }
    }

    return errors;
}

/* ────────────────────────────── 变更通知 ────────────────────────────── */

/** 通知所有监听器（mapping 借此重建规则表） */
function notify() {
    listeners.forEach((fn) => {
        try {
            fn();
        } catch (e) {
            console.warn('⚠️ 插件变更监听器执行失败:', e && e.message);
        }
    });
}

/**
 * 订阅注册表变更。
 *
 * @param {() => void} fn - 变更回调
 * @returns {() => void} 取消订阅
 */
function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/* ────────────────────────────── 注册 / 启停 ────────────────────────────── */

/**
 * 注册（或同 id 覆盖）一个插件。
 *
 * @param {any} def - 插件定义（见文件头）
 * @param {{ builtin?: boolean; enabled?: boolean; silent?: boolean }} [options]
 *        builtin 内置标记；enabled 覆盖初始启用状态；silent 不触发变更通知（内部批量初始化用）
 * @returns {any} 插件记录
 * @throws {Error} 定义非法时抛出（消息含全部错误）
 */
function register(def, options = {}) {
    // 先看自带 extract 的种类名（规则允许引用它们），再整体校验
    const ownKinds = new Set(
        Object.entries((def && def.extracts) || {})
            .filter(([kind, fn]) => KIND_PATTERN.test(kind) && typeof fn === 'function')
            .map(([kind]) => kind)
    );
    const errors = validate(def, ownKinds);
    if (errors.length) throw new Error(`插件定义非法（${def && def.id}）：${errors.join('；')}`);

    // 注册自定义 extract（同种类重复注册以最后一次为准）
    ownKinds.forEach((kind) => extractHandlers.set(kind, { fn: def.extracts[kind], plugin: def.id }));

    const record = {
        def,
        builtin: !!options.builtin,
        enabled: options.enabled == null ? def.enabled !== false : !!options.enabled,
    };
    registry.set(def.id, record);
    if (!options.silent) notify();
    return record;
}

/**
 * 注销插件（内置插件也可注销，`reset()` 可恢复）。
 *
 * @param {string} id - 插件 id
 * @returns {boolean} 是否真的删掉了
 */
function unregister(id) {
    const removed = registry.delete(id);
    if (removed) notify();
    return removed;
}

/**
 * 设置启用状态（禁用 = 规则不参与合并，但定义仍留在注册表里）。
 *
 * @param {string} id - 插件 id
 * @param {boolean} enabled - 是否启用
 * @returns {boolean} 是否成功（插件不存在时 false）
 */
function setEnabled(id, enabled) {
    const record = registry.get(id);
    if (!record) return false;
    if (record.enabled !== !!enabled) {
        record.enabled = !!enabled;
        notify();
    }
    return true;
}

/** 启用插件 @param {string} id @returns {boolean} */
function enable(id) {
    return setEnabled(id, true);
}

/** 禁用插件 @param {string} id @returns {boolean} */
function disable(id) {
    return setEnabled(id, false);
}

/** 插件是否启用 @param {string} id @returns {boolean} */
function isEnabled(id) {
    const record = registry.get(id);
    return !!(record && record.enabled);
}

/** 取插件定义 @param {string} id @returns {any|null} */
function get(id) {
    const record = registry.get(id);
    return record ? record.def : null;
}

/** 全部插件 id @returns {string[]} */
function ids() {
    return [...registry.keys()];
}

/**
 * 插件清单（调试 / UI 用）。
 *
 * @returns {{ id: string; name: string; version: string; description: string; homepage: string;
 *             builtin: boolean; enabled: boolean; categories: string[]; extractKinds: string[] }[]}
 */
function list() {
    return [...registry.values()].map(({ def, builtin, enabled }) => ({
        id: def.id,
        name: def.name || def.id,
        version: def.version || '',
        description: def.description || '',
        homepage: def.homepage || '',
        builtin,
        enabled,
        categories: Object.keys(def.categories || {}),
        extractKinds: Object.keys(def.extracts || {}),
    }));
}

/* ────────────────────────────── 自定义 extract ────────────────────────────── */

/**
 * 注册自定义 extract 解析器（内置 7 种不可覆盖）。
 *
 * @param {string} kind - 种类名
 * @param {(value: any, rule: any, ctx: any) => { targetId: string; amount?: number }[]} fn - 解析器
 * @returns {() => void} 取消注册
 * @throws {Error} 种类名非法 / 与内置重名 / 不是函数
 */
function registerExtract(kind, fn) {
    if (!KIND_PATTERN.test(String(kind))) throw new Error(`extract 种类名非法：${kind}`);
    if (BUILTIN_EXTRACT_KINDS.includes(kind)) throw new Error(`不能覆盖内置 extract：${kind}`);
    if (typeof fn !== 'function') throw new Error(`extract ${kind} 必须是函数`);
    extractHandlers.set(kind, { fn, plugin: null }); // 同种类重复注册以最后一次为准
    notify();
    return () => {
        if (extractHandlers.get(kind) && extractHandlers.get(kind).fn === fn) {
            extractHandlers.delete(kind);
            notify();
        }
    };
}

/** 取自定义 extract 解析器 @param {string} kind @returns {Function|null} */
function getExtract(kind) {
    const hit = extractHandlers.get(kind);
    return hit ? hit.fn : null;
}

/** 自定义 extract 种类清单 @returns {string[]} */
function extractKinds() {
    return [...extractHandlers.keys()];
}

/* ────────────────────────────── 规则合并 ────────────────────────────── */

/** 给规则打上来源插件标记（不改原对象） */
function tagRules(rules, pluginId) {
    return (rules || []).map((rule) => ({ ...rule, plugin: pluginId }));
}

/** 把插件补丁的 fields 数组追加进目标类别 */
function appendRules(target, patch, pluginId) {
    if (!patch) return;
    ['fields'].forEach((listName) => {
        if (Array.isArray(patch[listName]) && patch[listName].length) {
            target[listName] = [...(target[listName] || []), ...tagRules(patch[listName], pluginId)];
        }
    });
}

/** 插件声明的新类别 → 空壳规则 + 插件字段 */
function newCategory(name, patch, pluginId) {
    return {
        wiki: patch.wiki || `插件 ${pluginId}`,
        fields: tagRules(patch.fields, pluginId),
    };
}

/**
 * 把启用中的插件合并进一份基础规则表，返回**新表**（基础表对象不被修改）。
 *
 * 基础规则在前、插件规则在后；已存在的类别只合并 `fields`。
 *
 * @param {Record<string, any>} baseCategories - mapping.js 的本体规则表
 * @returns {Record<string, any>} 合并后的规则表
 */
function mergeInto(baseCategories) {
    /** @type {Record<string, any>} */
    const out = {};
    Object.entries(baseCategories || {}).forEach(([name, rule]) => {
        out[name] = {
            ...rule,
            fields: tagRules(rule.fields, null),
        };
    });

    [...registry.values()]
        .filter((record) => record.enabled)
        .forEach(({ def }) => {
            Object.keys(out).forEach((name) => appendRules(out[name], def.allCategories, def.id));
            Object.entries(def.categories || {}).forEach(([name, patch]) => {
                if (out[name]) appendRules(out[name], patch, def.id);
                else out[name] = newCategory(name, patch, def.id);
            });
        });

    return out;
}

/**
 * 冲突分析：同一「类别 + 字段 + 方向」被多个来源声明时列出（调试用，不影响连接结果 —— 目标取并集）。
 *
 * 默认只报「**多个插件互撞**」：插件扩展本体字段是设计允许的（如 TRM 给 `slots` 再加一条
 * `xtrigger` 规则），不算冲突；要看这类重叠得显式传 `includeBase: true`。
 *
 * @param {Record<string, any>} mergedCategories - mergeInto 产物
 * @param {{ includeBase?: boolean }} [options] - includeBase：把与本体规则的重叠也列出来
 * @returns {{ category: string; field: string; direction: string; sources: string[] }[]} 冲突列表
 */
function conflicts(mergedCategories, options = {}) {
    const includeBase = !!options.includeBase;
    const out = [];
    Object.entries(mergedCategories || {}).forEach(([category, rule]) => {
        /** @type {Map<string, Set<string>>} */
        const byKey = new Map();
        (rule.fields || []).forEach((r) => {
            if (!r.link) return; // 只做中间态转化的规则不参与连接
            if (!r.plugin && !includeBase) return; // 本体规则：只有要求看重叠时才计入
            const field = typeof r.from === 'string' ? r.from.toLowerCase() : String(r.from);
            const key = `${r.link.direction || 'input'}:${field}`;
            if (!byKey.has(key)) byKey.set(key, { field, direction: r.link.direction || 'input', sources: new Set() });
            byKey.get(key).sources.add(r.plugin || 'mapping');
        });
        byKey.forEach(({ field, direction, sources }) => {
            if (sources.size > 1) out.push({ category, field, direction, sources: [...sources] });
        });
    });
    return out;
}

/* ────────────────────────────── 文件 / JSON 加载 ────────────────────────────── */

/**
 * 从 JSON 文本或对象加载插件（只能用内置 extract、`from` 只能是字符串）。
 *
 * @param {string|object} input - JSON 文本 或 已解析好的定义对象
 * @returns {any} 插件记录
 * @throws {Error} JSON 解析失败或定义非法
 */
function loadJSON(input) {
    let def = input;
    if (typeof input === 'string') {
        try {
            def = JSON.parse(input);
        } catch (e) {
            // 退一步尝试 JSON5（允许注释/尾逗号）—— 与 mod 数据同样的宽容度
            try {
                def = require('json5').parse(input);
            } catch (e2) {
                throw new Error(`插件 JSON 解析失败：${e.message}`);
            }
        }
    }
    return register(def);
}

/**
 * 从文件加载插件（.json / .json5）。
 *
 * @param {string} filePath - 文件路径
 * @returns {any} 插件记录
 * @throws {Error} 读文件 / 解析 / 校验失败
 */
function loadFile(filePath) {
    return loadJSON(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 批量从一个目录加载插件（按文件名排序，跳过非 json）。
 *
 * @param {string} dir - 目录路径
 * @returns {{ loaded: string[]; errors: { file: string; message: string }[] }} 加载结果
 */
function loadDirectory(dir) {
    /** @type {string[]} */
    const loaded = [];
    /** @type {{ file: string; message: string }[]} */
    const errors = [];

    let files = [];
    try {
        files = fs
            .readdirSync(dir)
            .filter((name) => /\.json5?$/i.test(name))
            .sort();
    } catch (e) {
        return { loaded, errors: [{ file: dir, message: e.message }] };
    }

    files.forEach((name) => {
        const full = path.join(dir, name);
        try {
            const record = loadFile(full);
            loaded.push(record.def.id);
        } catch (e) {
            errors.push({ file: full, message: e.message });
        }
    });

    return { loaded, errors };
}

/**
 * 按路径加载（文件或目录都行）。
 *
 * @param {string} target - 文件或目录路径
 * @returns {{ loaded: string[]; errors: { file: string; message: string }[] }} 加载结果
 */
function loadPath(target) {
    let stat;
    try {
        stat = fs.statSync(target);
    } catch (e) {
        return { loaded: [], errors: [{ file: target, message: `路径不存在：${e.message}` }] };
    }
    if (!stat.isDirectory()) {
        try {
            return { loaded: [loadFile(target).def.id], errors: [] };
        } catch (e) {
            return { loaded: [], errors: [{ file: target, message: e.message }] };
        }
    }
    return loadDirectory(target);
}

/* ────────────────────────────── 重置 ────────────────────────────── */

/**
 * 恢复初始状态：清掉所有插件与自定义 extract，重新注册内置插件（内置默认启用）。
 * 测试与「重新加载配置」用。
 *
 * @returns {void}
 */
function reset() {
    registry.clear();
    extractHandlers.clear();
    BUILTINS.forEach((def) => register(def, { builtin: true, silent: true }));
    notify();
}

// 模块加载即注册内置插件（silent：此时还没有监听器）
BUILTINS.forEach((def) => register(def, { builtin: true, silent: true }));

module.exports = {
    /** 内置 extract 种类（= mapping.EXTRACT_KINDS 的来源） */
    BUILTIN_EXTRACT_KINDS,
    /** 内置插件定义（只读参考） */
    builtins: BUILTINS,

    validate,
    register,
    unregister,
    get,
    list,
    ids,
    setEnabled,
    enable,
    disable,
    isEnabled,

    registerExtract,
    getExtract,
    extractKinds,

    mergeInto,
    conflicts,

    loadJSON,
    loadFile,
    loadDirectory,
    loadPath,

    onChange,
    reset,
};
