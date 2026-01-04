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
        
        // 设置HTML内容 - 使用更简单的版本进行测试
        panel.webview.html = getWebviewContent();
        
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

function getWebviewContent() {
    // 使用更简单可靠的HTML进行测试
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>节点编辑器</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #1e1e1e;
            color: #cccccc;
            height: 100vh;
            overflow: hidden;
            padding: 0;
        }
        
        .container {
            display: flex;
            height: 100vh;
            width: 100vw;
        }
        
        .sidebar {
            width: 220px;
            background: #252526;
            border-right: 1px solid #3e3e42;
            padding: 16px;
            overflow-y: auto;
        }
        
        .editor-area {
            flex: 1;
            position: relative;
            background: #1e1e1e;
            display: flex;
            flex-direction: column;
        }
        
        .toolbar {
            height: 40px;
            background: #252526;
            border-bottom: 1px solid #3e3e42;
            display: flex;
            align-items: center;
            padding: 0 16px;
            gap: 8px;
        }
        
        .canvas {
            flex: 1;
            position: relative;
            overflow: auto;
            background: 
                linear-gradient(90deg, #2d2d30 1px, transparent 1px) 0 0 / 20px 20px,
                linear-gradient(#2d2d30 1px, transparent 1px) 0 0 / 20px 20px;
        }
        
        .node-palette {
            margin-bottom: 24px;
        }
        
        h3 {
            color: #cccccc;
            margin-bottom: 12px;
            font-size: 14px;
            font-weight: 600;
        }
        
        .node-type {
            padding: 10px 12px;
            margin: 6px 0;
            background: #0e639c;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.2s;
            width: 100%;
            text-align: left;
        }
        
        .node-type:hover {
            background: #1177bb;
        }
        
        .btn {
            padding: 8px 16px;
            background: #007acc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            margin: 4px 0;
            width: 100%;
        }
        
        .btn:hover {
            background: #0062a3;
        }
        
        .btn-secondary {
            background: #3a3a3a;
        }
        
        .btn-secondary:hover {
            background: #454545;
        }
        
        .status-bar {
            height: 24px;
            background: #007acc;
            color: white;
            display: flex;
            align-items: center;
            padding: 0 12px;
            font-size: 12px;
        }
        
        .test-node {
            position: absolute;
            width: 120px;
            padding: 12px;
            background: #252526;
            border: 1px solid #3e3e42;
            border-radius: 6px;
            color: #cccccc;
            cursor: move;
            user-select: none;
        }
        
        .test-node.selected {
            border-color: #007acc;
            box-shadow: 0 0 0 1px #007acc;
        }
        
        .port {
            width: 12px;
            height: 12px;
            background: #007acc;
            border-radius: 50%;
            position: absolute;
            cursor: pointer;
        }
        
        .port.input {
            left: -6px;
        }
        
        .port.output {
            right: -6px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <div class="node-palette">
                <h3>节点类型</h3>
                <button class="node-type" onclick="addNode('number')">📊 数字节点</button>
                <button class="node-type" onclick="addNode('string')">📝 字符串节点</button>
                <button class="node-type" onclick="addNode('math')">➕ 数学运算</button>
                <button class="node-type" onclick="addNode('logic')">⚡ 逻辑判断</button>
                <button class="node-type" onclick="addNode('print')">🖨️ 打印输出</button>
            </div>
            
            <div class="node-palette">
                <h3>操作</h3>
                <button class="btn" onclick="executeGraph()">▶️ 执行节点图</button>
                <button class="btn btn-secondary" onclick="saveGraph()">💾 保存为 JSON</button>
                <button class="btn btn-secondary" onclick="loadGraph()">📂 加载 JSON</button>
                <button class="btn" onclick="clearCanvas()">🗑️ 清空画布</button>
                <button class="btn" onclick="sendTest()">🔧 测试通信</button>
            </div>
            
            <div class="node-palette">
                <h3>状态</h3>
                <div id="status">等待命令...</div>
            </div>
        </div>
        
        <div class="editor-area">
            <div class="toolbar">
                <button class="btn" style="width: auto;" onclick="addTestNode()">添加测试节点</button>
                <span style="margin-left: auto; font-size: 12px; color: #888;">节点编辑器 v0.1</span>
            </div>
            
            <div class="canvas" id="canvas">
                <!-- 这里将显示节点 -->
                <div id="placeholder" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #666;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🧩</div>
                    <div style="font-size: 16px; margin-bottom: 8px;">节点编辑器已就绪</div>
                    <div style="font-size: 12px;">从左侧面板添加节点，或点击上方按钮添加测试节点</div>
                </div>
            </div>
            
            <div class="status-bar">
                <span id="status-text">就绪</span>
            </div>
        </div>
    </div>

    <script>
        // 获取VS Code API
        const vscode = acquireVsCodeApi();
        let nodeCount = 0;
        
        // 更新状态显示
        function updateStatus(text) {
            document.getElementById('status').innerHTML = text;
            document.getElementById('status-text').textContent = text;
        }
        
        updateStatus('已连接');
        
        // 添加节点
        function addNode(type) {
            updateStatus('添加节点: ' + type);
            vscode.postMessage({
                command: 'addNode',
                nodeType: type,
                timestamp: new Date().toISOString()
            });
        }
        
        // 发送测试消息
        function sendTest() {
            updateStatus('发送测试消息...');
            vscode.postMessage({
                command: 'test',
                message: 'Hello from Webview!'
            });
        }
        
        // 保存图表
        function saveGraph() {
            const graphData = {
                nodes: [],
                connections: [],
                metadata: {
                    created: new Date().toISOString(),
                    version: '1.0'
                }
            };
            
            updateStatus('保存图表...');
            vscode.postMessage({
                command: 'saveGraph',
                data: graphData
            });
        }
        
        // 加载图表
        function loadGraph() {
            updateStatus('加载图表...');
            vscode.postMessage({
                command: 'loadGraph'
            });
        }
        
        // 执行图表
        function executeGraph() {
            updateStatus('执行图表...');
            vscode.postMessage({
                command: 'execute'
            });
        }
        
        // 清空画布
        function clearCanvas() {
            const canvas = document.getElementById('canvas');
            const nodes = canvas.querySelectorAll('.test-node');
            nodes.forEach(node => node.remove());
            updateStatus('画布已清空');
        }
        
        // 添加测试节点（直接在Webview中）
        function addTestNode() {
            nodeCount++;
            const canvas = document.getElementById('canvas');
            const placeholder = document.getElementById('placeholder');
            
            if (placeholder) {
                placeholder.style.display = 'none';
            }
            
            const node = document.createElement('div');
            node.className = 'test-node';
            node.id = 'node-' + nodeCount;
            node.innerHTML = \`
                <div style="font-weight: bold; margin-bottom: 8px;">测试节点 #\${nodeCount}</div>
                <div style="font-size: 11px; color: #999;">这是一个测试节点</div>
                <div class="port input" style="top: 50%;"></div>
                <div class="port output" style="top: 50%;"></div>
            \`;
            
            // 随机位置
            const x = Math.random() * (canvas.clientWidth - 150);
            const y = Math.random() * (canvas.clientHeight - 100);
            node.style.left = x + 'px';
            node.style.top = y + 'px';
            
            // 添加拖拽功能
            let isDragging = false;
            let offsetX, offsetY;
            
            node.addEventListener('mousedown', startDrag);
            
            function startDrag(e) {
                if (e.target.classList.contains('port')) return;
                
                isDragging = true;
                offsetX = e.clientX - node.getBoundingClientRect().left;
                offsetY = e.clientY - node.getBoundingClientRect().top;
                
                document.addEventListener('mousemove', drag);
                document.addEventListener('mouseup', stopDrag);
                
                // 选中效果
                document.querySelectorAll('.test-node').forEach(n => n.classList.remove('selected'));
                node.classList.add('selected');
                e.preventDefault();
            }
            
            function drag(e) {
                if (!isDragging) return;
                
                const canvasRect = canvas.getBoundingClientRect();
                let x = e.clientX - canvasRect.left - offsetX;
                let y = e.clientY - canvasRect.top - offsetY;
                
                // 限制在画布内
                x = Math.max(0, Math.min(x, canvasRect.width - node.offsetWidth));
                y = Math.max(0, Math.min(y, canvasRect.height - node.offsetHeight));
                
                node.style.left = x + 'px';
                node.style.top = y + 'px';
                
                updateStatus(\`节点位置: \${Math.round(x)}, \${Math.round(y)}\`);
            }
            
            function stopDrag() {
                isDragging = false;
                document.removeEventListener('mousemove', drag);
                document.removeEventListener('mouseup', stopDrag);
            }
            
            canvas.appendChild(node);
            updateStatus(\`添加测试节点 #\${nodeCount}\`);
        }
        
        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('收到扩展消息:', message);
            
            switch (message.command) {
                case 'init':
                    updateStatus('初始化完成: ' + message.message);
                    break;
                case 'addNodeResult':
                    updateStatus('添加节点成功: ' + message.nodeType);
                    addTestNode(); // 自动添加一个测试节点
                    break;
                case 'graphLoaded':
                    updateStatus('图表加载完成');
                    alert('图表数据已加载: ' + JSON.stringify(message.data).substring(0, 100) + '...');
                    break;
                case 'saveConfirmed':
                    updateStatus('图表已保存: ' + message.path);
                    break;
                case 'error':
                    updateStatus('错误: ' + message.message);
                    alert('错误: ' + message.message);
                    break;
            }
        });
        
        // 页面加载完成后发送就绪消息
        window.addEventListener('load', () => {
            setTimeout(() => {
                vscode.postMessage({ 
                    command: 'ready',
                    message: 'Webview已加载完成'
                });
                updateStatus('Webview 就绪');
            }, 100);
        });
    </script>
</body>
</html>`;
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
