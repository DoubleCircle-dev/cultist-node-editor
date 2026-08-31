const modReader = require('./core/readMod');
const modReaderJSON5 = require('./core/readModJSON5');
const modConverter = require('./core/modConverter');
const modLoad = require('./core/modLoad');
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
            handleReadMod(currentPanel);
        } else {
            vscode.window.showInformationMessage('请先打开节点编辑器');
        }
    });
    context.subscriptions.push(loadModCommand);

    // 功能3：新建 mod 基础结构（synopsis.json + content/）
    const newModCommand = vscode.commands.registerCommand('cultist-node-editor.newMod', () => {
        if (currentPanel) {
            handleNewMod(currentPanel);
        } else {
            vscode.window.showInformationMessage('请先打开节点编辑器');
        }
    });
    context.subscriptions.push(newModCommand);

    // 功能4：打开单个 mod json 文件作为节点预览
    const openJsonPreviewCommand = vscode.commands.registerCommand('cultist-node-editor.openJsonPreview', () => {
        if (currentPanel) {
            handleOpenJsonPreview(currentPanel);
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
                        handleReadMod(panel);
                        return;
                    case 'newMod':
                        handleNewMod(panel);
                        return;
                    case 'openJsonPreview':
                        handleOpenJsonPreview(panel);
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
            preloadOrigin(panel);
        }, 500);

        console.log('✅ 节点编辑器面板创建成功');
    } catch (error) {
        console.error('❌ 创建面板时出错:', error);
        vscode.window.showErrorMessage(`创建节点编辑器失败: ${error.message}`);
    }
}

function getWebviewContent(panel, context, options = {}) {
    const uiDir = path.join(context.extensionPath, 'ui');

    try {
        const htmlPath = path.join(uiDir, 'webUI.html');
        if (!fs.existsSync(htmlPath)) throw new Error('HTML文件不存在: ' + htmlPath);

        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // 这里的调用去掉了 config 参数，直接传入 uiDir
        const resources = processResources(panel, uiDir);

        htmlContent = replaceResourceReferences(htmlContent, resources);

        // 保持原来的配置注入逻辑
        const configPath = path.join(uiDir, 'webview-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            // 图片渲染失败时的回退占位图（webview URI，需在 localResourceRoots 内）
            const placeholderPath = path.join(uiDir, 'assets', 'img', 'placeholder.png');
            if (fs.existsSync(placeholderPath)) {
                config.placeholderImage = panel.webview.asWebviewUri(vscode.Uri.file(placeholderPath)).toString();
            }
            // 预览模式（customEditor「打开方式」）：仅查看当前 json，前端隐藏侧边栏/顶栏等功能
            if (options.previewMode) {
                config.previewMode = true;
            }
            htmlContent = injectConfigData(htmlContent, config);
        }

        return htmlContent;
    } catch (error) {
        console.error('加载Webview内容失败:', error);
        return getErrorHtml();
    }
}

/**
 * 递归获取目录下所有指定后缀的文件路径
 * @param {string} dirPath 物理目录路径
 * @param {string} extension 文件后缀（如 '.js'）
 * @returns {string[]} 文件的绝对路径列表
 */
