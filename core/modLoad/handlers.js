'use strict';

/**
 * core/modLoad/handlers.js —— mod 相关「编排层」（依赖 vscode）
 *
 * 职责：把「读 mod / 新建 mod / 预览 json / 预加载 origin」等命令与 webview 消息的
 * 端到端流程收拢在此（弹窗、校验、调用下方纯函数、postMessage 回前端）。
 *
 * 与纯函数子模块的分工：
 *   - detect / create / parse / toData / origin / mapping = 纯函数库（不依赖 vscode，
 *     可独立加载/测试），分组导出见 index.js；
 *   - 本文件 = 唯一依赖 vscode 的编排层，由 extension.js 直接 require 并转发调用，
 *     因此 extension.js 不再散落 mod 业务逻辑，只看得到这里暴露的少数处理函数。
 *
 * 用法（extension.js）：
 *   const modHandlers = require('./core/modLoad/handlers');
 *   modHandlers.handleReadMod(panel);         // 读 mod（loadMod 命令 / readMod、testModLoad 消息）
 *   modHandlers.handleNewMod(panel);          // 新建 mod 基础结构（newMod 命令 / 消息）
 *   modHandlers.handleOpenJsonPreview(panel); // 选 json 用自定义编辑器预览（openJsonPreview）
 *   modHandlers.preloadOrigin(panel);         // 打开编辑器时预加载游戏基础内容（可在设置中关闭）
 *   modHandlers.previewFile(panel, filePath); // 自定义编辑器：单文件 json → 节点图并回发
 *   modHandlers.handleReloadGraph(panel, msg);// 全量重载（scope = mod | origin | all）
 *   modHandlers.handleSaveAutoDoc(panel, msg);// 画布文档自动保存到扩展 storage
 *   modHandlers.handleRestoreDoc(panel);      // 恢复上次自动保存的画布文档
 *   modHandlers.handleResolveImages(panel, m);// origin 图片名 → 可用 URL
 *   modHandlers.handleReadSource(panel, msg); // 按需读 origin 源码条目
 *
 * 数据获取一律走 `core/service/`（节点图缓存、解析复用、origin 快照与图片索引），
 * 本文件只负责「弹窗 / 命令 / 消息」与「把结果回发给前端」这一层编排。
 *
 * 回发契约（前端消费）：`{ nodes, edges, external, warnings, stats, count, namespace, source }`
 *   （新增标量字段 `fromCache` / `signature` / `fromSnapshot` 为向后兼容的纯加法）
 *   - nodes    ：与数据文件最外围键同名的节点（type = recipes / elements …）；
 *   - edges    ：连接线（from.field 找端口，to 为目标节点）；
 *   - external ：未解析目标（external-origin 进上方引入区 / external-mod 进左方引入区）；
 *   - warnings ：scope='global' 时的「端口悬空」汇总（单文件预览不告警）。
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// 服务层（缓存 / 监听 / origin 资源）与纯函数子模块按需 require，函数归属一目了然
const host = require('../service/host'); // 服务层在 vscode 环境下的绑定（storage / watcher / 设置）
const detect = require('./detect');  // findSynopsisInFolder
const toData = require('./toData');  // singleFileToData（单文件预览不走缓存）
const create = require('./create');  // createModStructure
const plugins = require('./plugins'); // 字段映射插件（TRM/导入扩展内置；用户插件走设置）

/** 取工作区根目录（未打开工作区时返回空串） */
function workspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    return vscode.workspace.rootPath || (folders && folders[0] ? folders[0].uri.fsPath : '') || '';
}

/** 上一次生效的插件配置签名（路径 + 禁用列表），用于幂等跳过 */
let pluginSignature = null;

