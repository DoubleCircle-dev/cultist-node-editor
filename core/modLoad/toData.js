'use strict';

/**
 * core/modLoad/toData.js —— 数据文件 → 节点图（nodes + edges）
 *
 * 三段式流水线（「读文件」那一步在 parse.js）：
 *
 *   ① 拆根键（parse.splitRootKeys / parse.filesToGroups）
 *      读文件 → 拿到整份 JSON → 拆出最外围键（一般 1-2 个，如 recipes / elements）；
 *      键名 = 前端节点类型，值 = 该类型的条目 list，原样交给下一步处理。
 *
 *   ② 建节点 + 连接性检测（entryToNode / detectConnections）
 *      列表里每个元素 → 一个「与根键同名」的节点（node.type = 根键）；
 *      元素每个字段逐一过检测：
 *        · 变量属性（标量值）→ 留在 node.fields，不产生连线；
 *        · mapping 白名单声明过的引用字段（inputs / outputs）→ 抽出目标 id，
 *          生成「连接线节点」（pending edge，见 buildPendingEdges），先存为待连接。
 *
 *   ③ 解析待连接（resolveEdges）
 *      本次解析范围内的节点全部建完后（scope='file' 本文件 / scope='global' 本次加载的全部文件），
 *      按 id 建索引把 pending edge 连到目标节点：
 *        · 命中 → `status='resolved'`，带 `to`；
 *        · 未命中 → 不丢弃，标为**文件外节点**（external）：
 *            `external-origin` —— 目标是游戏基础内容（运行时全局导入，前端放「上方引入区」）
 *            `external-mod`    —— 目标是用户自定义引入（前端放「左方引入区」）
 *          scope='global' 时另出「端口悬空，有未实现的目标」警告（按节点字段汇总，不刷屏）。
 *
 * 产物（buildGraph 返回值）：
 *   `{ source, modId, namespace, scope, nodes, edges, external, warnings, stats }`
 *
 * 前端消费：nodes 按 type 实例化基础类型节点 → edges 按 `from.field` 找端口连线 →
 * external 进引入区占位 → warnings 进问题提示。
 *
 * 节点结构：`{ uid, id, type, category, title, file, source, fields, refs, connections }`
 *   - `type` / `category` = 数据文件的最外围键（= 前端基础节点类型，如 recipes）；
 *   - `fields` = 变量属性（标量），按名填充前端模板属性；
 *   - `refs`   = 引用字段的原始结构（展示 / 调试用）；
 *   - `connections` = 连接性检测结果（字段 → 端口方向 → 目标 id 列表）。
 *
 * 连接线节点（edge）结构：
 *   `{ id, kind:'link', from:{uid,type,category,id,field,side,label}, targetId, amount,
 *      status:'pending'|'resolved'|'external-origin'|'external-mod', to:{uid,type,category,id}|null, external? }`
 */

const fs = require('fs');
const path = require('path');
const parse = require('./parse');
const mapping = require('./mapping');

/** origin 预加载命名空间 */
const ORIGIN_NS = 'origin';

/** 文件外节点：目标是游戏基础内容（运行时全局导入） */
const EXTERNAL_ORIGIN = 'external-origin';

/** 文件外节点：目标是用户自定义引入（其它 mod / 外部库） */
const EXTERNAL_MOD = 'external-mod';

/** 一条汇总告警里最多列几个目标 id（其余折叠成「等 N 个」） */
const WARN_TARGET_LIMIT = 5;

/** 汇总告警条数上限（超出只留一条统计，明细仍在 external 里） */
const WARN_LIMIT = 200;

/**
 * 生成带命名空间的类型 key，避免多来源同名冲突
 *
 * @param {string} namespace - 'origin' 或 mod 标识
 * @param {string} category - recipes / elements / ...
 * @param {string} rawId - 条目原始 id
 * @returns {string} 命名空间化的键
 */
function namespaceKey(namespace, category, rawId) {
    return `${namespace}:${category}:${rawId}`;
}

/**
 * 节点唯一键（uid）：命名空间 + 类别 + 原始 id，跨来源/类别都不冲突
 *
 * @param {string} namespace - 命名空间
 * @param {string} category - 类别（= 节点类型）
 * @param {string} id - 条目原始 id
 * @returns {string} 节点 uid
 */
function nodeUid(namespace, category, id) {
    return namespaceKey(namespace, category, id);
}

