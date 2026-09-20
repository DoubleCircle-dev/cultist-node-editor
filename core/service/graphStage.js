'use strict';

/**
 * core/service/graphStage.js —— 文件收集 / 建图 / 新旧图比对（纯函数，不依赖 vscode）
 *
 * 服务层「监听变化 → 局部重载」的实现基础，拆成三件互不依赖的事：
 *
 *   1. `collectFiles`：**按文件复用解析结果**。变化检测只 stat（mtime + size），
 *      命中的文件直接复用上次 `parse.readJSONFileSync` 的产物，只有真正变了的文件才重新解析。
 *      JSON5 容错解析是整条链路最贵的部分，跳过它就等于跳过大部分耗时。
 *   2. `buildGraph`：把文件集合交给 `toData.contentFilesToData` 建图。
 *      ⚠️ 这里刻意**全量重跑**（解析结果可复用，但建图不按文件分片）：`toData.expandEntry`
 *      的「同 id 只建一次」是**跨文件**去重，分片重跑会让「谁先建谁拥有」的归属漂移，
 *      出现重复或丢失节点。建图本身是纯内存操作，比解析便宜一个量级，不值得为此冒险。
 *   3. `diffGraphs`：新旧图按 `node.uid` / `edge.id` 比对，得出前端可局部应用的增删改。
 */

const fs = require('fs');
const path = require('path');
const parse = require('../modLoad/parse');
const toData = require('../modLoad/toData');
const cacheKey = require('./cacheKey');

/** 遍历数据目录时跳过的子目录名（图片/依赖/版本库，以及服务层自己的缓存目录名） */
const DEFAULT_EXCLUDE_DIRS = ['images', 'dll', 'node_modules', '.git', '.vscode', '.cne'];

/**
 * 递归列出目录下的 .json 文件，按相对路径排序（顺序稳定 → 建图结果稳定）。
 *
 * 只做目录遍历与路径拼接，**不读文件内容**；读不到（被删/无权限）的文件直接跳过。
 *
 * @param {string} dir - 目录绝对路径（不存在时返回空数组）
 * @param {string[]} [excludeDirs] - 跳过的子目录名
 * @returns {{ filePath: string; relativePath: string }[]} 文件清单
 */
function listJsonFiles(dir, excludeDirs = DEFAULT_EXCLUDE_DIRS) {
    /** @type {{ filePath: string; relativePath: string }[]} */
    const files = [];

    /** 深度优先遍历（同步，保持顺序确定） */
    const walk = (current) => {
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            return; // 目录不存在 / 不可读：当作没有文件
        }
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!excludeDirs.includes(entry.name)) walk(full);
                continue;
            }
            if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
            files.push({ filePath: full, relativePath: path.relative(dir, full) });
        }
    };

    walk(dir);
    return files.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
}

/**
 * 只算「目录的文件集合签名」，**不读任何文件内容**。
 *
 * 磁盘缓存的第一道闸门：签名一致就根本不必解析任何文件（这是「快速加载」的真正含义）。
 * 与 `collectFiles` 相比，这里只有一次目录遍历 + 每个文件一次 stat。
 *
 * @param {string} dir - 数据目录绝对路径
 * @param {{ excludeDirs?: string[] }} [options]
 * @returns {{ signature: string; fileCount: number }} 集合签名与文件数
 */
function signatureOfDir(dir, options = {}) {
    const listed = listJsonFiles(dir, options.excludeDirs || DEFAULT_EXCLUDE_DIRS);
    /** @type {{ relativePath: string; signature: string }[]} */
    const entries = [];

    listed.forEach(({ filePath, relativePath }) => {
        const signature = cacheKey.fileSignature(filePath);
        if (signature != null) entries.push({ relativePath, signature });
    });

    return { signature: cacheKey.signatureOf(entries), fileCount: listed.length };
}

/**
 * 建一个「文件 → 解析结果」缓存（每个 mod 目录一份）。
 *
 * @returns {Map<string, { signature: string; file: any }>} 空缓存
 */
function createFileCache() {
    return new Map();
}

/**
 * 收集并解析目录下的 json 文件，尽量复用缓存。
 *
 * 返回的 `files` 与 `parse.readAllJSONFilesSync` 同形（含 `data` / `relativePath` / `error`），
 * 可直接喂给 `toData.contentFilesToData`；`signature` 用于判断磁盘缓存是否仍然有效。
 *
 * 顺带清理缓存里已不存在的文件条目（文件被移动/重命名后不会一直占着内存）。
 *
 * @param {string} dir - 数据目录（如 mod 的 content 目录）绝对路径
 * @param {Map<string, { signature: string; file: any }>} fileCache - 解析结果缓存
 * @param {{ excludeDirs?: string[] }} [options]
 * @returns {{ files: any[]; signature: string; reused: number; parsed: number; fileCount: number }} 收集结果
 */
