// mod 领域编排层（core/modLoad/handlers.js）：读 mod/新建/预览/预加载等命令与 webview 消息
// 一律转发到 modHandlers.* 处理；具体纯函数（detect/parse/toData/...）由 handlers 内部按需 require。
const modHandlers = require('./core/modLoad/handlers');
const frontendHost = require('./frontend-host');
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
// 全局变量来跟踪面板状态
let currentPanel = undefined;
function activate(context) {
    console.log('✅ Node Editor 扩展已激活');
    // 重要：检查命令是否成功注册
    const openEditorCommand = vscode.commands.registerCommand('cultist-node-editor.openEditor', () => {
        console.log('📝 命令 "cultist-node-editor.openEditor" 被调用');
        try {
            createNodeEditorPanel(context);
        } catch (error) {
            console.error('🚨 创建面板时出错:', error);
        }
    });

    context.subscriptions.push(openEditorCommand);

    // 功能4（右键打开方式）：自定义编辑器，json 文件「打开方式」→ 节点编辑器 JSON 预览
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'cultist-node-editor.jsonPreview',
            new JsonPreviewEditorProvider(context),
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // 功能2：加载 mod（检测工作区 synopsis.json，无则询问文件位置）
    const loadModCommand = vscode.commands.registerCommand('cultist-node-editor.loadMod', () => {
        if (currentPanel) {
            modHandlers.handleReadMod(currentPanel);
        } else {
            vscode.window.showInformationMessage('请先打开节点编辑器');
        }
    });
    context.subscriptions.push(loadModCommand);

    // 功能3：新建 mod 基础结构（synopsis.json + content/）
    const newModCommand = vscode.commands.registerCommand('cultist-node-editor.newMod', () => {
        if (currentPanel) {
            modHandlers.handleNewMod(currentPanel);
        } else {
            vscode.window.showInformationMessage('请先打开节点编辑器');
        }
    });
    context.subscriptions.push(newModCommand);

    // 功能4：打开单个 mod json 文件作为节点预览
    const openJsonPreviewCommand = vscode.commands.registerCommand('cultist-node-editor.openJsonPreview', () => {
        if (currentPanel) {
            modHandlers.handleOpenJsonPreview(currentPanel);
        } else {
            vscode.window.showInformationMessage('请先打开节点编辑器');
        }
    });
    context.subscriptions.push(openJsonPreviewCommand);

    // 添加一些测试命令来验证扩展是否工作
    const testCommand = vscode.commands.registerCommand('node-editor.test', () => {
        vscode.window.showInformationMessage('✅ 扩展测试命令工作正常！');
    });

    context.subscriptions.push(testCommand);

    // 显示激活成功的消息
    vscode.window.showInformationMessage('Node Editor 扩展已激活，使用 Ctrl+Shift+P 然后输入"打开节点编辑器"');

    // 在控制台打印更多调试信息
    console.log('📋 扩展上下文:', {
        extensionPath: context.extensionPath,
        subscriptionsCount: context.subscriptions.length
    });
    setTimeout(() => {
        console.log('🚀 自动打开节点编辑器');
        vscode.commands.executeCommand('cultist-node-editor.openEditor');
    }, 1500);
}

