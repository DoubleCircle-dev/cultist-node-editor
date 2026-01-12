// 仅限Webview中使用，禁用检查
/* eslint-disable no-undef */
// @ts-nocheck


// 全局变量管理
const vscode = acquireVsCodeApi();
const nodes = new Map();
const connections = [];

// 创建全局管理器实例
let actionManager = null;
let nodeManager = null;

// 更新状态显示
function updateStatus(text) {
    const statusElement = document.getElementById("status");
    const statusTextElement = document.getElementById("status-text");

    if (statusElement) {
        statusElement.innerHTML = text;
    }
    if (statusTextElement) {
        statusTextElement.textContent = text;
    }

    console.log(`状态更新---${text}`);
}

// todo 读取mod生成节点图
function readMod() {
    updateStatus("读取mod中，如果mod文件过大，读取时间可能较长");
    vscode.postMessage({
        command: "test",
        message: "Hello from Webview!",
    });
}

// todo 保存图表
function saveGraph() {
    const graphData = {
        nodes: [],
        connections: [],
        metadata: {
            created: new Date().toISOString(),
            version: "1.0",
        },
    };

    updateStatus("保存图表...");
    vscode.postMessage({
        command: "saveGraph",
        data: graphData,
    });
}

// todo 加载图表
function loadGraph() {
    updateStatus("加载图表...");
    vscode.postMessage({
        command: "loadGraph",
    });
}

// todo 清空画布
function clearCanvas() {

    nodeManager.clear();

    // 显示占位符
    const placeholder = document.getElementById("placeholder");
    if (placeholder) {
        placeholder.style.display = "block";
    }

    updateStatus("画布已清空");
}

// 添加测试节点（直接在Webview中）
function addTestNode() {
    addNode('test', Math.random() * (canvas.clientWidth - 150), Math.random() * (canvas.clientHeight - 100));
}

// 添加节点
function addNode(type) {
    try {
        let x = Math.random() * (canvas.clientWidth - 220);
        let y = Math.random() * (canvas.clientHeight - 120);
        nodeManager.addNode(type, x, y);
    } catch (error) {
        console.error('❌ 添加节点时出错:' + error);
        updateStatus('添加节点时出错' + error.message);
    }
}

function addBlankNode() {
    addNode('blank');
}


// 初始化函数
function initWebview() {
    updateStatus("已连接");

    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('❌ Canvas 元素未找到');
        setTimeout(initWebview, 100);
        return;
    }

    if (!nodeManager) {
        nodeManager = new NodeManager(canvas, updateStatus); // 节点管理器实例
        console.error('nodeManager 加载中');
        setTimeout(initWebview, 100);
        return;
    }

    // 页面加载完成后发送就绪消息
    window.addEventListener("load", () => {
        setTimeout(() => {
            vscode.postMessage({
                command: "ready",
                message: "Webview已加载完成",
            });
            updateStatus("Webview 就绪");
        }, 100);
    });

    // 监听来自扩展的消息
    window.addEventListener("message", (event) => {
        const message = event.data;
        console.log("收到扩展消息:", message);

        switch (message.command) {
            case "init":
                updateStatus("初始化完成: " + message.message);
                break;
            case "addNodeResult":
                updateStatus("添加节点成功: " + message.nodeType);
                break;
            case "graphLoaded":
                updateStatus("图表加载完成");
                // 可以在这里处理加载的图表数据
                if (message.data) {
                    console.log("图表数据:", message.data);
                }
                break;
            case "saveConfirmed":
                updateStatus("图表已保存: " + message.path);
                break;
            case "error":
                updateStatus("错误: " + message.message);
                break;
        }
    });
}

// 撤销上一次操作
function undoLastAction() {
    if (actionManager) {
        actionManager.undoLastAction();
    }
}

// 重做上一次撤销的操作
function redoLastAction() {
    if (actionManager) {
        actionManager.redoLastAction();
    }
}

function testCommunication() {
    vscode.postMessage({
        command: "test",
        message: "测试通信",
    });
}

function generateTest() {
    for (let index = 0; index < 1000; index++) {
        addTestNode();        
    }

    vscode.postMessage({
        command: "generateTest",
        message: "生成测试",
    });

}

function toggleConsole() {
    vscode.postMessage({
        command: "openConsole",
        message: "打开控制台",
    });
}

function customCheck() {
    vscode.postMessage({
        command: "customCheck",
        message: "自定义检查",
    });
}

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWebview);
} else {
    initWebview();
}
