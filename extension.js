// mod 领域编排层（core/modLoad/handlers.js）：读 mod/新建/预览/预加载等命令与 webview 消息
// 一律转发到 modHandlers.* 处理；具体纯函数（detect/parse/toData/...）由 handlers 内部按需 require。
const modHandlers = require('./core/modLoad/handlers');
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

/** 前端根目录（Vite 工程；vanilla 分支的 ui/ 已迁移至此） */
const FRONTEND_DIR_NAME = 'frontend';
/** 开启开发模式的环境变量：设为 1 用默认地址，或直接写 dev server 地址 */
const DEV_SERVER_ENV = 'CNE_DEV_SERVER';
const DEFAULT_DEV_SERVER = 'http://localhost:5173';

/**
 * 读取开发服务器地址；未开启开发模式时返回 null。
 * @returns {string|null}
 */
function getDevServerUrl() {
    const raw = process.env[DEV_SERVER_ENV];
    if (!raw) return null;
    if (raw === '1' || raw === 'true') return DEFAULT_DEV_SERVER;
    return raw.replace(/\/$/, '');
}

/**
 * 解析前端运行时文件：优先 dist 产物，回退 public 源码（便于未构建时也能启动）。
 * @param {import('vscode').ExtensionContext} context
 * @param {string} relPath 相对 frontend/ 的路径，如 'error.html'
 * @returns {string} 绝对路径
 */
function resolveFrontendFile(context, relPath) {
    const distPath = path.join(context.extensionPath, FRONTEND_DIR_NAME, 'dist', relPath);
    if (fs.existsSync(distPath)) return distPath;
    const publicPath = path.join(context.extensionPath, FRONTEND_DIR_NAME, 'public', relPath);
    if (fs.existsSync(publicPath)) return publicPath;
    return distPath;
}

/**
 * 仅为开发模式注入 CSP：放行 dev server（含 HMR 的 websocket）。
 * 生产模式不注入，保持与迁移前一致的行为。
 * @param {string} html
 * @param {import('vscode').Webview} webview
 * @param {string} devServerUrl
 * @returns {string}
 */
function injectDevCsp(html, webview, devServerUrl) {
    const wsUrl = devServerUrl.replace(/^http/, 'ws');
    const policy = [
        `default-src 'none'`,
        `img-src ${webview.cspSource} ${devServerUrl} https: data: blob:`,
        `media-src ${webview.cspSource} ${devServerUrl} data: blob:`,
        `script-src ${webview.cspSource} ${devServerUrl} 'unsafe-inline'`,
        `style-src ${webview.cspSource} ${devServerUrl} 'unsafe-inline'`,
        `font-src ${webview.cspSource} ${devServerUrl} data:`,
        `worker-src ${webview.cspSource} blob:`,
        `connect-src ${webview.cspSource} ${devServerUrl} ${wsUrl}`,
    ].join('; ');
    const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
    return html.replace('<head>', `<head>\n        ${meta}`);
}

/**
 * 载入入口 HTML。
 * - 开发模式：读源码 frontend/index.html，把入口脚本指向 dev server（含 @vite/client 以启用 HMR）
 * - 生产模式：读 frontend/dist/index.html，把 ./assets/** 等相对引用换成 webview URI
 * @param {import('vscode').WebviewPanel} panel
 * @param {import('vscode').ExtensionContext} context
 * @param {string|null} devServerUrl
 * @returns {string}
 */