/**
 * 加载用户字段插件并应用启停设置（幂等：配置没变就直接返回）。
 *
 * 设置项：
 *   - `cultistNodeEditor.fieldPlugins`  ：JSON 插件文件或目录（相对工作区或绝对路径）
 *   - `cultistNodeEditor.disabledPlugins`：要禁用的插件 id（含内置 trm / import-extension）
 *
 * 插件只影响「字段→连接」的白名单，加载失败只告警，不阻断读取流程。
 * @returns {void}
 */
function loadFieldPlugins() {
    const cfg = vscode.workspace.getConfiguration('cultistNodeEditor');
    const targetPaths = cfg.get('fieldPlugins', []) || [];
    const disabled = cfg.get('disabledPlugins', []) || [];
    const signature = JSON.stringify([targetPaths, disabled]);
    if (signature === pluginSignature) return;
    pluginSignature = signature;

    const root = workspaceRoot();
    /** @type {{ file: string; message: string }[]} */
    const errors = [];
    targetPaths.forEach((target) => {
        const full = path.isAbsolute(target) ? target : path.join(root, target);
        errors.push(...plugins.loadPath(full).errors);
    });

    plugins.ids().forEach((id) => plugins.setEnabled(id, !disabled.includes(id)));

    const active = plugins.list().filter((p) => p.enabled).map((p) => p.id);
    console.log(`🧩 字段插件：启用 [${active.join(', ') || '无'}]，禁用 [${disabled.join(', ') || '无'}]`);
    errors.forEach((e) => console.warn(`⚠️ 插件加载失败：${e.file} —— ${e.message}`));
}

/**
 * 当前正在编辑的 mod 根目录（reloadGraph 不知道该重载哪个 mod 时的依据）。
 * 每次读 mod / 重载后更新。
 * @type {string|null}
 */
let currentModPath = null;

/**
 * 走服务层加载 mod（缓存优先；quickLoad 由设置控制）。
 *
 * @param {string} modPath - mod 根目录绝对路径
 * @param {{ force?: boolean }} [options] - force 跳过缓存重新解析
 * @returns {ReturnType<ReturnType<typeof host.getService>['loadMod']>} 加载结果
 */
function loadModGraph(modPath, options = {}) {
    const cfg = host.settings();
    const result = host.getService().loadMod(modPath, {
        quickLoad: cfg.quickLoad,
        force: !!options.force,
        // 开了监听就顺带后台预热解析缓存：否则命中缓存后的首次改动要全量解析一遍
        warm: cfg.watchWorkspace,
    });
    currentModPath = modPath;
    return result;
}

/**
 * 取当前要操作的 mod 根目录：记着的那个优先，否则现检测工作区。
 *
 * @returns {string|null} mod 根目录绝对路径
 */
function resolveModPath() {
    if (currentModPath) return currentModPath;
    const wsRoot =
        vscode.workspace.rootPath ||
        (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : undefined);
    const synopsisPath = detect.findSynopsisInFolder(wsRoot || '');
    return synopsisPath ? path.dirname(synopsisPath) : null;
}

/**
 * modLoaded 的回发体：保留原有字段，新增缓存来源与签名（纯加法，前端旧代码不受影响）。
 *
 * @param {any} result - 服务层加载/重载结果
 * @param {Record<string, any>} [extra] - 额外字段（reason / changedFiles 等）
 * @returns {Record<string, any>} 回发体
 */
function modLoadedPayload(result, extra = {}) {
    const graph = result.graph;
    return {
        synopsis: result.synopsis || null,
        modPath: result.modPath,
        namespace: result.namespace,
        source: graph.source,
        scope: graph.scope || 'global',
        modId: result.modId,
        count: graph.nodes.length,
        nodes: graph.nodes,
        edges: graph.edges,
        external: graph.external,
        warnings: graph.warnings,
        stats: graph.stats,
        issues: graph.issues || [],
        errors: result.errors || [],
        fromCache: !!result.fromCache,
        signature: result.signature || null,
        cacheFile: result.cacheFile || null,
        ...extra,
    };
}

