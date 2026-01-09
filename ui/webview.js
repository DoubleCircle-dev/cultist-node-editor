// 仅限Webview中使用，禁用检查
/* eslint-disable no-undef */
// @ts-nocheck

// PortDragManager将通过全局对象访问

// 全局变量管理
const vscode = acquireVsCodeApi();
let nodeCount = 0;
const nodes = new Map();
const connections = [];

// 创建全局管理器实例
let portDragManager = null;
let actionManager = null;
let nodeManager = null;



// 节点类型配置
const nodeTypes = {
    test: {
        title: '测试节点',
        color: '#6c5ce7',
        inputs: [
            { type: 'port', label: '测试输入' }
        ],
        outputs: [
            { type: 'port', label: '测试输出' }
        ],
        content: `这是一个测试节点<br>ID: <br>类型: 通用测试`,
        icon: '⚡',
        properties: [
            { label: '数值', type: 'range', min: 0, max: 100, default: 50 },
            { label: '选项', type: 'select', options: ['选项1', '选项2', '选项3'], default: 0 },
            { label: '开关', type: 'checkbox', default: false },
            { label: '二择', type: 'bool', default: false },
            { label: '数字', type: 'number', min: 0, max: 100, default: 50 },
            { label: '整数输入', type: 'int', default: 0 },
            { label: '文本输入', type: 'text', default: '测试文本' }
        ]
    },
    legacy: {
        title: '职业',
        color: '#d73141ff',
        inputs: [
            { type: 'port', label: '前置结局' }
        ],
        outputs: [
            { type: 'port', label: '初始verb' }
        ],
        content: `这是一个测试节点<br>ID: <br>类型: 通用测试`,
        icon: '⚡',
        properties: [
            { label: '数值', type: 'number', min: 0, max: 100, default: 50 },
            { label: '开关', type: 'checkbox', default: false }
        ]
    },
    recipes: {
        title: '交互(recipes)',
        color: '#f1912aff',
        inputs: [
            { type: 'port', label: 'requirements' }
        ],
        outputs: [
            { type: 'port', label: 'alt' },
            { type: 'port', label: 'linked' },
            { type: 'port', label: 'inductions' }
        ],
        content: `交互界面(recipes)，是使用行动与卡牌交互的一种过程，可以实现多样化的功能`,
        icon: '📖',
        properties: [
            { label: 'aspects', type: 'range', min: 0, max: 100, default: 75 }
        ]
    },
    elements: {
        title: '元素',
        color: '#2196F3',
        inputs: [],
        outputs: [],
        content: `游戏中的卡牌、性相均属于elements`,
        icon: '🔊',
        properties: [
            { label: '类型', type: 'select', options: ['card', 'aspect'], default: 0 },
        ]
    },
    decks: {
        title: '卡池',
        color: '#23bf30ff',
        inputs: [],
        outputs: [],
        content: `滤波器节点<br>ID: <br>类型: 低通滤波器`,
        icon: '🎛️',
        properties: [
            { label: '类型', type: 'select', options: ['低通', '高通', '带通'], default: 0 },
            { label: '频率', type: 'range', min: 20, max: 20000, default: 1000 },
            { label: 'Q值', type: 'range', min: 0.1, max: 10, step: 0.1, default: 1 }
        ]
    },
    verbs: {
        title: '行动框',
        color: '#9C27B0',
        outputs: [
            { type: 'port', label: 'verb' }
        ],
        content: `延迟节点<br>ID: <br>最大延迟: 2000ms`,
        icon: '⚡',
        properties: [
            { label: 'id', type: 'select', options: ['低通', '高通', '带通'], default: 0 },
            { label: '类型', type: 'select', options: ['低通', '高通', '带通'], default: 0 },
            { label: '类型', type: 'select', options: ['低通', '高通', '带通'], default: 0 }
        ]
    },
    slots: {
        title: '卡槽',
        color: '#fdf622ff',
        inputs: [],
        outputs: [],
        content: `混音器节点<br>ID: <br>通道: 4进2出`,
        icon: '🎚️',
        properties: [
            { label: '通道1', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道2', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道3', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道4', type: 'range', min: 0, max: 100, default: 100 }
        ]
    },
    levers: {
        title: '继承物品',
        color: '#3F51B5',
        inputs: [],
        outputs: [],
        content: `混音器节点<br>ID: <br>通道: 4进2出`,
        icon: '🎚️',
        properties: [
            { label: '通道1', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道2', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道3', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道4', type: 'range', min: 0, max: 100, default: 100 }
        ]
    },
    text: {
        title: '文本',
        color: '#3fb3b5ff',
        inputs: [],
        outputs: [],
        content: `混音器节点<br>ID: <br>通道: 4进2出`,
        icon: '🎚️',
        properties: [
            { label: '通道1', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道2', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道3', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道4', type: 'range', min: 0, max: 100, default: 100 }
        ]
    }
};

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
}

// 读取mod生成节点图
function readMod() {
    updateStatus("读取mod中，如果mod文件过大，读取时间可能较长");
    vscode.postMessage({
        command: "test",
        message: "Hello from Webview!",
    });
}

// 保存图表
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

// 加载图表
function loadGraph() {
    updateStatus("加载图表...");
    vscode.postMessage({
        command: "loadGraph",
    });
}

// 清空画布
function clearCanvas() {
    const canvas = document.getElementById("canvas");
    const test_nodes = canvas.querySelectorAll(".test-node");
    test_nodes.forEach((node) => node.remove());
    const nodes = canvas.querySelectorAll(".node");
    nodes.forEach((node) => node.remove());

    // 显示占位符
    const placeholder = document.getElementById("placeholder");
    if (placeholder) {
        placeholder.style.display = "block";
    }

    nodeCount = 0;

    updateStatus("画布已清空");
}

// 添加测试节点（直接在Webview中）
function addTestNode() {
    addNode('test', Math.random() * (canvas.clientWidth - 150), Math.random() * (canvas.clientHeight - 100));
}

// 添加节点
function addNode(type) {
    console.log(nodeManager.constructor.name);
    try {
        let x = Math.random() * (canvas.clientWidth - 220);
        let y = Math.random() * (canvas.clientHeight - 120);
        nodeManager.addNode(type, x, y);
    } catch (error) {
        console.error('❌ 添加节点时出错:' + error);
        updateStatus('添加节点时出错' + error.message);
    }
}

// 初始化函数
function initWebview() {
    updateStatus("已连接");


    if (typeof PortDragManager === 'undefined') {
        console.error('❌ PortDragManager 未加载');
        setTimeout(initWebview, 100);
        return;
    }

    if (typeof BasicActionManager === 'undefined') {
        console.error('❌ BasicActionManager 未加载');
        setTimeout(initWebview, 100);
        return;
    }

    if (typeof NodeManager === 'undefined') {
        console.error('❌ NodeManager 未加载');
        setTimeout(initWebview, 100);
        return;
    }

    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('❌ Canvas 元素未找到');
        setTimeout(initWebview, 100);
        return;
    }

    portDragManager = new PortDragManager(
        nodes,  // 节点Map
        connections,  // 连接数组
        canvas,  // 画布元素
        updateStatus  // 状态更新函数
    );

    actionManager = new BasicActionManager(
        nodes,  // 节点Map
        connections,  // 连接数组
        canvas,  // 画布元素
        updateStatus  // 状态更新函数
    );

    nodeManager = new NodeManager(canvas, updateStatus); // 节点管理器实例

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
