'use strict';

/**
 * core/service/index.js —— 后端**服务层**（纯函数层，不 require vscode）
 *
 * 它替代的是「每次打开编辑器都从头跑一遍流水线」的用法：把加载结果、解析结果与画布文档
 * 都按工作区缓存起来，并对外只暴露几个「拿数据」的入口。vscode 的接线（storageUri、
 * 文件监听、设置项、postMessage）在 `core/service/host.js`，本文件不认识 vscode。
 *
 * 三类缓存各管一段：
 *
 *   | 缓存            | 内容                          | 失效依据                    |
 *   | --------------- | ----------------------------- | --------------------------- |
 *   | `graphCache`    | mod 数据图（中间态 JSON）      | 来源文件的 mtime + size 摘要 |
 *   | `fileCache`     | 单个 json 的解析结果（内存）   | 同上，命中的文件不重复解析   |
 *   | `docStore`      | 画布文档（前端保存的页面文档）  | 无（由前端决定何时覆盖）     |
 *
 * 关键取舍：**先算签名、再决定要不要解析**。签名只需要一次目录遍历 + 若干次 stat，
 * 命中磁盘缓存时连一个 JSON 都不会解析；只有未命中才走 parse → mapping → toData。
 */

const os = require('os');
const path = require('path');
const parse = require('../modLoad/parse');
const cacheKey = require('./cacheKey');
const docStore = require('./docStore');
const graphCache = require('./graphCache');
const graphStage = require('./graphStage');
const originResource = require('./originResource');
const storage = require('./storage');

/**
 * 创建服务层实例。
 *
 * @param {{
 *     extensionRoot: string;
 *     storageDir?: string|null;
 *     log?: (message: string) => void;
 *     warn?: (message: string) => void;
 * }} deps - extensionRoot 为扩展安装目录；storageDir 为缓存根目录（缺省用系统临时目录）
 * @returns {object} 服务层实例（loadMod / refreshMod / loadOrigin / saveDoc / loadDoc / …）
 */