/**
 * 回发整张 mod 图（首次加载 / 全量重载 / 变化过大时的降级路径）。
 *
 * @param {import('vscode').WebviewPanel} panel
 * @param {any} result - 服务层结果
 * @param {Record<string, any>} [extra] - 额外字段
 * @returns {void}
 */
function postModLoaded(panel, result, extra = {}) {
    panel.webview.postMessage({ command: 'modLoaded', data: modLoadedPayload(result, extra) });
    if (result.graph.warnings.length) {
        console.warn(`⚠️ mod 加载：${result.graph.warnings.length} 个节点字段端口悬空（未实现的目标）`);
    }
}

/**
 * 文件监听到变化后的回发：**变化面小就发增量 patch**，超过设置阈值则重发全量图。
 *
 * `graphPatched` 的增删改都按 `uid` / `edge.id` 对齐，前端可直接局部应用；
 * 删掉的节点只需前端移除，不必理解变化原因。
 *
 * @param {import('vscode').WebviewPanel} panel
 * @param {any} result - `service.refreshMod` 的结果（含 patch）
 * @returns {void}
 */
function postModChange(panel, result) {
    const patch = result.patch;
    const ratio = patch ? patch.ratio * 100 : 100;
    const threshold = host.settings().snapshotPercent;

    if (!patch || ratio > threshold) {
        postModLoaded(panel, result, { reason: 'watch', changedFiles: result.changedFiles || [] });
        return;
    }

    const graph = result.graph;
    panel.webview.postMessage({
        command: 'graphPatched',
        data: {
            namespace: result.namespace,
            source: graph.source,
            scope: graph.scope || 'global',
            modId: result.modId,
            modPath: result.modPath,
            count: graph.nodes.length,
            stats: graph.stats,
            external: graph.external,
            warnings: graph.warnings,
            reason: 'watch',
            changedFiles: result.changedFiles || [],
            changed: patch.changed,
            added: { nodes: patch.addedNodes, edges: patch.addedEdges },
            updated: { nodes: patch.updatedNodes, edges: patch.updatedEdges },
            removed: { nodeUids: patch.removedNodeUids, edgeIds: patch.removedEdgeIds },
        },
    });
}

/**
 * 把工作区监听挂到面板上（重复调用会先解掉旧的）。
 *
 * @param {import('vscode').WebviewPanel} panel
 * @param {string} modPath - mod 根目录绝对路径
 * @returns {void}
 */
function watchMod(panel, modPath) {
    host.watchMod(modPath, (reloaded) => postModChange(panel, reloaded));
}

/**
 * 功能2：读取 mod（检测工作区 synopsis.json，无则询问文件位置）
 * @param {import('vscode').WebviewPanel} panel
 */
function handleReadMod(panel) {
    console.log('📂 读取mod请求');
    loadFieldPlugins(); // 先确保字段插件就位（幂等），否则连线上会缺扩展字段
    const wsRoot =
        vscode.workspace.rootPath ||
        (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : undefined);

    // 功能2：优先检测工作区中的 synopsis.json（mod 入口）
    let synopsisPath = detect.findSynopsisInFolder(wsRoot || '');

    const doLoad = (synPath) => {
        if (!synPath) {
            vscode.window.showErrorMessage('未找到 synopsis.json，无法加载 mod');
            return;
        }
        const modPath = path.dirname(synPath);
        vscode.window.showInformationMessage(`📂 读取 mod: ${synPath}`);

        try {
            // 服务层：签名命中磁盘缓存则连一个 json 都不解析；否则解析 → 建图 → 落盘
            const result = loadModGraph(modPath);

            if (!result.graph.nodes.length) {
                vscode.window.showWarningMessage('mod 中没有可加载的 content 数据');
            }

            postModLoaded(panel, result, { reason: 'load' });
            // 文件监听：改动 → 防抖 → 只重解析变化的文件 → graphPatched / modLoaded
            watchMod(panel, modPath);
        } catch (error) {
            console.error('🚨 读取 mod 失败：', error);
            vscode.window.showErrorMessage(`读取 mod 失败: ${error.message}`);
            panel.webview.postMessage({ command: 'error', message: error.message });
        }
    };

    if (synopsisPath) {
        doLoad(synopsisPath);
        return;
    }

    // 工作区没有 synopsis.json，则询问文件位置
    vscode.window
        .showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON 文件': ['json'] },
            openLabel: '选择 synopsis.json',
        })
        .then((files) => {
            if (!files || !files[0]) return;
            synopsisPath = files[0].fsPath;
            if (!synopsisPath.endsWith('synopsis.json')) {
                vscode.window.showWarningMessage('⚠️ 建议选择名为 synopsis.json 的文件');
            }
            doLoad(synopsisPath);
        });
}