function getAllFiles(dirPath, extension, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            // 如果是目录，递归调用
            arrayOfFiles = getAllFiles(fullPath, extension, arrayOfFiles);
        } else if (file.endsWith(extension)) {
            // 如果是目标文件，记录路径
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

function processResources(panel, uiDir) {
    const resources = {
        css: [],
        scripts: []
    };

    const cssDirPath = path.join(uiDir, 'css');
    const scriptDirPath = path.join(uiDir, 'scripts');

    // 递归处理 CSS
    if (fs.existsSync(cssDirPath)) {
        const allCssFiles = getAllFiles(cssDirPath, '.css');
        resources.css = allCssFiles.map(filePath => ({
            // 将绝对路径转换为 Webview URI
            uri: panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
        }));
    }

    // 递归处理 JS (Module)
    if (fs.existsSync(scriptDirPath)) {
        const allJsFiles = getAllFiles(scriptDirPath, '.js');
        resources.scripts = allJsFiles.map(filePath => ({
            uri: panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
        }));
    }

    return resources;
}

function replaceResourceReferences(htmlContent, resources) {
    let result = htmlContent;

    // 1. 移除原有的硬编码资源引用（可选，建议保留以清理模板）
    result = result.replace(/<link\s+rel="stylesheet"\s+href="[^"]*"\s*\/?>/g, '');
    result = result.replace(/<script\s+[^>]*src="[^"]*"><\/script>/g, '');

    // 2. 生成新的标签
    const styleTags = resources.css.map(style =>
        `<link rel="stylesheet" href="${style.uri}">`
    ).join('\n\t');

    console.log(styleTags)

    const scriptTags = resources.scripts.map(script =>
        `<script type="module" src="${script.uri}"></script>` // 关键：添加 type="module"
    ).join('\n\t');

    // 3. 注入到 HTML
    if (styleTags) {
        result = result.replace('</head>', `${styleTags}\n</head>`);
    }
    if (scriptTags) {
        result = result.replace('</body>', `${scriptTags}\n</body>`);
    }

    return result;
}
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


function getErrorHtml() {
    // 使用更简单可靠的HTML进行测试
    try {
        const htmlPath = path.join(__dirname, 'ui', 'error.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        return htmlContent;
    } catch (error) {
        console.error('读取文件时出错:', error);
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

function handleReadMod(panel) {
    console.log('📂 读取mod请求');
    const wsRoot =
        vscode.workspace.rootPath ||
        (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : undefined);

    // 功能2：优先检测工作区中的 synopsis.json（mod 入口）
    let synopsisPath = modLoad.findSynopsisInFolder(wsRoot || '');

    const doLoad = (synPath) => {
        if (!synPath) {
            vscode.window.showErrorMessage('未找到 synopsis.json，无法加载 mod');
            return;
        }
        const modPath = path.dirname(synPath);
        vscode.window.showInformationMessage(`📂 读取 mod: ${synPath}`);

        modReaderJSON5
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
                const data = modConverter.contentFilesToData(modInfo.content, {
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

/** 功能3：新建 synopsis.json 等 mod 基础设置 */
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
            const result = modLoad.createModStructure(folders[0].fsPath, { name: modName || 'My New Mod' });
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

/** 功能4：打开单个 mod json 文件作为节点预览（引用可能缺失，仅作预览） */
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

/** 功能1：预加载游戏基础内容节点（可在设置中关闭） */
function preloadOrigin(panel) {
    try {
        const cfg = vscode.workspace.getConfiguration('cultistNodeEditor');
        const enabled = cfg.get('preloadOrigin', true);
        if (!enabled) {
            console.log('⏭️ 已关闭游戏基础内容预加载（设置 cultistNodeEditor.preloadOrigin）');
            return;
        }

        const originDir = path.join(__dirname, 'core', 'origin_resources', 'StreamingAssets', 'content', 'core');
        if (!fs.existsSync(originDir)) {
            console.log('⚠️ 未找到 origin_resources 内容目录，跳过预加载');
            return;
        }

        const { categories } = modConverter.loadOriginData(originDir);
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

// 处理文件夹的

function deactivate() {
    console.log('👋 Node Editor 扩展已停用');
    if (currentPanel) {
        currentPanel.dispose();
    }
}

/**
 * 自定义编辑器 Provider：json 文件右键「打开方式」→ 节点编辑器 JSON 预览（功能4）。
 * 复用现有 webUI.html，打开后把当前文档转为数据池（modConverter.singleFileToData）。
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
        webviewPanel.webview.options = {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [this.context.extensionUri],
        };
        // 复用现有 webview 内容（把 custom editor 的 webviewPanel 当普通 panel 处理）；
        // 预览模式：仅查看当前 json，前端隐藏侧边栏/顶栏等功能
        webviewPanel.webview.html = getWebviewContent(webviewPanel, this.context, { previewMode: true });

        const filePath = document.uri.fsPath;

        const sendPreview = () => {
            try {
                const result = modConverter.singleFileToData(filePath);
                const count = Object.values(result.categories || {}).reduce((n, list) => n + list.length, 0);
                if (result.error) {
                    webviewPanel.webview.postMessage({ command: 'error', message: `预览失败: ${result.error}` });
                    return;
                }
                webviewPanel.webview.postMessage({
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
                webviewPanel.webview.postMessage({ command: 'error', message: `预览失败: ${e.message}` });
            }
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