/**
 * 连接性检测（第 ② 步核心）：把一个条目的字段分成「变量属性」与「引用字段」。
 *
 * 判定依据**只有** mapping.js 里显式声明的 inputs / outputs —— 白名单之外的对象 / 数组字段
 * 一律当普通值处理，不猜、不推断（避免误连线）。命中的字段会连同端口方向（side）与目标 id
 * 一起返回，供 buildPendingEdges 生成「连接线节点」。
 *
 * @param {string} category - 类别（= 节点类型 = 数据文件最外围键）
 * @param {Record<string, any>} entry - 原始条目
 * @returns {{
 *     field: string;
 *     side: 'input' | 'output';
 *     label: string;
 *     extract: string;
 *     multi: boolean;
 *     targets: { targetId: string; amount: number|null }[];
 * }[]} 连接性检测结果（一个字段一条）
 */
function detectConnections(category, entry) {
    const rule = mapping.ruleFor(category);
    const { actualFieldName, collectRefTargets } = mapping.helpers;

    /** @type {ReturnType<typeof detectConnections>} */
    const connections = [];
    const seen = new Set();

    /** 按方向扫一遍声明 */
    const scan = (rules, side) => {
        (rules || []).forEach((r) => {
            const field = actualFieldName(entry, r.from);
            if (!field || seen.has(field)) return;
            const targets = collectRefTargets(entry[field], r);
            if (!targets.length) return; // 数据里没这个字段 / 形态不符 → 不虚报端口
            seen.add(field);
            connections.push({
                field,
                side,
                label: r.label || r.from,
                extract: r.extract || 'map',
                multi: r.multi !== false,
                targets,
            });
        });
    };

    scan(rule.inputs, 'input');
    scan(rule.outputs, 'output');

    return connections;
}

/**
 * 条目字段 → 属性 / 原始引用 的拆分（保留旧语义，供前端按名填属性、按 refs 展示）
 *
 * - `fields`：标量字段（string/number/boolean）—— 变量属性；
 * - `refs` ：对象字段与含对象的数组（如 effects / requirements / linked）—— 原始引用结构。
 *
 * @param {Record<string, any>} entry - 原始条目
 * @returns {{ fields: Record<string, any>; refs: Record<string, any> }} 拆分结果
 */
function splitEntryFields(entry) {
    /** @type {Record<string, any>} */
    const fields = {};
    /** @type {Record<string, any>} */
    const refs = {};

    Object.entries(entry).forEach(([k, v]) => {
        if (k === 'id') return;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            refs[k] = v; // 对象字段 → 引用结构
        } else if (Array.isArray(v) && v.some((item) => item && typeof item === 'object')) {
            refs[k] = v; // 引用数组（如 linked/alt: [{ id: ... }]）→ 引用结构
        } else {
            fields[k] = v; // 标量字段 → 变量属性
        }
    });

    return { fields, refs };
}

/**
 * 单个条目 → 节点（第 ② 步产物）
 *
 * @param {string} category - 类别（= 数据文件最外围键 = 前端节点类型）
 * @param {Record<string, any>} entry - 原始条目
 * @param {{ source?: 'origin'|'mod'; namespace: string; file?: string }} source - 来源信息
 * @returns {{
 *     uid: string; id: string; type: string; category: string; title: string;
 *     file: string; source: string;
 *     fields: Record<string, any>; refs: Record<string, any>;
 *     connections: ReturnType<typeof detectConnections>;
 *     refCount: number;
 * }} 节点
 */
function entryToNode(category, entry, source) {
    const rule = mapping.ruleFor(category);
    const title = rule.titleOf ? rule.titleOf(entry) : String(entry.id || 'untitled');
    const { fields, refs } = splitEntryFields(entry);
    const connections = detectConnections(category, entry);
    const id = String(entry.id == null ? '' : entry.id);

    return {
        uid: nodeUid(source.namespace, category, id),
        id,
        type: category,
        category,
        title,
        file: source.file || '',
        source: source.source || 'mod',
        fields,
        refs,
        connections,
        refCount: connections.reduce((n, c) => n + c.targets.length, 0),
    };
}

/**
 * 建 id → 节点 索引（跨类别；同 id 多节点时全部保留，连线会扇出到每一个）
 *
 * @param {{ id: string }[]} nodes - 节点列表
 * @returns {Map<string, any[]>} id 索引
 */
