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
 *
 * 回发契约（前端消费）：`{ nodes, edges, external, warnings, stats, count, namespace, source }`
 *   - nodes    ：与数据文件最外围键同名的节点（type = recipes / elements …）；
 *   - edges    ：连接线（from.field 找端口，to 为目标节点）；
 *   - external ：未解析目标（external-origin 进上方引入区 / external-mod 进左方引入区）；
 *   - warnings ：scope='global' 时的「端口悬空」汇总（单文件预览不告警）。
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// 纯函数子模块按需 require，函数归属一目了然
const detect = require('./detect');  // findSynopsisInFolder
const parseMod = require('./parse'); // analyzeModJSON5
const toData = require('./toData');  // buildGraph / contentFilesToData / loadOriginData / singleFileToData / collectIds
const create = require('./create');  // createModStructure
const origin = require('./origin');  // loadOriginToData（封装 toData.loadOriginData）
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
 * origin 条目 id 索引：预加载时建立，供 mod 加载把未解析目标区分为
 * external-origin（游戏基础内容）/ external-mod（用户自定义引入）。未预加载时为 null。
 * @type {Set<string>|null}
 */
let originIds = null;

/**
 * 取当前缓存的 origin id 索引。
 * @returns {Set<string>|null} id 索引（未预加载时为 null）
 */
function getOriginIds() {
    return originIds;
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

        parseMod
            .analyzeModJSON5(modPath)
            .then((modInfo) => {
                if (!modInfo) {
                    vscode.window.showErrorMessage('读取 mod 失败：无数据');
                    return;
                }
                if (!modInfo.content || modInfo.content.length === 0) {
                    vscode.window.showWarningMessage('mod 中没有可加载的 content 数据');
                }

                // 后端转换：mod 原始数据 → 节点图（nodes + edges，替代前端 toModJSON）
                const modName = (modInfo.synopsis && modInfo.synopsis.name) || path.basename(modPath);
                const namespace = `mod:${modName}`;
                const graph = toData.contentFilesToData(modInfo.content, {
                    source: 'mod',
                    modId: modName,
                    namespace,
                    // 已预加载 origin 时：命中 origin → external-origin，未命中 → external-mod
                    originIds: getOriginIds(),
                });

                panel.webview.postMessage({
                    command: 'modLoaded',
                    data: {
                        synopsis: modInfo.synopsis || null,
                        modPath,
                        namespace,
                        source: graph.source,
                        modId: modName,
                        count: graph.nodes.length,
                        nodes: graph.nodes,
                        edges: graph.edges,
                        external: graph.external,
                        warnings: graph.warnings,
                        stats: graph.stats,
                        issues: graph.issues,
                        errors: modInfo.errors || [],
                    },
                });

                if (graph.warnings.length) {
                    console.warn(`⚠️ mod 加载：${graph.warnings.length} 个节点字段端口悬空（未实现的目标）`);
                }
            })
            .catch((err) => {
                vscode.window.showErrorMessage(`读取 mod 失败: ${err.message}`);
                panel.webview.postMessage({ command: 'error', message: err.message });
            });
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
 * origin_resources 位于仓库 core/origin_resources（本文件在 core/modLoad/，故用 .. 回到 core/）。
 * @param {import('vscode').WebviewPanel} panel
 */
function preloadOrigin(panel) {
    try {
        loadFieldPlugins(); // 字段插件（启动时读一次设置；同样影响 origin 的连线）
        const cfg = vscode.workspace.getConfiguration('cultistNodeEditor');
        const enabled = cfg.get('preloadOrigin', true);
        if (!enabled) {
            console.log('⏭️ 已关闭游戏基础内容预加载（设置 cultistNodeEditor.preloadOrigin）');
            return;
        }

        const originDir = path.join(__dirname, '..', 'origin_resources', 'StreamingAssets', 'content', 'core');
        if (!fs.existsSync(originDir)) {
            console.log('⚠️ 未找到 origin_resources 内容目录，跳过预加载');
            return;
        }

        // 走 origin 模块封装（loadOriginToData → toData.loadOriginData），复用同一节点图结构
        const graph = origin.loadOriginToData(originDir);

        // 缓存 origin id 索引：后续 mod 加载据此区分 external-origin / external-mod
        originIds = toData.collectIds(graph);

        console.log(
            `🎮 预加载游戏基础内容: ${graph.nodes.length} 个节点 / ${graph.edges.length} 条连接线` +
                `（悬空字段 ${graph.warnings.length}）`
        );
        panel.webview.postMessage({
            command: 'originLoaded',
            data: {
                namespace: 'origin',
                source: 'origin',
                count: graph.nodes.length,
                nodes: graph.nodes,
                edges: graph.edges,
                external: graph.external,
                warnings: graph.warnings,
                stats: graph.stats,
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

module.exports = {
    handleReadMod,
    handleNewMod,
    handleOpenJsonPreview,
    preloadOrigin,
    previewFile,
    getOriginIds,
    /** 加载/重载用户字段插件（设置 cultistNodeEditor.fieldPlugins / disabledPlugins） */
    loadFieldPlugins,
};