function createService(deps) {
    const extensionRoot = deps.extensionRoot;
    const log = deps.log || (() => {});
    const warn = deps.warn || (() => {});

    const storageDir = deps.storageDir || path.join(os.tmpdir(), 'cne-service');
    if (!deps.storageDir) warn(`⚠️ 未指定 storageDir，缓存落到临时目录：${storageDir}`);

    const origin = originResource.createOriginResource({ extensionRoot, log, warn });

    /**
     * 每个 mod 目录一份的运行时状态。
     * @type {Map<string, { fileCache: Map<string, any>; graph: any }>}
     */
    const modState = new Map();

    /**
     * 取（或建）某个 mod 的运行时状态。
     *
     * @param {string} modPath - mod 根目录（含 synopsis.json）绝对路径
     * @returns {{ fileCache: Map<string, any>; graph: any }} 状态
     */
    function stateOf(modPath) {
        const key = path.resolve(modPath);
        if (!modState.has(key)) modState.set(key, { fileCache: graphStage.createFileCache(), graph: null });
        return modState.get(key);
    }

    /**
     * mod 的缓存文件路径。
     *
     * @param {string} modPath - mod 根目录绝对路径
     * @returns {string} 数据图缓存文件绝对路径
     */
    function modCacheFile(modPath) {
        return storage.graphFile(storageDir, path.resolve(modPath));
    }

    /**
     * 读 mod 的 synopsis.json（小文件，缓存命中路径也要用它拿名称做命名空间）。
     *
     * @param {string} modPath - mod 根目录绝对路径
     * @returns {any|null} synopsis 内容
     */
    function readSynopsis(modPath) {
        return parse.readJSONFileSync(path.join(modPath, 'synopsis.json')).data || null;
    }

    /**
     * mod 的命名空间与标识（名称取自 synopsis，缺失时退回目录名）。
     *
     * @param {string} modPath - mod 根目录绝对路径
     * @returns {{ modId: string; namespace: string; synopsis: any|null }} 标识
     */
    function identityOf(modPath) {
        const synopsis = readSynopsis(modPath);
        const modId = (synopsis && synopsis.name) || path.basename(modPath);
        return { modId, namespace: `mod:${modId}`, synopsis };
    }

    /**
     * 加载 mod（缓存优先）。
     *
     * 流程：算签名 → 命中磁盘缓存就直接返回（不解析任何文件）→ 未命中才解析 + 建图 + 落盘。
     *
     * @param {string} modPath - mod 根目录（含 synopsis.json）绝对路径
     * @param {{ force?: boolean; quickLoad?: boolean; warm?: boolean }} [options]
     *        force 跳过缓存；quickLoad=false 等同 force；warm=true 且命中缓存时后台预热解析缓存
     * @returns {{
     *     graph: any; fromCache: boolean; signature: string; cacheFile: string;
     *     modPath: string; modId: string; namespace: string; synopsis: any|null;
     *     reused: number; parsed: number; synopsisOnly: boolean;
     * }} 加载结果（synopsisOnly=true 表示命中缓存、连解析都跳过了）
     */
    function loadMod(modPath, options = {}) {
        const state = stateOf(modPath);
        const contentDir = path.join(modPath, 'content');
        const signatureInfo = graphStage.signatureOfDir(contentDir);
        const cacheFile = modCacheFile(modPath);
        const identity = identityOf(modPath);

        if (options.quickLoad !== false && !options.force) {
            const hit = graphCache.readGraphCache(cacheFile, { signature: signatureInfo.signature });
            if (hit) {
                state.graph = hit.graph;
                if (options.warm) warmMod(modPath);
                log(`⚡ 节点图缓存命中：${identity.modId}（${hit.graph.nodes.length} 节点，保存于 ${hit.savedAt}）`);
                return {
                    graph: hit.graph,
                    fromCache: true,
                    signature: signatureInfo.signature,
                    cacheFile,
                    modPath,
                    ...identity,
                    reused: 0,
                    parsed: 0,
                    synopsisOnly: true,
                };
            }
        }

        // 未命中：解析（尽量复用上次的解析结果）→ 建图 → 落盘
        const collected = graphStage.collectFiles(contentDir, state.fileCache);
        const graph = graphStage.buildGraph(collected.files, {
            source: 'mod',
            modId: identity.modId,
            namespace: identity.namespace,
            scope: 'global',
            // 只拿「已经加载好的」origin 索引：拿不到就传 null（行为等同「未预加载 origin」），
            // 不为了一次分类就去加载整份 origin
            originIds: origin.idsIfLoaded(),
        });
        state.graph = graph;

        const written = graphCache.writeGraphCache(cacheFile, {
            graph,
            signature: collected.signature,
            stats: graph.stats,
        });
        if (!written.ok) warn(`⚠️ 节点图缓存写入失败（不影响本次加载）：${written.error}`);

        log(`📦 mod 加载完成：${identity.modId}（${graph.nodes.length} 节点 / ${graph.edges.length} 连接线，解析 ${collected.parsed} 个文件、复用 ${collected.reused} 个）`);

        return {
            graph,
            fromCache: false,
            signature: collected.signature,
            cacheFile,
            modPath,
            ...identity,
            reused: collected.reused,
            parsed: collected.parsed,
            synopsisOnly: false,
        };
    }

    /**
     * 后台预热某个 mod 的解析缓存。
     *
     * 命中磁盘图缓存时进程内**一份解析结果都没有**，于是第一次文件改动会被迫全量解析
     *（「只重解析变化的文件」当场失效）。预热把这一步挪到后台、不阻塞加载回发：
     * 监听触发时（至少在用户下一次保存之后）缓存已经就绪，增量路径才真的生效。
     *
     * 解析失败不影响任何东西——预热只是优化，失败就退回「改动时全量解析」。
     *
     * @param {string} modPath - mod 根目录绝对路径
     * @returns {void}
     */
    function warmMod(modPath) {
        setImmediate(() => {
            try {
                const state = stateOf(modPath);
                const collected = graphStage.collectFiles(path.join(modPath, 'content'), state.fileCache);
                log(`🔥 解析缓存预热完成：${path.basename(modPath)}（${collected.parsed} 个文件）`);
            } catch (error) {
                warn(`⚠️ 解析缓存预热失败（不影响加载）：${error.message}`);
            }
        });
    }

    /**
     * 重新加载 mod 并给出与上一张图的差异（文件监听触发）。
     *
     * 只有变化文件会重新解析（`graphStage.collectFiles` 按签名复用），建图仍是全量重跑
     * ——原因见 `graphStage.js` 文件头（跨文件同 id 去重不能分片）。
     *
     * @param {string} modPath - mod 根目录绝对路径
     * @returns {{
     *     graph: any; patch: ReturnType<typeof graphStage.diffGraphs>|null;
     *     signature: string; cacheFile: string; modPath: string;
     *     modId: string; namespace: string; synopsis: any|null;
     *     reused: number; parsed: number;
     * }} 重载结果（`patch` 为 null 表示没有上一张图可比对，调用方应发全量）
     */
    function refreshMod(modPath) {
        const state = stateOf(modPath);
        const previous = state.graph;
        const contentDir = path.join(modPath, 'content');
        const identity = identityOf(modPath);
        const cacheFile = modCacheFile(modPath);

        const collected = graphStage.collectFiles(contentDir, state.fileCache);
        const graph = graphStage.buildGraph(collected.files, {
            source: 'mod',
            modId: identity.modId,
            namespace: identity.namespace,
            scope: 'global',
            originIds: origin.idsIfLoaded(),
        });
        state.graph = graph;

        const written = graphCache.writeGraphCache(cacheFile, {
            graph,
            signature: collected.signature,
            stats: graph.stats,
        });
        if (!written.ok) warn(`⚠️ 节点图缓存写入失败（不影响本次重载）：${written.error}`);

        const patch = previous ? graphStage.diffGraphs(previous, graph) : null;
        log(
            `🔁 工作区变化重载：${identity.modId}（重新解析 ${collected.parsed} 个文件、复用 ${collected.reused} 个；` +
                `变化 ${patch ? patch.changed : '—'} 条）`
        );

        return {
            graph,
            patch,
            signature: collected.signature,
            cacheFile,
            modPath,
            ...identity,
            reused: collected.reused,
            parsed: collected.parsed,
        };
    }

    /**
     * 加载 origin（快照优先，进程内只算一次）。
     *
     * @param {{ force?: boolean }} [options] - force 时忽略内存缓存与快照
     * @returns {{ graph: any; fromSnapshot: boolean; fromCache: boolean; signature: string }} 加载结果
     */
    function loadOrigin(options = {}) {
        const loaded = origin.loadGraph(options);
        return {
            graph: loaded.graph,
            fromSnapshot: loaded.fromSnapshot,
            fromCache: loaded.fromSnapshot,
            // origin 是随扩展分发的静态资源，没有「来源文件签名」可言；给个稳定值便于日志/调试
            signature: `origin:${loaded.graph.nodes.length}:${loaded.graph.edges.length}`,
        };
    }

    /**
     * 保存画布文档（前端自动保存用）。
     *
     * @param {string} key - 文档键（一般为工作区路径；服务层会把它算成短 hash）
     * @param {any} doc - 文档内容（原样保存）
     * @param {{ meta?: any }} [options] - 附加元信息
     * @returns {ReturnType<typeof docStore.writeDoc>} 写入结果
     */
    function saveDoc(key, doc, options = {}) {
        return docStore.writeDoc(storage.docFile(storageDir, key), doc, options);
    }

    /**
     * 读取画布文档（编辑器打开时自动恢复用）。
     *
     * @param {string} key - 文档键
     * @returns {ReturnType<typeof docStore.readDoc>} 文档内容（无缓存时 doc 为 null）
     */
    function loadDoc(key) {
        return docStore.readDoc(storage.docFile(storageDir, key));
    }

    /**
     * 删除画布文档缓存。
     *
     * @param {string} key - 文档键
     * @returns {boolean} 是否已不存在
     */
    function removeDoc(key) {
        return docStore.removeDoc(storage.docFile(storageDir, key));
    }

    /**
     * 丢弃某个 mod 的运行时状态与磁盘缓存（mod 被关闭/切换时调用）。
     *
     * @param {string} modPath - mod 根目录绝对路径
     * @returns {void}
     */
    function forgetMod(modPath) {
        const key = path.resolve(modPath);
        modState.delete(key);
        graphCache.removeGraphCache(modCacheFile(modPath));
    }

    /**
     * 释放全部内存缓存。
     *
     * @returns {void}
     */
    function dispose() {
        modState.clear();
        origin.dispose();
    }

    return {
        extensionRoot,
        storageDir,
        origin,
        loadMod,
        refreshMod,
        warmMod,
        loadOrigin,
        saveDoc,
        loadDoc,
        removeDoc,
        forgetMod,
        dispose,
        // 透出给上层的纯工具
        resolveImage: origin.resolveImage,
        resolveImages: origin.resolveImages,
        readSource: origin.readSource,
        originIds: origin.ids,
        originIdsIfLoaded: origin.idsIfLoaded,
        modCacheFile,
        storageKey: cacheKey.storageKey,
    };
}

module.exports = {
    createService,
};