function buildIdIndex(nodes) {
    /** @type {Map<string, any[]>} */
    const index = new Map();
    (nodes || []).forEach((node) => {
        if (!node || !node.id) return;
        if (!index.has(node.id)) index.set(node.id, []);
        index.get(node.id).push(node);
    });
    return index;
}

/**
 * 建「连接线节点」待连接表（第 ② 步产物）：连接性检测结果 → 一条条待解析的 edge。
 *
 * 此时还不知道目标在不在本次解析范围里，所以 `status='pending'`、`to=null`；
 * 等所有节点建完（同一文件或全局）再交给 resolveEdges 解析。
 *
 * @param {any[]} nodes - 节点列表
 * @returns {any[]} 待连接 edge 列表
 */
function buildPendingEdges(nodes) {
    /** @type {any[]} */
    const edges = [];
    const seen = new Set();

    (nodes || []).forEach((node) => {
        if (!node || !node.id) return; // 无 id 的条目无法被引用
        (node.connections || []).forEach((conn) => {
            conn.targets.forEach(({ targetId, amount }) => {
                const id = `${node.uid}.${conn.field}#${targetId}`;
                if (seen.has(id)) return;
                seen.add(id);
                edges.push({
                    id,
                    kind: 'link',
                    from: {
                        uid: node.uid,
                        type: node.type,
                        category: node.category,
                        id: node.id,
                        field: conn.field,
                        side: conn.side,
                        label: conn.label,
                    },
                    targetId,
                    amount,
                    status: 'pending',
                    to: null,
                });
            });
        });
    });

    return edges;
}

/**
 * 判定未解析目标的归属。
 *
 * 有 origin id 索引时：命中 → `external-origin`，未命中 → `external-mod`；
 * 没有索引时（例如正在加载 origin 本身）统一按 `external-origin` 记 ——
 * origin 在初始化时全局导入，目标最终会由引入区接上。
 *
 * @param {string} targetId - 未解析的目标 id
 * @param {Set<string>|string[]|null} originIds - origin 条目 id 集合（可选）
 * @returns {'external-origin'|'external-mod'} 文件外节点标记
 */
function classifyExternal(targetId, originIds) {
    if (originIds instanceof Set) return originIds.has(targetId) ? EXTERNAL_ORIGIN : EXTERNAL_MOD;
    if (Array.isArray(originIds)) return originIds.includes(targetId) ? EXTERNAL_ORIGIN : EXTERNAL_MOD;
    return EXTERNAL_ORIGIN;
}

/**
 * 「文件外节点」→ 可读告警（按 节点.字段 汇总，一条告警列多个目标）
 *
 * @param {any[]} external - 未解析的 edge 列表
 * @returns {string[]} 汇总告警
 */
function summarizeExternal(external) {
    /** @type {Map<string, { from: any; targets: string[] }>} */
    const groups = new Map();

    (external || []).forEach((edge) => {
        const key = `${edge.from.uid}.${edge.from.field}`;
        if (!groups.has(key)) groups.set(key, { from: edge.from, targets: [] });
        const group = groups.get(key);
        if (!group.targets.includes(edge.targetId)) group.targets.push(edge.targetId);
    });

    /** @type {string[]} */
    const warnings = [];
    groups.forEach(({ from, targets }) => {
        const shown = targets.slice(0, WARN_TARGET_LIMIT).join(', ');
        const more = targets.length > WARN_TARGET_LIMIT ? ` 等 ${targets.length} 个` : '';
        warnings.push(
            `端口悬空：${from.category}:${from.id} 的 ${from.field}` +
                `（${from.side === 'input' ? '需求' : '效果'}端口）引用的目标 [${shown}${more}] 未解析（未实现的目标）`
        );
    });

    if (warnings.length > WARN_LIMIT) {
        const rest = warnings.length - WARN_LIMIT;
        warnings.length = WARN_LIMIT;
        warnings.push(`…另有 ${rest} 个节点字段端口悬空（未实现的目标），明细见 external`);
    }

    return warnings;
}

/**
 * 解析待连接（第 ③ 步）：pending edge + id 索引 → 已连接 edge / 文件外节点 / 告警。
 *
 * @param {any[]} pending - buildPendingEdges 产物
 * @param {Map<string, any[]>} index - buildIdIndex 产物
 * @param {{ scope?: 'file'|'global'; originIds?: Set<string>|string[]|null }} [options]
 *        scope='global'（读取多个文件）时才产出「端口悬空」告警；scope='file' 只标外部节点。
 * @returns {{ edges: any[]; external: any[]; warnings: string[] }} 解析结果
 */