function createNodeEditorPanel(context) {
    console.log('🎨 正在创建节点编辑器面板...');

    // 如果面板已经存在，直接显示它
    if (currentPanel) {
        console.log('🔄 面板已存在，重新激活');
        currentPanel.reveal(vscode.ViewColumn.One);
        return;
    }

    try {
        // 创建Webview面板
        const panel = vscode.window.createWebviewPanel(
            'nodeEditor', // 内部标识
            '节点编辑器', // 面板标题
            vscode.ViewColumn.One, // 显示位置
            {
                enableScripts: true, // 启用JavaScript
                retainContextWhenHidden: true, // 隐藏时保持状态
                localResourceRoots: [context.extensionUri] // 允许加载的资源
            }
        );

        currentPanel = panel;

        // 设置HTML内容
        panel.webview.html = getWebviewContent(panel, context);


        // 监听面板关闭事件
        panel.onDidDispose(
            () => {
                console.log('❌ 面板已关闭');
                currentPanel = undefined;
            },
            null,
            context.subscriptions
        );

        // 处理来自Webview的消息
        panel.webview.onDidReceiveMessage(
            message => {
                console.log('📨 收到Webview消息:', message);

                switch (message.command) {
                    case 'alert':
                        vscode.window.showInformationMessage(`来自Webview: ${message.text}`);
                        return;
                    case 'addNode':
                        handleAddNode(panel, message);
                        return;
                    case 'saveGraph':
                        handleSaveGraph(message.data);
                        return;
                    case 'loadGraph':
                        handleLoadGraph(panel);
                        return;
                    case 'readMod':
                    case 'testModLoad':
                        modHandlers.handleReadMod(panel);
                        return;
                    case 'newMod':
                        modHandlers.handleNewMod(panel);
                        return;
                    case 'openJsonPreview':
                        modHandlers.handleOpenJsonPreview(panel);
                        return;
                    case 'test':
                        vscode.window.showInformationMessage('Webview通信正常！');
                        return;
                    case 'openConsole':
                        try {
                            // 打开开发者工具以进行调试
                            vscode.commands.executeCommand('workbench.action.webview.openDeveloperTools');
                            console.log('🔍 开发者工具已打开');
                        } catch (error) {
                            console.error('🚨 打开开发者工具时出错:', error);
                        }
                }
            },
            undefined,
            context.subscriptions
        );

        // 发送初始化消息到Webview
        setTimeout(() => {
            panel.webview.postMessage({
                command: 'init',
                message: '节点编辑器已准备就绪'
            });

            // 功能1：预加载游戏基础内容节点（可在设置中关闭）
            modHandlers.preloadOrigin(panel);
        }, 500);

        console.log('✅ 节点编辑器面板创建成功');
    } catch (error) {
        console.error('❌ 创建面板时出错:', error);
        vscode.window.showErrorMessage(`创建节点编辑器失败: ${error.message}`);
    }
}

/**
 * 渲染 webview 内容。
 *
 * 这里只做「把 vscode 的能力注入给前端宿主」这一件事：真正的加载逻辑在
 * frontend-host/ 的可插拔实现里（vanilla.js / vite.js）。
 * @param {import('vscode').WebviewPanel} panel
 * @param {import('vscode').ExtensionContext} context
 * @param {{previewMode?: boolean}} [options]
 * @returns {string}
 */
function getWebviewContent(panel, context, options = {}) {
    return frontendHost.renderWebviewHtml(
        {
            panel,
            context,
            toWebviewUri: (filePath) => panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString(),
        },
        options
    );
}

// 说明：原先前端相关的 getAllFiles / processResources / replaceResourceReferences /
// injectConfigData / getErrorHtml 已全部搬到 frontend-host/（见该目录下 index.js 的接口说明）。
// extension.js 不再包含任何前端加载细节，以便与各前端分支保持一致。

// 消息处理函数
function handleAddNode(panel, message) {
    console.log('🆕 添加节点请求:', message);
    vscode.window.showInformationMessage(`正在创建 ${message.nodeType} 节点`);

    // 发送确认消息回Webview
    panel.webview.postMessage({
        command: 'addNodeResult',
        nodeType: message.nodeType,
        nodeId: `node-${Date.now()}`
    });
}

function handleSaveGraph(graphData) {
    console.log('💾 保存图表请求:', graphData);

    vscode.window.showSaveDialog({
        filters: { 'JSON文件': ['json'] },
        defaultUri: vscode.Uri.file(path.join(vscode.workspace.rootPath || '', 'node-graph.json'))
    }).then(uri => {
        if (uri) {
            try {
                fs.writeFileSync(uri.fsPath, JSON.stringify(graphData, null, 2), 'utf8');
                vscode.window.showInformationMessage(`✅ 图表已保存到: ${uri.fsPath}`);

                // 通知Webview保存成功
                if (currentPanel) {
                    currentPanel.webview.postMessage({
                        command: 'saveConfirmed',
                        path: uri.fsPath
                    });
                }
            } catch (error) {
                vscode.window.showErrorMessage(`❌ 保存失败: ${error.message}`);
            }
        }
    });
}

