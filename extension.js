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
        createNodeEditorPanel(context);
    });

    context.subscriptions.push(openEditorCommand);

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
        // panel.webview.html = getWebviewContent();
        panel.webview.html = getWebviewContent(panel);
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
                    case 'test':
                        vscode.window.showInformationMessage('Webview通信正常！');
                        return;
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
        }, 500);

        console.log('✅ 节点编辑器面板创建成功');

    } catch (error) {
        console.error('❌ 创建面板时出错:', error);
        vscode.window.showErrorMessage(`创建节点编辑器失败: ${error.message}`);
    }
}

function getWebviewContent(panel) {
    try {
        const htmlPath = path.join(__dirname, 'ui', 'webUI.html');
        console.log('📄 HTML文件路径:', htmlPath);

        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        console.log('📝 HTML内容大小:', htmlContent.length, '字符');

        // 获取资源路径并转换为webview URI
        // 获取资源映射
        const uiDir = path.join(__dirname, 'ui');
        const resources = getResourceUris(panel, uiDir);

        // 动态替换所有资源引用
        htmlContent = replaceResources(htmlContent, resources);

        return htmlContent;
    } catch (error) {
        console.error('❌读取文件时出错:', error);
        return getSimpleHtml(); // 返回一个简单的HTML作为后备
    }
}

// 获取所有资源的URI映射
function getResourceUris(panel, uiDir) {
    const resources = {};

    // 递归扫描ui目录下的所有资源文件
    const scanDir = (dir, basePath = '') => {
        const files = fs.readdirSync(dir, { withFileTypes: true });

        files.forEach(file => {
            const fullPath = path.join(dir, file.name);
            const relativePath = path.join(basePath, file.name);

            if (file.isDirectory()) {
                scanDir(fullPath, relativePath);
            } else {
                const ext = path.extname(file.name).toLowerCase();
                const uri = panel.webview.asWebviewUri(vscode.Uri.file(fullPath));

                // 根据文件类型分类存储
                if (ext === '.css') {
                    resources[relativePath] = { type: 'css', uri };
                } else if (ext === '.js') {
                    resources[relativePath] = { type: 'js', uri };
                } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'].includes(ext)) {
                    resources[relativePath] = { type: 'image', uri };
                } else if (ext === '.html') {
                    // HTML文件不处理
                } else {
                    resources[relativePath] = { type: 'other', uri };
                }
            }
        });
    };

    scanDir(uiDir);
    return resources;
}

// 替换HTML中的资源引用
function replaceResources(htmlContent, resources) {
    let content = htmlContent;

    console.log('🔍 开始替换资源...');
    console.log('📋 可用资源:', Object.keys(resources).map(k => `${k}: ${resources[k].type}`));

    // 替换CSS文件
    content = content.replace(
        /<link\s+[^>]*href\s*=\s*["']([^"']+\.css)["'][^>]*>/gi,
        (match, filePath) => {
            console.log(`🎨 匹配到CSS: ${filePath}`);
            const normalizedPath = filePath.replace(/^[./]+/, '');
            const resource = resources[normalizedPath] || resources[filePath];
            if (resource && resource.type === 'css') {
                const newMatch = match.replace(
                    new RegExp(`(["'])${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`),
                    `$1${resource.uri.toString()}$1`
                );
                console.log(`✅ 替换CSS: ${filePath} -> ${resource.uri.toString()}`);
                return newMatch;
            } else {
                console.warn(`⚠️  CSS资源未找到: ${filePath} (尝试了 ${normalizedPath})`);
            }
            return match;
        }
    );

    // 替换JS文件
    content = content.replace(
        /<script\s+[^>]*src\s*=\s*["']([^"']+\.js)["'][^>]*>/gi,
        (match, filePath) => {
            console.log(`📜 匹配到JS: ${filePath}`);
            const normalizedPath = filePath.replace(/^[./]+/, '');
            const resource = resources[normalizedPath] || resources[filePath];
            if (resource && resource.type === 'js') {
                const newMatch = match.replace(
                    new RegExp(`(["'])${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`),
                    `$1${resource.uri.toString()}$1`
                );
                console.log(`✅ 替换JS: ${filePath} -> ${resource.uri.toString()}`);
                return newMatch;
            } else {
                console.warn(`⚠️  JS资源未找到: ${filePath} (尝试了 ${normalizedPath})`);
                console.log('可用的JS资源:',
                    Object.entries(resources)
                        .filter(([_, r]) => r.type === 'js')
                        .map(([k, _]) => k)
                );
            }
            return match;
        }
    );

    return content;
}

function getSimpleHtml() {
    // 使用更简单可靠的HTML进行测试
    try {
        const htmlPath = path.join(__dirname, 'ui', 'basic.html');
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

function deactivate() {
    console.log('👋 Node Editor 扩展已停用');
    if (currentPanel) {
        currentPanel.dispose();
    }
}

module.exports = {
    activate,
    deactivate
};


