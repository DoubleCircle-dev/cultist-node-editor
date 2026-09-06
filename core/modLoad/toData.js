'use strict';

/**
 * Core/modLoad/toData.js —— mod/游戏基础内容 → 前端"数据池"（基础类型实例化数据）与「中间 JSON 模型」
 *
 * 职责（供 extension.js / origin.js 调用）：
 *
 * 1. 把读出的 mod content（parse.js analyzeModJSON5 产物）整理为按类别组织的数据条目（数据池）；
 * 2. 把单个 mod json 文件整理为节点预览数据（引用可能缺失，仅作预览）；
 * 3. BuildLinks：把条目字段对其它条目的引用解析为连接候选（中间 JSON 模型的 links）。
 *
 * 数据条目结构：{ id, title, category, file, source, fields(标量), refs(对象引用) }
 *
 * - 前端用「基础类型」（recipes/elements/...）实例化节点，按 name 填充 fields；
 * - Refs 供端口连线/展示；source 区分 origin（多余字段→custom prop）与用户 mod（不允许多余词条）。
 */

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const mapping = require('./mapping');

/** 命名空间前缀：origin 预加载 / 指定 mod */
const ORIGIN_NS = 'origin';

/**
 * 生成带命名空间的类型 key，避免多来源同名冲突
 *
 * @param {string} namespace - 'origin' 或 mod 标识
 * @param {string} category - Recipes/elements/...
 * @param {string} rawId - 条目原始 id
 */
function namespaceKey(namespace, category, rawId) {
    return `${namespace}:${category}:${rawId}`;
}

/**
 * 解析文件数据为条目数组（兼容集合文件 / 数组 / 单对象）
 *
 * @param {any} data - 一个 json 文件解析后的内容
 * @param {string} [category] - 已知类别（用于单对象时）
 * @returns {{ entries: any[]; category: string }}
 */
function extractEntries(data, category) {
    if (Array.isArray(data)) {
        return { entries: data, category: category || 'misc' };
    }
    if (data && typeof data === 'object') {
        // 集合文件：{ "recipes": [ ... ] } —— 键是复数类别名
        const keys = Object.keys(data);
        for (const key of keys) {
            if (Array.isArray(data[key])) {
                const cat = category || singularize(key);
                return { entries: data[key], category: cat };
            }
        }
        // 单对象条目：{ id, label, ... }
        return { entries: [data], category: category || 'misc' };
    }
    return { entries: [], category: category || 'misc' };
}

/** 复数类别名 → 单数（recipes→recipe），仅为兜底展示用 */
function singularize(key) {
    if (key.endsWith('ies')) return key.slice(0, -3) + 'y';
    if (key.endsWith('s')) return key.slice(0, -1);
    return key;
}

/**
 * 把单个条目转成前端可实例化的数据条目。
 *
 * 字段拆分：
 *
 * - `fields`：标量字段（string/number/boolean）—— 用于按名填充基础类型节点属性；
 * - `refs` ：对象字段（如 recipe 的 effects/requirements）—— 端口引用，供连线/展示。
 *
 * @param {string} category
 * @param {any} entry - Mod 原始条目
 * @param {{ source: 'origin' | 'mod'; file?: string }} source
 * @returns {{ id: string; title: string; category: string; file: string; source: string; fields: Record<string, any>; refs: Record<string, any> }}
 */
function entryToData(category, entry, source) {
    const rule = mapping.categories[category] || mapping.fallback;
    const title = rule.titleOf ? rule.titleOf(entry) : String(entry.id || 'untitled');

    /** @type {Record<string, any>} */
    const fields = {};
    /** @type {Record<string, any>} */
    const refs = {};

    Object.entries(entry).forEach(([k, v]) => {
        if (k === 'id') return;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            refs[k] = v; // 对象字段 → 引用
        } else if (Array.isArray(v) && v.some((item) => item && typeof item === 'object')) {
            refs[k] = v; // 引用数组（如 linked/alt: [{ id: ... }]）→ 引用
        } else {
            fields[k] = v; // 标量字段 → 属性
        }
    });

    return {
        id: String(entry.id ?? ''),
        title,
        category,
        file: source.file || '',
        source: source.source || 'mod',
        fields,
        refs,
    };
}