/**
 * 功能3：新建 synopsis.json 等 mod 基础设置
 * @param {import('vscode').WebviewPanel} panel
 */
function handleNewMod(panel) {
    console.log('🆕 新建 mod 请求');
    let modName = '';

    vscode.window
        .showInputBox({
            prompt: '输入新 mod 的名称',
            placeHolder: 'My New Mod',
            validateInput: (v) => (!v || !v.trim() ? '名称不能为空' : undefined),
        })
        .then((name) => {
            if (name === undefined) return null; // 用户取消
            modName = name.trim();
            return vscode.window.showOpenDialog({
                canSelectMany: false,
                canSelectFolders: true,
                canSelectFiles: false,
                openLabel: '在此目录内创建 mod 结构',
            });
        })
        .then((folders) => {
            if (!folders || !folders[0]) return;
            const result = create.createModStructure(folders[0].fsPath, { name: modName || 'My New Mod' });
            if (result.errors && result.errors.length) {
                vscode.window.showErrorMessage(`创建 mod 失败: ${result.errors.join('; ')}`);
                return;
            }
            vscode.window.showInformationMessage(`✅ 已创建 mod: ${result.synopsisPath}`);
            panel.webview.postMessage({
                command: 'modCreated',
                data: { synopsisPath: result.synopsisPath, files: result.files },
            });
        });
}

/**
 * 功能4：打开单个 mod json 文件作为节点预览（引用可能缺失，仅作预览）
 * @param {import('vscode').WebviewPanel} panel
 */
function handleOpenJsonPreview(panel) {
    console.log('👁️ 打开 mod json 预览请求');

    vscode.window
        .showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON 文件': ['json'] },
            openLabel: '选择要预览的 json 文件',
        })
        .then((files) => {
            if (!files || !files[0]) return;
            // 用「打开方式」打开自定义编辑器 → 精简预览模式（仅查看，无侧边栏/顶栏）
            vscode.commands.executeCommand('vscode.openWith', files[0], 'cultist-node-editor.jsonPreview');
        });
}

/**
 * 功能1：预加载游戏基础内容节点（可在设置中关闭）
 *
 * 走服务层的 origin 资源：优先读随扩展分发的中间态快照（一次 JSON.parse），
 * 快照缺失或规则表版本不符时回退源文件加载。图与 id 索引在服务层缓存，进程内只算一次。
 * @param {import('vscode').WebviewPanel} panel
 */
