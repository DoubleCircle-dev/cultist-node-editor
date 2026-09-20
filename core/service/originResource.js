'use strict';

/**
 * core/service/originResource.js —— origin（游戏基础内容）资源服务（纯函数，不依赖 vscode）
 *
 * 三件事，都围绕「origin 是只读且稳定的」这一前提：
 *
 *   1. **图**：优先读随扩展分发的中间态快照（`origin.graph.json`，一次 JSON.parse），
 *      快照缺失/过期时回退源文件加载（约 0.9 s）。图与 id 索引在内存里缓存，进程内只算一次。
 *   2. **图片**：`image-index.json` 的 name → 相对路径索引。本地图片目录存在就用本地文件
 *      （URL 由调用方注入的 `toUrl` 转换，通常是 webview URI），否则回退 CDN 地址。
 *      同名多义（如 `heart` 同时在 aspects 与 elements 下）时用条目所在类别目录消歧。
 *   3. **源码**：**按需**读取 —— 不预加载 origin 的 JSON 源数据；用户要看某节点的源码时，
 *      才按节点上的 `file` + `category` + `id` 去读那一个文件。
 */

const fs = require('fs');
const path = require('path');
const mapping = require('../modLoad/mapping');
const origin = require('../modLoad/origin');
const parse = require('../modLoad/parse');
const toData = require('../modLoad/toData');

/** origin_resources 下与本次服务相关的相对路径 */
const REL = {
    resources: path.join('core', 'origin_resources'),
    content: path.join('core', 'origin_resources', 'StreamingAssets', 'content', 'core'),
    images: path.join('core', 'origin_resources', 'images'),
    imageIndex: path.join('core', 'origin_resources', 'image-index.json'),
    snapshot: path.join('core', 'origin_resources', 'origin.graph.json'),
};

/**
 * 创建 origin 资源服务。
 *
 * @param {{
 *     extensionRoot: string;
 *     log?: (message: string) => void;
 *     warn?: (message: string) => void;
 * }} deps - 扩展根目录（缺省为仓库根）与日志回调
 * @returns {{
 *     paths: typeof REL;
 *     loadGraph: (options?: { force?: boolean }) => { graph: any; fromSnapshot: boolean; ids: Set<string> };
 *     ids: () => Set<string>;
 *     resolveImage: (name: string, hint?: string|null, toUrl?: ((filePath: string) => string)|null) => any;
 *     resolveImages: (names: string[], hint?: string|null, toUrl?: ((filePath: string) => string)|null) => any[];
 *     readSource: (uid: string) => any;
 *     dispose: () => void;
 * }} origin 资源服务
 */
