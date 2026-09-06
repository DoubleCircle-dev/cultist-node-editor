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
 *   modHandlers.previewFile(panel, filePath); // 自定义编辑器：单文件 json → 数据池并回发
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// 纯函数子模块按需 require，函数归属一目了然
const detect = require('./detect');  // findSynopsisInFolder
const parseMod = require('./parse'); // analyzeModJSON5
const toData = require('./toData');  // contentFilesToData / loadOriginData / singleFileToData
const create = require('./create');  // createModStructure
const origin = require('./origin');  // loadOriginToData（封装 toData.loadOriginData）

/**
 * 功能2：读取 mod（检测工作区 synopsis.json，无则询问文件位置）
 * @param {import('vscode').WebviewPanel} panel
 */
function handleReadMod(panel) {
    console.log('📂 读取mod请求');
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

                // 后端转换：mod 原始数据 → 前端数据池（按类别，供基础类型实例化；替代前端 toModJSON）
                const modName = (modInfo.synopsis && modInfo.synopsis.name) || path.basename(modPath);
                const namespace = `mod:${modName}`;
                const data = toData.contentFilesToData(modInfo.content, {
                    source: 'mod',
                    modId: modName,
                    namespace,
                });
                const count = Object.values(data.categories).reduce((n, list) => n + list.length, 0);

                panel.webview.postMessage({
                    command: 'modLoaded',
                    data: {
                        synopsis: modInfo.synopsis || null,
                        modPath,
                        namespace,
                        source: data.source,
                        categories: data.categories,
                        count,
                        errors: modInfo.errors || [],
                    },
                });
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

        // 走 origin 模块封装（loadOriginToData → toData.loadOriginData），复用同一数据池结构
        const { categories } = origin.loadOriginToData(originDir);
        const count = Object.values(categories).reduce((n, list) => n + list.length, 0);
        console.log(`🎮 预加载游戏基础内容: ${count} 条数据`);
        panel.webview.postMessage({
            command: 'originLoaded',
            data: { namespace: 'origin', source: 'origin', categories, count },
        });
    } catch (error) {
        console.error('预加载 origin 内容失败:', error);
    }
}

/**
 * 功能4（自定义编辑器）：单文件 json → 数据池，并在 webview 回发 jsonPreviewLoaded / error。
 *
 * 幂等（webviewReady 与延时兜底可能重复触发）由调用方（extension.js JsonPreviewEditorProvider）控制。
 * @param {import('vscode').WebviewPanel} panel
 * @param {string} filePath 目标 json 文件绝对路径
 */
function previewFile(panel, filePath) {
    try {
        const result = toData.singleFileToData(filePath);
        const count = Object.values(result.categories || {}).reduce((n, list) => n + list.length, 0);
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
                categories: result.categories,
                count,
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
};