function loadFrontendHtml(panel, context, devServerUrl) {
    const frontendDir = path.join(context.extensionPath, FRONTEND_DIR_NAME);

    if (devServerUrl) {
        const srcHtml = path.join(frontendDir, 'index.html');
        if (!fs.existsSync(srcHtml)) throw new Error('找不到 ' + srcHtml);
        let html = fs.readFileSync(srcHtml, 'utf-8');
        const entryTag = '<script type="module" src="/src/main.js"></script>';
        if (!html.includes(entryTag)) {
            throw new Error('frontend/index.html 里找不到 Vite 入口标签，无法切换到 dev server');
        }
        const devTags = [
            `<script type="module" src="${devServerUrl}/@vite/client"></script>`,
            `<script type="module" src="${devServerUrl}/src/main.js"></script>`
        ].join('\n    ');
        html = html.replace(entryTag, devTags);
        console.log(`🔥 [dev] webview 加载 Vite dev server: ${devServerUrl}`);
        return injectDevCsp(html, panel.webview, devServerUrl);
    }

    const distDir = path.join(frontendDir, 'dist');
    const htmlPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(htmlPath)) {
        throw new Error('找不到 ' + htmlPath + '，请先执行 npm run build:ui');
    }
    let html = fs.readFileSync(htmlPath, 'utf-8');
    // Vite 产物（base:'./'）用相对路径引用资源，逐个换成 webview URI
    html = html.replace(/(src|href)="(\.\/[^"]+)"/g, (match, attr, rel) => {
        const filePath = path.join(distDir, rel.replace(/^\.\//, ''));
        return fs.existsSync(filePath)
            ? `${attr}="${panel.webview.asWebviewUri(vscode.Uri.file(filePath))}"`
            : match;
    });
    return html;
}

function getWebviewContent(panel, context, options = {}) {
    try {
        const devServerUrl = getDevServerUrl();
        let htmlContent = loadFrontendHtml(panel, context, devServerUrl);

        const configPath = resolveFrontendFile(context, 'webview-config.json');
        const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

        // 图片渲染失败时的回退占位图（webview URI，需在 localResourceRoots 内）
        const placeholderPath = resolveFrontendFile(context, path.join('assets', 'img', 'placeholder.png'));
        if (fs.existsSync(placeholderPath)) {
            config.placeholderImage = panel.webview.asWebviewUri(vscode.Uri.file(placeholderPath)).toString();
        }
        // 开发模式标记：前端可据此显示额外调试信息
        config.devServer = devServerUrl || undefined;
        // 预览模式（customEditor「打开方式」）：仅查看当前 json，前端隐藏侧边栏/顶栏等功能
        if (options.previewMode) {
            config.previewMode = true;
        }

        return injectConfigData(htmlContent, config);
    } catch (error) {
        console.error('加载Webview内容失败:', error);
        return getErrorHtml(context);
    }
}

// 说明：迁移到 Vite 后，原先的 getAllFiles / processResources / replaceResourceReferences
// （扫描 ui/css、ui/scripts 再把资源标签注入 HTML）已整体移除 —— 资源由 Vite 打包，
// 加载逻辑见上方 loadFrontendHtml()。

function injectConfigData(htmlContent, config) {
    // 将配置注入到JavaScript中
    const configScript = `
        <script>
            // 注入配置数据
            window.NODE_EDITOR_CONFIG = ${JSON.stringify(config, null, 2)};
            
            // 确保在DOM加载完成后初始化
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    if (window.initWebview && typeof window.initWebview === 'function') {
                        window.initWebview();
                    }
                });
            } else {
                // DOM已经加载完成
                if (window.initWebview && typeof window.initWebview === 'function') {
                    window.initWebview();
                }
            }
        </script>
    `;

    // 将配置脚本插入到body结束前
    return htmlContent.replace('</body>', `${configScript}\n</body>`);
}


/**
 * 加载失败时的兜底页面（frontend/public/error.html，构建后也会出现在 dist 里）。
 * @param {import('vscode').ExtensionContext} [context]
 * @returns {string|undefined}
 */
function getErrorHtml(context) {
    try {
        const htmlPath = context
            ? resolveFrontendFile(context, 'error.html')
            : path.join(__dirname, FRONTEND_DIR_NAME, 'public', 'error.html');
        return fs.readFileSync(htmlPath, 'utf-8');
    } catch (error) {
        console.error('读取错误页时出错:', error);
    }
}

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