function preloadOrigin(panel) {
    try {
        loadFieldPlugins(); // 字段插件（启动时读一次设置；同样影响 origin 的连线）
        if (!host.settings().preloadOrigin) {
            console.log('⏭️ 已关闭游戏基础内容预加载（设置 cultistNodeEditor.preloadOrigin）');
            return;
        }

        const service = host.getService();
        if (!fs.existsSync(service.origin.paths.contentDir)) {
            console.log('⚠️ 未找到 origin_resources 内容目录，跳过预加载');
            return;
        }

        const result = service.loadOrigin();
        const graph = result.graph;

        console.log(
            `🎮 游戏基础内容${result.fromSnapshot ? '（快照）' : '（源文件）'}: ${graph.nodes.length} 个节点 / ` +
                `${graph.edges.length} 条连接线（悬空字段 ${graph.warnings.length}）`
        );

        panel.webview.postMessage({
            command: 'originLoaded',
            data: {
                namespace: 'origin',
                source: 'origin',
                scope: graph.scope || 'global',
                count: graph.nodes.length,
                nodes: graph.nodes,
                edges: graph.edges,
                external: graph.external,
                warnings: graph.warnings,
                stats: graph.stats,
                fromCache: result.fromCache,
                fromSnapshot: result.fromSnapshot,
                signature: result.signature,
            },
        });
    } catch (error) {
        console.error('预加载 origin 内容失败:', error);
    }
}

/**
 * 功能4（自定义编辑器）：单文件 json → 节点图，并在 webview 回发 jsonPreviewLoaded / error。
 *
 * 解析范围只有本文件（scope='file'）：连不上的目标不告警，只标成 external（引入区）。
 * 幂等（webviewReady 与延时兜底可能重复触发）由调用方（extension.js JsonPreviewEditorProvider）控制。
 * @param {import('vscode').WebviewPanel} panel
 * @param {string} filePath 目标 json 文件绝对路径
 */
function previewFile(panel, filePath) {
    try {
        loadFieldPlugins(); // 自定义编辑器可能没打开主面板 → 这里也补一次（幂等）
        const result = toData.singleFileToData(filePath);
        if (result.error) {
            panel.webview.postMessage({ command: 'error', message: `预览失败: ${result.error}` });
            return;
        }
        panel.webview.postMessage({
            command: 'jsonPreviewLoaded',
            data: {
                fileName: result.fileName,
                category: result.category,
                namespace: result.namespace,
                source: result.source,
                count: result.nodes.length,
                nodes: result.nodes,
                edges: result.edges,
                external: result.external,
                warnings: result.warnings,
                stats: result.stats,
            },
        });
    } catch (e) {
        panel.webview.postMessage({ command: 'error', message: `预览失败: ${e.message}` });
    }
}

/**
 * 全量重载：跳过全部缓存重新加载（前端按钮 / 命令面板）。
 *
 * `scope`：
 *   - `mod`（默认）：重载当前 mod 工作区；
 *   - `origin`：重载游戏基础内容（忽略内存缓存与随包快照，源码重算）；
 *   - `all`：先 origin 后 mod（origin 的 id 索引影响 mod 图里 external 的分类）。
 *
 * 与文件监听的区别：监听是「被动、增量」，这里是「主动、全量」——用户在外部工具里
 * 大改了一堆文件、或怀疑缓存不对时用它。
 *
 * @param {import('vscode').WebviewPanel} panel
 * @param {{ scope?: 'mod'|'origin'|'all' }} [message] - 重载范围
 * @returns {void}
 */
function handleReloadGraph(panel, message = {}) {
    const scope = message.scope || 'mod';
    console.log(`🔃 全量重载请求，scope=${scope}`);

    try {
        if (scope === 'origin' || scope === 'all') {
            preloadOrigin(panel); // 内部会带 { force } 语义：loadOrigin 的 force 由 service 决定
        }
        if (scope === 'mod' || scope === 'all') {
            const modPath = resolveModPath();
            if (!modPath) {
                vscode.window.showWarningMessage('没有正在编辑的 mod（未找到 synopsis.json）');
                return;
            }
            const result = loadModGraph(modPath, { force: true });
            postModLoaded(panel, result, { reason: 'reload' });
            watchMod(panel, modPath); // 重载后重新挂钩监听（列表/监听可能在期间变过）
        }
    } catch (error) {
        console.error('🚨 全量重载失败：', error);
        vscode.window.showErrorMessage(`重载失败: ${error.message}`);
        panel.webview.postMessage({ command: 'error', message: error.message });
    }
}