function resolveEdges(pending, index, options = {}) {
    const scope = options.scope || 'global';
    /** @type {any[]} */
    const edges = [];
    /** @type {any[]} */
    const external = [];

    (pending || []).forEach((edge) => {
        const hits = index.get(edge.targetId);
        if (hits && hits.length) {
            hits.forEach((hit) => {
                edges.push({
                    ...edge,
                    status: 'resolved',
                    to: { uid: hit.uid, type: hit.type, category: hit.category, id: hit.id },
                });
            });
            return;
        }

        const status = classifyExternal(edge.targetId, options.originIds || null);
        const outside = { ...edge, status, to: null, external: true };
        edges.push(outside);
        external.push(outside);
    });

    return {
        edges,
        external,
        warnings: scope === 'global' ? summarizeExternal(external) : [],
    };
}

/**
 * 组装节点图：组（根键 + 条目 list）→ nodes / edges / external / warnings。
 *
 * 第 ② 步建全部节点与待连接表 → 第 ③ 步在「本次解析范围」内解析连接。
 *
 * @param {Array<{ category: string; entries: any[]; relativePath?: string; file?: string }>} groups
 *        parse.filesToGroups / splitRootKeys 产物
 * @param {{
 *     source?: 'origin'|'mod';
 *     modId?: string;
 *     namespace?: string;
 *     scope?: 'file'|'global';
 *     originIds?: Set<string>|string[]|null;
 *     fileCount?: number;
 * }} [options] - 解析选项（originIds 用于区分 external-origin / external-mod）
 * @returns {{
 *     source: string; modId: string; namespace: string; scope: string;
 *     nodes: any[]; edges: any[]; external: any[]; warnings: string[];
 *     stats: { files: number; nodes: number; edges: number; resolved: number; externalOrigin: number; externalMod: number; danglingFields: number };
 * }} 节点图
 */
function buildGraph(groups, options = {}) {
    const source = options.source || 'mod';
    const modId = options.modId || '';
    const namespace = options.namespace || modId || 'mod';
    const scope = options.scope || 'global';

    /** @type {any[]} */
    const nodes = [];
    (groups || []).forEach((group) => {
        (group.entries || []).forEach((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
            nodes.push(
                entryToNode(group.category, entry, {
                    source,
                    namespace,
                    file: group.relativePath || group.file || '',
                })
            );
        });
    });

    const index = buildIdIndex(nodes);
    const pending = buildPendingEdges(nodes);
    const { edges, external, warnings } = resolveEdges(pending, index, { ...options, scope });

    return {
        source,
        modId,
        namespace,
        scope,
        nodes,
        edges,
        external,
        warnings,
        stats: {
            files: options.fileCount == null ? (groups || []).length : options.fileCount,
            nodes: nodes.length,
            edges: edges.length,
            resolved: edges.filter((e) => e.status === 'resolved').length,
            externalOrigin: external.filter((e) => e.status === EXTERNAL_ORIGIN).length,
            externalMod: external.filter((e) => e.status === EXTERNAL_MOD).length,
            danglingFields: warnings.length,
        },
    };
}

/**
 * ContentFiles（`parse.analyzeModJSON5` 的 `modInfo.content` 结构）→ 节点图。
 *
 * 读取/拆根键交给 parse（`filesToGroups`），本函数只做「建节点 + 连接性检测 + 解析连接」，
 * 解析范围 = 本次加载的所有文件（scope='global'，因此悬空端口会出告警）。
 *
 * @param {{ relativePath?: string; fileName?: string; data: any; error?: string|null }[]} contentFiles
 * @param {{
 *     source?: 'origin'|'mod';
 *     modId?: string;
 *     namespace?: string;
 *     scope?: 'file'|'global';
 *     originIds?: Set<string>|string[]|null;
 *     fallbackCategory?: string;
 * }} [options] - originIds：origin 条目 id 集合，用于区分 external-origin / external-mod；
 *                fallbackCategory：文件没有数组键时的类别兜底（一般给所在目录名）
 * @returns {ReturnType<typeof buildGraph> & { issues: { file: string; message: string }[] }} 节点图（含跳过文件说明）
 */
