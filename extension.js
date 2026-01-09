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
        }, 500);

        console.log('✅ 节点编辑器面板创建成功');
        console.log('面板html:' + panel.webview.html);
    } catch (error) {
        console.error('❌ 创建面板时出错:', error);
        vscode.window.showErrorMessage(`创建节点编辑器失败: ${error.message}`);
    }
}

function getWebviewContent(panel, context) {
    const uiDir = path.join(context.extensionPath, 'ui');

    try {
        // 读取配置文件
        const configPath = path.join(uiDir, 'webview-config.json');
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }

        // 读取HTML模板
        const htmlPath = path.join(uiDir, 'webUI.html');
        let htmlContent = '';

        if (fs.existsSync(htmlPath)) {
            htmlContent = fs.readFileSync(htmlPath, 'utf8');
        } else {
            // 如果HTML文件不存在，创建默认内容
            throw new Error('HTML文件不存在' + htmlPath);
        }

        // 获取所有资源文件的Webview URI
        const resources = processResources(panel, uiDir, config.resources);

        // 替换HTML中的资源引用
        htmlContent = replaceResourceReferences(htmlContent, resources);

        // 注入配置数据
        htmlContent = injectConfigData(htmlContent, config);

        return htmlContent;

    } catch (error) {
        console.error('加载Webview内容失败:', error);
        return getErrorHtml();
    }
}

function processResources(panel, uiDir, resourceConfig) {
    const resources = {
        styles: [],
        scripts: []
    };

    // 处理样式文件
    if (resourceConfig && resourceConfig.styles) {
        resources.styles = resourceConfig.styles.map(styleFile => {
            const stylePath = path.join(uiDir, styleFile);
            if (fs.existsSync(stylePath)) {
                const uri = panel.webview.asWebviewUri(vscode.Uri.file(stylePath));
                return {
                    name: styleFile,
                    uri: uri.toString(),
                    type: 'style'
                };
            }
            return null;
        }).filter(item => item !== null);
    }

    // 处理脚本文件
    if (resourceConfig && resourceConfig.scripts) {
        resources.scripts = resourceConfig.scripts.map(scriptFile => {
            const scriptPath = path.join(uiDir, scriptFile);
            if (fs.existsSync(scriptPath)) {
                const uri = panel.webview.asWebviewUri(vscode.Uri.file(scriptPath));
                return {
                    name: scriptFile,
                    uri: uri.toString(),
                    type: 'script'
                };
            }
            return null;
        }).filter(item => item !== null);
    }

    return resources;
}

function replaceResourceReferences(htmlContent, resources) {
    let result = htmlContent;

    // 移除原有的资源引用
    result = result.replace(/<link\s+rel="stylesheet"\s+href="[^"]*"\s*\/?>/g, '');
    result = result.replace(/<script\s+src="[^"]*"><\/script>/g, '');

    // 添加新的样式引用
    const styleTags = resources.styles.map(style =>
        `<link rel="stylesheet" href="${style.uri}">`
    ).join('\n');

    // 添加新的脚本引用
    const scriptTags = resources.scripts.map(script =>
        `<script src="${script.uri}"></script>`
    ).join('\n');

    // 插入到head结束前
    if (styleTags) {
        result = result.replace('</head>', `${styleTags}\n</head>`);
    }

    // 插入到body结束前
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