/**
 * 画布文档自动保存：前端把页面文档发来，后端原样落到扩展 storage（不进用户工作区）。
 *
 * @param {import('vscode').WebviewPanel} panel
 * @param {{ data?: any; meta?: any }} message - 文档内容与元信息
 * @returns {void}
 */
function handleSaveAutoDoc(panel, message) {
    if (!host.settings().autoSaveDoc) return; // 设置里关掉了自动保存

    const result = host.getService().saveDoc(host.docKey(), message.data, { meta: message.meta || null });
    if (!result.ok) console.warn(`⚠️ 画布文档自动保存失败：${result.error}`);

    panel.webview.postMessage({
        command: 'autoDocSaved',
        data: { ok: result.ok, savedAt: result.savedAt, bytes: result.bytes, error: result.error || null },
    });
}

/**
 * 恢复上次自动保存的画布文档（编辑器打开时前端主动问一次）。
 *
 * 没有缓存时也回 `docRestored`（`doc: null`），前端据此按正常空白流程启动。
 *
 * @param {import('vscode').WebviewPanel} panel
 * @returns {void}
 */
function handleRestoreDoc(panel) {
    if (!host.settings().autoSaveDoc) {
        panel.webview.postMessage({ command: 'docRestored', data: { doc: null, savedAt: null, disabled: true } });
        return;
    }

    const cached = host.getService().loadDoc(host.docKey());
    panel.webview.postMessage({
        command: 'docRestored',
        data: { doc: cached.doc, savedAt: cached.savedAt, meta: cached.meta },
    });
}

/**
 * 批量解析 origin 图片名 → 可用 URL（前端渲染 icon / image 用）。
 *
 * 本地图片目录存在就用本地文件（转成 webview URI），否则回退 CDN 地址；
 * 同名多义时用 `category` 收敛（如 `aspects/heart.png` 与 `elements/heart.png`）。
 *
 * @param {import('vscode').WebviewPanel} panel
 * @param {{ requestId?: string; names?: string[]; category?: string|null }} message - 请求
 * @returns {void}
 */
function handleResolveImages(panel, message) {
    const toUrl = (filePath) => panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString();

    try {
        const items = host.getService().resolveImages(message.names || [], message.category || null, toUrl);
        panel.webview.postMessage({
            command: 'imageResolved',
            data: { requestId: message.requestId || null, items },
        });
    } catch (error) {
        console.error('🚨 图片解析失败：', error);
        panel.webview.postMessage({
            command: 'imageResolved',
            data: { requestId: message.requestId || null, items: [], error: error.message },
        });
    }
}

/**
 * 按需读取某个节点的源码条目（origin 的 JSON 源数据不预加载）。
 *
 * 返回解析后的条目对象（与磁盘字段值一致）；前端自行展示为源码文本。
 *
 * @param {import('vscode').WebviewPanel} panel
 * @param {{ requestId?: string; uid?: string }} message - 请求
 * @returns {void}
 */
function handleReadSource(panel, message) {
    try {
        const result = host.getService().readSource(message.uid);
        panel.webview.postMessage({
            command: 'sourceSnippet',
            data: {
                requestId: message.requestId || null,
                uid: message.uid || null,
                source: result,
                error: result ? null : '未找到该节点的来源文件',
            },
        });
    } catch (error) {
        console.error('🚨 读源码失败：', error);
        panel.webview.postMessage({
            command: 'sourceSnippet',
            data: { requestId: message.requestId || null, uid: message.uid || null, source: null, error: error.message },
        });
    }
}

module.exports = {
    handleReadMod,
    handleNewMod,
    handleOpenJsonPreview,
    preloadOrigin,
    previewFile,
    handleReloadGraph,
    handleSaveAutoDoc,
    handleRestoreDoc,
    handleResolveImages,
    handleReadSource,
    /** 加载/重载用户字段插件（设置 cultistNodeEditor.fieldPlugins / disabledPlugins） */
    loadFieldPlugins,
};