function contentFilesToData(contentFiles, options = {}) {
    const { groups, issues } = parse.filesToGroups(contentFiles, { fallbackCategory: options.fallbackCategory });
    const graph = buildGraph(groups, {
        ...options,
        scope: options.scope || 'global',
        fileCount: (contentFiles || []).length,
    });

    return { ...graph, issues };
}

/**
 * 读取 origin_resources 游戏基础内容（StreamingAssets/content/core）→ 节点图（source='origin'）。
 *
 * 文件遍历与 JSON5 解析由 parse 负责；解析范围为全部 origin 文件（scope='global'）。
 * origin 自身加载时没有 origin id 索引，未解析目标统一记为 `external-origin`。
 *
 * @param {string} originContentDir - .../content/core 绝对路径
 * @returns {ReturnType<typeof buildGraph> & {
 *     files: ReturnType<typeof parse.readAllJSONFilesSync>;
 *     issues: { file: string; message: string }[];
 * }} 节点图（含原始文件列表）
 */
function loadOriginData(originContentDir) {
    /** @type {ReturnType<typeof parse.readAllJSONFilesSync>} */
    const files = [];

    if (!originContentDir || !fs.existsSync(originContentDir)) {
        const empty = buildGraph([], { source: 'origin', modId: ORIGIN_NS, namespace: ORIGIN_NS, scope: 'global', fileCount: 0 });
        return { ...empty, files, issues: [{ file: originContentDir || '', message: 'origin 内容目录不存在' }] };
    }

    files.push(...parse.readAllJSONFilesSync(originContentDir));
    const { groups, issues } = parse.filesToGroups(files);
    const graph = buildGraph(groups, {
        source: 'origin',
        modId: ORIGIN_NS,
        namespace: ORIGIN_NS,
        scope: 'global',
        fileCount: files.length,
    });

    return { ...graph, files, issues };
}

/**
 * 收集节点图里的全部条目 id（不含类别）—— 供 mod 加载时区分 external-origin / external-mod。
 *
 * @param {{ nodes?: { id: string }[] } | null} graph - buildGraph / loadOriginData 产物
 * @returns {Set<string>} id 集合
 */
function collectIds(graph) {
    /** @type {Set<string>} */
    const ids = new Set();
    ((graph && graph.nodes) || []).forEach((node) => {
        if (node && node.id) ids.add(node.id);
    });
    return ids;
}

/**
 * 单个 mod json 文件 → 节点图（功能4：预览；引用可能缺失，仅用于预览）。
 *
 * 解析范围只限本文件（scope='file'）：连不上的目标不告警，只标成文件外节点
 * （`external-origin` / `external-mod`），供前端放进引入区。
 *
 * @param {string} filePath - 待预览的 json 文件绝对路径
 * @param {string} [modId] - 命名空间（默认用文件名）
 * @returns {ReturnType<typeof buildGraph> & {
 *     fileName: string;
 *     category: string;
 *     issues: { file: string; message: string }[];
 *     error?: string;
 * }} 节点图（含文件名与首个类别）
 */
function singleFileToData(filePath, modId) {
    const fileName = path.basename(filePath);
    const ns = modId || `file:${fileName.replace(/\.[^.]+$/, '')}`;

    const file = parse.readJSONFileSync(filePath);
    if (file.error || file.data == null) {
        const empty = buildGraph([], { source: 'mod', namespace: ns, scope: 'file', fileCount: 1 });
        return {
            ...empty,
            fileName,
            category: '',
            issues: [{ file: fileName, message: file.error || '文件为空' }],
            error: file.error || '文件为空',
        };
    }

    const { groups, issues } = parse.filesToGroups([file], {
        fallbackCategory: path.basename(path.dirname(filePath)),
        includeSingle: true, // 单对象条目文件也算一个节点
    });
    const graph = buildGraph(groups, { source: 'mod', namespace: ns, scope: 'file', fileCount: 1 });

    return { ...graph, fileName, category: groups.length ? groups[0].category : '', issues };
}

module.exports = {
    ORIGIN_NS,
    EXTERNAL_ORIGIN,
    EXTERNAL_MOD,
    namespaceKey,
    nodeUid,
    detectConnections,
    splitEntryFields,
    entryToNode,
    buildIdIndex,
    buildPendingEdges,
    resolveEdges,
    buildGraph,
    collectIds,
    contentFilesToData,
    loadOriginData,
    singleFileToData,
    FileToData: singleFileToData,
};