/**
 * 一批条目 → 数据条目列表
 *
 * @param {string} category
 * @param {any[]} entries
 * @param {{ source: 'origin' | 'mod'; file?: string }} sourceBase
 * @returns {ReturnType<typeof entryToData>[]}
 */
function entriesToData(category, entries, sourceBase) {
    return entries.filter((entry) => entry && typeof entry === 'object').map((entry) => entryToData(category, entry, sourceBase));
}

/**
 * ContentFiles（readModJSON5 的 modInfo.content 结构）→ 按类别组织的数据池
 *
 * @param {{ relativePath?: string; fileName?: string; data: any; error?: string }[]} contentFiles
 * @param {{ source?: 'origin' | 'mod'; modId?: string; namespace?: string }} [options]
 * @returns {{
 *     source: string;
 *     modId: string;
 *     namespace: string;
 *     categories: Record<string, ReturnType<typeof entryToData>[]>;
 *     links: { from: { category: string; id: string; field: string }; to: { category: string; id: string } }[];
 * }}
 */
function contentFilesToData(contentFiles, options = {}) {
    const source = options.source || 'mod';
    const modId = options.modId || '';
    const namespace = options.namespace || modId || 'mod';
    /** @type {Record<string, ReturnType<typeof entryToData>[]>} */
    const categories = {};

    (contentFiles || []).forEach((file) => {
        if (!file || file.error || file.data == null) return;
        // category 优先取相对路径首段（recipes/xxx.json → recipes）
        const rel = file.relativePath || file.fileName || '';
        const category = rel.split(/[\\/]/)[0] || 'misc';
        const { entries, category: resolvedCat } = extractEntries(file.data, category);
        const list = (categories[resolvedCat] = categories[resolvedCat] || []);
        list.push(...entriesToData(resolvedCat, entries, { source, file: rel }));
    });

    return { source, modId, namespace, categories, links: buildLinks(categories) };
}

/**
 * 读取 origin_resources 游戏基础内容（StreamingAssets/content/core），整理为数据池（source='origin'）。
 *
 * @param {string} originContentDir - .../content/core 绝对路径
 * @returns {{
 *     source: string;
 *     modId: string;
 *     namespace: string;
 *     categories: Record<string, ReturnType<typeof entryToData>[]>;
 *     files: { relativePath: string; fileName: string; data: any; error?: string }[];
 * }}
 */
function loadOriginData(originContentDir) {
    /** @type {{ relativePath: string; fileName: string; data: any; error?: string }[]} */
    const files = [];
    if (!fs.existsSync(originContentDir)) {
        return { source: 'origin', modId: ORIGIN_NS, namespace: ORIGIN_NS, categories: {}, files };
    }

    const walk = (dir, prefix) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        entries.forEach((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full, prefix ? `${prefix}/${entry.name}` : entry.name);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
                try {
                    const text = fs.readFileSync(full, 'utf8');
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch {
                        data = JSON5.parse(text);
                    }
                    files.push({ relativePath: rel, fileName: entry.name, data });
                } catch (e) {
                    files.push({ relativePath: rel, fileName: entry.name, data: null, error: e.message });
                }
            }
        });
    };
    walk(originContentDir, '');

    return { ...contentFilesToData(files, { source: 'origin', modId: ORIGIN_NS, namespace: ORIGIN_NS }), files };
}

/**
 * 从数据池构建「连接候选」——mod JSON 中条目字段对其他条目的引用（跨类别按 id 匹配）。 例如 recipe.effects = { lantern: 2 } → link { from: {recipes, sample_study, effects}, to: {elements, lantern}
 * }。 这是「中间 JSON 模型」的连接部分：前端铺图后按此在节点间建立连线，展示引用关系。
 *
 * @param {Record<string, { id: string; refs?: Record<string, any> }[]>} categories
 * @returns {{ from: { category: string; id: string; field: string }; to: { category: string; id: string } }[]}
 */