function collectFiles(dir, fileCache, options = {}) {
    const listed = listJsonFiles(dir, options.excludeDirs || DEFAULT_EXCLUDE_DIRS);
    /** @type {{ relativePath: string; signature: string }[]} */
    const entries = [];
    /** @type {any[]} */
    const files = [];
    let reused = 0;
    let parsed = 0;

    listed.forEach(({ filePath, relativePath }) => {
        const signature = cacheKey.fileSignature(filePath);
        if (signature == null) return; // 读不到属性（被删/无权限）→ 当它不存在
        entries.push({ relativePath, signature });

        const hit = fileCache.get(filePath);
        if (hit && hit.signature === signature) {
            files.push(hit.file);
            reused += 1;
            return;
        }

        const file = parse.readJSONFileSync(filePath);
        file.relativePath = relativePath; // readJSONFileSync 默认只给文件名，这里补上相对路径（类别判定要用）
        fileCache.set(filePath, { signature, file });
        files.push(file);
        parsed += 1;
    });

    // 清理已消失的文件（缓存只增不减会随编辑会话一直涨）
    const live = new Set(listed.map((f) => f.filePath));
    Array.from(fileCache.keys()).forEach((key) => {
        if (!live.has(key)) fileCache.delete(key);
    });

    return { files, signature: cacheKey.signatureOf(entries), reused, parsed, fileCount: files.length };
}

/**
 * 文件集合 → 节点图（中间态 JSON）。
 *
 * @param {any[]} files - `collectFiles` 的 files（或 parse 的产物）
 * @param {{ source?: 'origin'|'mod'; modId?: string; namespace: string; scope?: 'file'|'global'; originIds?: Set<string>|string[]|null }} options
 * @returns {ReturnType<typeof toData.contentFilesToData>} 节点图（含 issues）
 */
function buildGraph(files, options) {
    return toData.contentFilesToData(files, options);
}

/**
 * 节点 / 连线的内容指纹。
 *
 * 图的每次重建都会产生全新对象，不能用引用比较；这里直接序列化比较（监听只覆盖用户自己的
 * mod 工作区，规模远小于 origin 全量，代价可接受）。
 *
 * @param {any} item - 节点或连线
 * @returns {string} 指纹
 */
function fingerprint(item) {
    return JSON.stringify(item);
}

/**
 * 新旧图比对：得出前端可局部应用的增删改。
 *
 * 节点按 `uid`、连线按 `id` 对齐；`ratio` = 变化条目数 / 旧图条目数，供调用方决定
 * 「发增量 patch」还是「直接重发全量图」（变化太大时增量反而不划算）。
 *
 * @param {{ nodes?: any[]; edges?: any[] }|null} prev - 变更前的图（没有则视为全新增）
 * @param {{ nodes?: any[]; edges?: any[] }} next - 变更后的图
 * @returns {{
 *     addedNodes: any[]; updatedNodes: any[]; removedNodeUids: string[];
 *     addedEdges: any[]; updatedEdges: any[]; removedEdgeIds: string[];
 *     changed: number; previous: number; ratio: number;
 * }} 差异（ratio > 1 时按 1 处理）
 */
function diffGraphs(prev, next) {
    const prevNodes = new Map(((prev && prev.nodes) || []).map((n) => [n.uid, n]));
    const nextNodes = new Map(((next && next.nodes) || []).map((n) => [n.uid, n]));
    const prevEdges = new Map(((prev && prev.edges) || []).map((e) => [e.id, e]));
    const nextEdges = new Map(((next && next.edges) || []).map((e) => [e.id, e]));

    /** @type {any[]} */ const addedNodes = [];
    /** @type {any[]} */ const updatedNodes = [];
    nextNodes.forEach((node, uid) => {
        const before = prevNodes.get(uid);
        if (!before) addedNodes.push(node);
        else if (fingerprint(before) !== fingerprint(node)) updatedNodes.push(node);
    });
    /** @type {string[]} */
    const removedNodeUids = Array.from(prevNodes.keys()).filter((uid) => !nextNodes.has(uid));

    /** @type {any[]} */ const addedEdges = [];
    /** @type {any[]} */ const updatedEdges = [];
    nextEdges.forEach((edge, id) => {
        const before = prevEdges.get(id);
        if (!before) addedEdges.push(edge);
        else if (fingerprint(before) !== fingerprint(edge)) updatedEdges.push(edge);
    });
    /** @type {string[]} */
    const removedEdgeIds = Array.from(prevEdges.keys()).filter((id) => !nextEdges.has(id));

    const changed =
        addedNodes.length + updatedNodes.length + removedNodeUids.length + addedEdges.length + updatedEdges.length + removedEdgeIds.length;
    const previous = (prev ? (prev.nodes || []).length + (prev.edges || []).length : 0);

    return {
        addedNodes,
        updatedNodes,
        removedNodeUids,
        addedEdges,
        updatedEdges,
        removedEdgeIds,
        changed,
        previous,
        ratio: previous ? Math.min(1, changed / previous) : 1,
    };
}

module.exports = {
    DEFAULT_EXCLUDE_DIRS,
    listJsonFiles,
    signatureOfDir,
    createFileCache,
    collectFiles,
    buildGraph,
    diffGraphs,
};