function handleLoadGraph(panel) {
    console.log('📂 加载图表请求');

    vscode.window.showOpenDialog({
        filters: { 'JSON文件': ['json'] },
        canSelectMany: false
    }).then(files => {
        if (files && files[0]) {
            try {
                const content = fs.readFileSync(files[0].fsPath, 'utf8');
                const graphData = JSON.parse(content);

                vscode.window.showInformationMessage(`✅ 图表已加载: ${files[0].fsPath}`);

                // 发送数据到Webview
                panel.webview.postMessage({
                    command: 'graphLoaded',
                    data: graphData
                });
            } catch (error) {
                vscode.window.showErrorMessage(`❌ 加载失败: ${error.message}`);
                panel.webview.postMessage({
                    command: 'error',
                    message: error.message
                });
            }
        }
    });
}

// mod 相关编排已移至 core/modLoad/handlers.js（handleReadMod / handleNewMod /
// handleOpenJsonPreview / preloadOrigin / previewFile）。
// extension.js 只负责：注册命令、接收 webview 消息并转发给 modHandlers.*。

// 处理文件夹的

function deactivate() {
    console.log('👋 Node Editor 扩展已停用');
    if (currentPanel) {
        currentPanel.dispose();
    }
}

/**
 * 自定义编辑器 Provider：json 文件右键「打开方式」→ 节点编辑器 JSON 预览（功能4）。
 * 复用现有 webUI.html，打开后把当前文档转为数据池（modHandlers.previewFile）。
 */
class JsonPreviewEditorProvider {
    /** @param {import('vscode').ExtensionContext} context */
    constructor(context) {
        this.context = context;
    }

    /**
     * @param {import('vscode').TextDocument} document
     * @param {import('vscode').WebviewPanel} webviewPanel
     * @param {import('vscode').CancellationToken} token
     */
    resolveCustomTextEditor(document, webviewPanel, token) {
        // ⚠️ 自定义编辑器创建的 webview 默认 enableScripts=false 且 localResourceRoots
        // 仅限 media/node_modules；必须显式放行脚本与扩展资源（ui/** 的 css/js），
        // 否则页面只剩静态结构、JS 不执行（按钮失效/无法交互）、preview.css 也无法加载。
        // 注意：retainContextWhenHidden 属于 WebviewPanelOptions（创建面板时传入），
        // 不属于 WebviewOptions（webview.options 的类型），自定义编辑器的面板生命周期由 VS Code 管理，不能在此设置。
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };
        // 复用现有 webview 内容（把 custom editor 的 webviewPanel 当普通 panel 处理）；
        // 预览模式：仅查看当前 json，前端隐藏侧边栏/顶栏等功能
        webviewPanel.webview.html = getWebviewContent(webviewPanel, this.context, { previewMode: true });

        const filePath = document.uri.fsPath;

        /** 幂等开关：防止 webviewReady 与 setTimeout 兜底、或 webview 重载时重复发送预览数据（前端会重复铺图） */
        let previewSent = false;
        const sendPreview = () => {
            if (previewSent) return;
            previewSent = true;
            // 单文件 json → 数据池并回发 jsonPreviewLoaded / error（幂等由上层 previewSent 保证）
            modHandlers.previewFile(webviewPanel, filePath);
        };

        // 前端就绪（webviewReady）后发送；并兜底延时发送一次（幂等，覆盖前端慢加载）
        webviewPanel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'webviewReady') sendPreview();
        });
        setTimeout(sendPreview, 800);
    }
}

module.exports = {
    activate,
    deactivate,
    getWebviewContent,
};