function buildLinks(categories) {
    /** @type {Map<string, { category: string; id: string }[]>} id → 所有类别的条目 */
    const byId = new Map();
    Object.entries(categories).forEach(([cat, list]) => {
        (list || []).forEach((e) => {
            if (!e || !e.id) return;
            const id = String(e.id);
            if (!byId.has(id)) byId.set(id, []);
            byId.get(id).push({ category: cat, id });
        });
    });

    /** @type {ReturnType<typeof buildLinks>} */
    const links = [];
    Object.entries(categories).forEach(([cat, list]) => {
        (list || []).forEach((e) => {
            if (!e || !e.id) return;
            Object.entries(e.refs || {}).forEach(([field, value]) => {
                if (!value || typeof value !== 'object') return;
                // 引用值形态：{ id: amount } 或数组 [{id}, ...]（取 id）
                const refIds = Array.isArray(value) ? value.map((v) => (v && typeof v === 'object' ? v.id : v)).filter(Boolean) : Object.keys(value);
                refIds.forEach((refId) => {
                    const targets = byId.get(String(refId));
                    if (!targets) return; // 悬空引用（目标未加载/缺失），暂不连线
                    targets.forEach((t) => {
                        links.push({ from: { category: cat, id: String(e.id), field }, to: t });
                    });
                });
            });
        });
    });
    return links;
}

/**
 * 解析 mod json 文件 → （功能2）
 *
 * @param {string} filePath - 待预览的 json 文件绝对路径
 * @param {string} [modId] - 命名空间（默认用文件名）
 * @returns {{
 *     source: string;
 *     namespace: string;
 *     categories: Record<string, ReturnType<typeof entryToData>[]>;
 *     category: string;
 *     fileName: string;
 *     error?: string;
 *     links: { from: { category: string; id: string; field: string }; to: { category: string; id: string } }[];
 * }}
 */

function FileToData(filePath, modId) {
    const fileName = path.basename(filePath);
    const ns = modId || `file:${fileName.replace(/\.[^.]+$/, '')}`;
    const dirName = path.basename(path.dirname(filePath));

    try {
        const text = fs.readFileSync(filePath, 'utf8');
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = JSON5.parse(text);
        }
        const { entries, category } = extractEntries(data, dirName);
        /** @type {Record<string, ReturnType<typeof entryToData>[]>} */
        const categories = {};
        categories[category] = entriesToData(category, entries, { source: 'mod', file: filePath });
        return { source: 'mod', namespace: ns, categories, category, fileName, links: buildLinks(categories) };
    } catch (e) {
        return { source: 'mod', namespace: ns, categories: {}, category: '', fileName, links: [], error: e.message };
    }
}

/**
 * 单个 mod json 文件 → 节点预览数据池（功能4） 引用可能缺失，仅用于预览；source='mod'（按用户 mod 规则，不允许多余词条）。
 *
 * @param {string} filePath - 待预览的 json 文件绝对路径
 * @param {string} [modId] - 命名空间（默认用文件名）
 * @returns {{
 *     source: string;
 *     namespace: string;
 *     categories: Record<string, ReturnType<typeof entryToData>[]>;
 *     category: string;
 *     fileName: string;
 *     error?: string;
 *     links: { from: { category: string; id: string; field: string }; to: { category: string; id: string } }[];
 * }}
 */
function singleFileToData(filePath, modId) {
    const fileName = path.basename(filePath);
    const ns = modId || `file:${fileName.replace(/\.[^.]+$/, '')}`;
    const dirName = path.basename(path.dirname(filePath));

    try {
        const text = fs.readFileSync(filePath, 'utf8');
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = JSON5.parse(text);
        }
        const { entries, category } = extractEntries(data, dirName);
        /** @type {Record<string, ReturnType<typeof entryToData>[]>} */
        const categories = {};
        categories[category] = entriesToData(category, entries, { source: 'mod', file: filePath });
        return { source: 'mod', namespace: ns, categories, category, fileName, links: buildLinks(categories) };
    } catch (e) {
        return { source: 'mod', namespace: ns, categories: {}, category: '', fileName, links: [], error: e.message };
    }
}

module.exports = {
    ORIGIN_NS,
    namespaceKey,
    extractEntries,
    entryToData,
    entriesToData,
    buildLinks,
    contentFilesToData,
    loadOriginData,
    singleFileToData,
    FileToData,
};