function createOriginResource(deps) {
    const extensionRoot = deps.extensionRoot;
    const log = deps.log || (() => {});
    const warn = deps.warn || (() => {});

    const resourcesDir = path.join(extensionRoot, REL.resources);
    const contentDir = path.join(extensionRoot, REL.content);
    const imagesDir = path.join(extensionRoot, REL.images);
    const imageIndexFile = path.join(extensionRoot, REL.imageIndex);
    const snapshotFile = path.join(extensionRoot, REL.snapshot);

    /** 图片索引（懒加载一次） */
    let imageIndex = null;
    /** 图与 id 索引（懒加载一次；force 时重建） */
    let graphState = null;

    /**
     * 读图片索引（name → 相对路径数组 + CDN 基址）。
     *
     * @returns {{ cdnBase: string; images: Record<string, string[]> }} 索引（读不到时为空索引）
     */
    function readImageIndex() {
        if (imageIndex) return imageIndex;
        try {
            const parsed = JSON.parse(fs.readFileSync(imageIndexFile, 'utf8'));
            imageIndex = {
                cdnBase: String(parsed.cdnBase || ''),
                images: parsed.images && typeof parsed.images === 'object' ? parsed.images : {},
            };
        } catch (error) {
            warn(`图片索引读取失败（后续图片解析会全部未命中）：${error.message}`);
            imageIndex = { cdnBase: '', images: {} };
        }
        return imageIndex;
    }

    /**
     * 加载 origin 图（快照优先）。
     *
     * @param {{ force?: boolean }} [options] - force 时忽略内存缓存与快照，直接源文件重算
     * @returns {{ graph: any; fromSnapshot: boolean; ids: Set<string> }} 图与条目 id 索引
     */
    function loadGraph(options = {}) {
        if (!options.force && graphState) return graphState;

        const snapshot = options.force
            ? null
            : origin.loadOriginSnapshot(snapshotFile, { mappingRevision: mapping.revision() });

        if (snapshot) {
            log(`🎮 origin 快照命中（${snapshot.graph.nodes.length} 节点 / ${snapshot.graph.edges.length} 连接线）`);
            graphState = { graph: snapshot.graph, fromSnapshot: true, ids: toData.collectIds(snapshot.graph) };
            return graphState;
        }

        if (fs.existsSync(snapshotFile)) {
            warn('⚠️ origin 快照与当前规则表版本不符（或已损坏），回退源文件加载');
        }
        const graph = origin.loadOriginToData(contentDir);
        graphState = { graph, fromSnapshot: false, ids: toData.collectIds(graph) };
        return graphState;
    }

    /**
     * origin 条目 id 索引（供 mod 加载区分 external-origin / external-mod）。
     *
     * 图还没加载时会**主动加载**（快照优先）——适用于明确需要索引的调用方。
     *
     * @returns {Set<string>} id 集合
     */
    function ids() {
        return loadGraph().ids;
    }

    /**
     * 已经加载好的 origin id 索引（图不在内存里时返回 null，**不**触发加载）。
     *
     * 用途：mod 加载只想把「文件外目标」分类成 origin / mod。如果为了这个分类就强行
     * 加载整份 origin（约 400–900ms），在「关闭预加载 origin」的设置下会很突傅；
     * 拿不到索引就传 null，行为与「没有预加载」时完全一致（统一按 external-origin 记）。
     *
     * @returns {Set<string>|null} id 集合（未加载时为 null）
     */
    function idsIfLoaded() {
        return graphState ? graphState.ids : null;
    }

    /**
     * 解析一个图片名 → 可用 URL。
     *
     * 顺序：索引命中 → 类别目录消歧 → 本地文件（存在且给了 `toUrl`）→ CDN。
     *
     * @param {string} name - 数据里的图片名（如 `stagdoor`，不带扩展名）
     * @param {string|null} [hint] - 类别目录名（条目所在类别），用于同名多义消歧
     * @param {((filePath: string) => string)|null} [toUrl] - 本地绝对路径 → 可用 URL 的转换器
     * @returns {{
     *     name: string; rel: string|null; url: string; source: 'local'|'cdn'|'miss';
     *     ambiguous: boolean; candidates: string[];
     * }} 解析结果（`ambiguous` = 索引里有多个候选且没能用 hint 收敛）
     */
    function resolveImage(name, hint, toUrl) {
        const index = readImageIndex();
        const candidates = index.images[String(name == null ? '' : name)] || [];

        if (!candidates.length) {
            return { name, rel: null, url: '', source: 'miss', ambiguous: false, candidates: [] };
        }

        let rel = candidates[0];
        let ambiguous = candidates.length > 1;
        if (ambiguous && hint) {
            // 同名文件按目录归类（aspects/heart.png vs elements/heart.png）→ 用条目类别收敛
            const hit = candidates.find((c) => c.split('/')[0] === hint);
            if (hit) {
                rel = hit;
                ambiguous = false;
            }
        }

        const localFile = path.join(imagesDir, rel);
        if (typeof toUrl === 'function' && fs.existsSync(localFile)) {
            return { name, rel, url: toUrl(localFile), source: 'local', ambiguous, candidates };
        }
        return {
            name,
            rel,
            url: index.cdnBase ? index.cdnBase + rel : '',
            source: 'cdn',
            ambiguous,
            candidates,
        };
    }

    /**
     * 批量解析图片名（一次请求解决一批图标）。
     *
     * @param {string[]} names - 图片名列表
     * @param {string|null} [hint] - 类别目录名
     * @param {((filePath: string) => string)|null} [toUrl] - 本地路径 → URL 转换器
     * @returns {ReturnType<typeof resolveImage>[]} 与输入等长的结果列表
     */
    function resolveImages(names, hint, toUrl) {
        return (names || []).map((name) => resolveImage(name, hint, toUrl));
    }

    /**
     * 按需读取某个节点的源码条目（origin 的 JSON 源数据**不**预加载）。
     *
     * ⚠️ 节点的 `file` 是**相对扫描根**的路径（`toData` 刻意如此：写回时前端要用的就是
     * content 目录下的相对路径），所以要在这里拼回绝对路径才能读盘。
     *
     * 返回的是**解析后的条目对象**（`parse.smartJSON5Parse` 的产物），不是原文片段：
     * JSON5 的注释/尾逗号在解析时已被规范化，但字段与值与磁盘一致，前端可自行
     * `JSON.stringify` 展示。
     *
     * @param {string} uid - 节点 uid（中间态 JSON 里的 `node.uid`）
     * @returns {{
     *     uid: string; file: string; category: string; id: string;
     *     entry: any|null; error?: string;
     * }|null} 源码条目（节点不存在或没有来源文件时为 null）
     */
    function readSource(uid) {
        const state = loadGraph();
        const node = state.graph.nodes.find((n) => n.uid === uid);
        if (!node || !node.file) return null;

        const absolute = path.isAbsolute(node.file) ? node.file : path.join(contentDir, node.file);
        const file = parse.readJSONFileSync(absolute);
        if (file.error) {
            return { uid, file: node.file, category: node.category, id: node.id, entry: null, error: file.error };
        }

        const list = file.data && file.data[node.category];
        const entry = Array.isArray(list)
            ? list.find((item) => item && String(item.id) === String(node.id)) || null
            : null;

        return { uid, file: node.file, category: node.category, id: node.id, entry };
    }

    /**
     * 释放内存缓存（图与图片索引）。
     *
     * @returns {void}
     */
    function dispose() {
        imageIndex = null;
        graphState = null;
    }

    return {
        paths: { ...REL, resourcesDir, contentDir, imagesDir, imageIndexFile, snapshotFile },
        loadGraph,
        ids,
        idsIfLoaded,
        resolveImage,
        resolveImages,
        readSource,
        dispose,
    };
}

module.exports = {
    REL,
    createOriginResource,
};
