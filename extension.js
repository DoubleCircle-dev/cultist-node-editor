const vscode = require('vscode');
const path = require('path');
const fs = require('fs'); // 可以用于JSON文件操作

function activate(context) {
    console.log('Node Editor 扩展已激活');

    // 注册打开节点编辑器的命令
    const disposable = vscode.commands.registerCommand('node-editor.openEditor', () => {
        createNodeEditorPanel(context);
    });

    context.subscriptions.push(disposable);
}

function createNodeEditorPanel(context) {
    // 创建Webview面板
    const panel = vscode.window.createWebviewPanel(
        'nodeEditor',
        'Node Editor',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri]
        }
    );

    // 设置Webview的HTML内容
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Node Editor</title>
        <style>
            body { 
                margin: 0; 
                padding: 20px;
                font-family: var(--vscode-font-family);
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
            }
            .container {
                display: flex;
                height: calc(100vh - 40px);
            }
            .sidebar {
                width: 200px;
                padding: 15px;
                background: var(--vscode-sideBar-background);
                border-right: 1px solid var(--vscode-sideBar-border);
            }
            .editor-area {
                flex: 1;
                position: relative;
                border: 1px solid var(--vscode-panel-border);
            }
            .node-item {
                padding: 10px;
                margin: 5px 0;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border-radius: 4px;
                cursor: pointer;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="sidebar">
                <h3>节点面板</h3>
                <div class="node-item" onclick="addNode('number')">数字节点</div>
                <div class="node-item" onclick="addNode('string')">字符串节点</div>
                <div class="node-item" onclick="addNode('math')">数学运算</div>
                <div class="node-item" onclick="addNode('logic')">逻辑判断</div>
                <hr>
                <button onclick="saveGraph()">保存为JSON</button>
                <button onclick="loadGraph()">加载JSON</button>
            </div>
            <div class="editor-area" id="canvas">
                <!-- 节点编辑器画布将在这里 -->
                <p style="padding: 20px; text-align: center;">将节点拖放到这里</p>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            function addNode(type) {
                vscode.postMessage({
                    command: 'addNode',
                    nodeType: type
                });
            }
            
            function saveGraph() {
                vscode.postMessage({
                    command: 'saveGraph',
                    data: { nodes: [], connections: [] }
                });
            }
            
            function loadGraph() {
                vscode.postMessage({
                    command: 'loadGraph'
                });
            }
            
            // 监听来自扩展的消息
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'addNodeResult':
                        alert('添加节点: ' + message.nodeType);
                        break;
                    case 'loadGraphData':
                        console.log('加载的图数据:', message.data);
                        break;
                }
            });
        </script>
    </body>
    </html>`;

    panel.webview.html = htmlContent;

    // 处理来自Webview的消息
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'addNode':
                    vscode.window.showInformationMessage(`正在添加 ${message.nodeType} 节点`);
                    // 这里可以实际创建节点
                    panel.webview.postMessage({ 
                        command: 'addNodeResult', 
                        nodeType: message.nodeType 
                    });
                    break;
                case 'saveGraph':
                    saveGraphToFile(message.data);
                    break;
                case 'loadGraph':
                    loadGraphFromFile(panel);
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}

function saveGraphToFile(graphData) {
    vscode.window.showSaveDialog({
        filters: { 'JSON Files': ['json'] }
    }).then(uri => {
        if (uri) {
            fs.writeFileSync(uri.fsPath, JSON.stringify(graphData, null, 2));
            vscode.window.showInformationMessage('节点图已保存！');
        }
    });
}

function loadGraphFromFile(panel) {
    vscode.window.showOpenDialog({
        filters: { 'JSON Files': ['json'] }
    }).then(files => {
        if (files && files[0]) {
            const content = fs.readFileSync(files[0].fsPath, 'utf8');
            const graphData = JSON.parse(content);
            panel.webview.postMessage({ 
                command: 'loadGraphData', 
                data: graphData 
            });
            vscode.window.showInformationMessage('节点图已加载！');
        }
    });
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
