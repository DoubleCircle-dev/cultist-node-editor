import { ControllerCore } from './controllers/controllerCore.js';
import { NodeModel } from './models/nodeModels/nodeModel.js';
import { NodeTypeRegistry } from "./types/nodeTypes.js";
import { NodeGenerator } from "./generators/nodeGenerator.js"
import { NodeView } from './views/nodeView.js';


let vscode = null;

// 创建全局管理器实例
/**
 * @type {ControllerCore}
 */
let core = null;

console.log(navigator.userAgent)
const isVsCodeWebview = typeof acquireVsCodeApi === 'function';

if (isVsCodeWebview) {
    console.log("当前处于 VS Code 插件环境");
    vscode = acquireVsCodeApi();
} else {
    console.log("当前处于 普通浏览器环境");
}
// 更新状态显示
export function updateStatus(text) {
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

export function readMod() {
    updateStatus("读取mod中，请选择synopsis.json，如果mod文件夹内项目过多，读取时间可能较长");

}

// todo 保存图表
export function saveGraph() {
    const graphData = {
        nodes: [],
        connections: [],
        metadata: {
            created: new Date().toISOString(),
            version: "1.0",
        },
    };

    updateStatus("保存图表...");

}

// todo 加载图表
export function loadGraph() {
    updateStatus("加载图表...");

}

// todo 清空画布
export function clearCanvas() {

    core.clearCanvas();

    updateStatus("画布已清空");
}

// 添加测试节点（直接在Webview中）
export function addTestNode() {
    addNode('test');
}

// 添加节点
/**
 * @param {string} type
 */
export function addNode(type) {

    core.nodeManager.addNode(type);

}

export function addBlankNode() {
    addNode('blank');
}


export function toggleConnections() {
    core.connectionManager.toggleConnections();
}

/**
 * @param {string} mode
 */
export function changeMode(mode) {


    core.canvasManager.setMode(mode);
    updateStatus("模式已切换为" + mode);
}

export function fitView() {
    core.canvasManager.fitView();
}

/**
 * @param {number} scale
 */
export function setScale(scale) {
    updateStatus("缩放比例已设置为" + scale);
    core.canvasManager.setZoom(scale);
}

export function openFilesPage(){

}

// 撤销上一次操作
export function undoLastAction() {
}

// 重做上一次撤销的操作
export function redoLastAction() {

}

export function testCommunication() {

}

function printMemoryUsed(postMessage=''){
    if (performance.memory) {
        console.log(postMessage, {
            // 已分配的堆内存总量
            totalHeapSize: performance.memory.totalJSHeapSize / 1024 / 1024 + " MB",
            // 当前正在使用的堆内存
            usedHeapSize: performance.memory.usedJSHeapSize / 1024 / 1024 + " MB",
            // 内存限制（上限）
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit / 1024 / 1024 + " MB"
        });
    }
}

export function generateTest() {
    
    printMemoryUsed('初始内存');

    for (let index = 0; index < 1000; index++) {
        setTimeout(()=>{
            addTestNode();
        }, index*10);
    }

    setTimeout(()=>{
        printMemoryUsed('分配后内存');

        clearCanvas();
        setTimeout(()=>{
            core.forceRepaint();
            printMemoryUsed('回收后内存');
        }, 100);

        
    }, 10000);
}

export function toggleConsole() {
    if (isVsCodeWebview) {
        vscode.postMessage({ command: 'openConsole' });
    } else {
        eruda.get('entryBtn').show();
        eruda.show();
    }
}
/**
 * @param {string} panel
 */
export function togglePanel(panel) {
    core.panelManager.togglePanel(panel);
}

export function customCheck() {
    console.log('自定义检测:资源释放');

    const nodeTypeConfig = NodeTypeRegistry.getType('test');

    let nodeModel = new NodeModel(1, 1, 'test', 0, 0, nodeTypeConfig);

    // nodeModel.setProperties(NodeGenerator.createProps(1, nodeTypeConfig.properties, new WeakRef(nodeModel)));

    // nodeModel.setExProps(NodeGenerator.createRecordProps(1, nodeTypeConfig.exProperties, new WeakRef(nodeModel)));

    let nodeView = document.createElement('div');
    nodeView.style.position = 'relative';
    nodeView.style.top = '50px';
    nodeView.style.left = '50px';
    nodeView.style.width = '240px';
    nodeView.style.height = '240px';
    nodeView.style.boxShadow = '0 0 12px #ffffff'

    const world = document.getElementById('canvas');


    world.appendChild(nodeView);
    // world.appendChild(nodeView.element);

    nodeModel.initialize();
    const weakRef = new WeakRef(nodeView);

    setTimeout(() => {
        // nodeView.destroy();
        nodeModel = null;
        nodeView.remove();
        nodeView = null;
    }, 10);


    // 稍后（例如在 setTimeout 中）检查
    console.log('检查释放')
    setInterval(() => {
        const recovered = weakRef.deref();
        if (recovered) {
            console.log('对象尚未被释放');
        } else {
            console.log('对象已经被释放（或即将被释放）');
        }

    }, 5000);

}


// 初始化函数
function initWebview(callback) {
    console.log('初始化Webview');

    const world = document.getElementById('canvas-world');
    const viewport = document.getElementById('canvas-viewport');

    if (!world || !viewport) {
        console.error('❌ 未找到画布或视口元素');
        return;
    }

    if (core) {
        // 已经初始化过，直接回调
        if (callback) callback(null, core);
        return;
    }

    // 模拟异步初始化（例如加载资源、建立连接）
    setTimeout(() => {
        try {
            core = new ControllerCore(world, viewport);
            // updateStatus("已连接"); // 可恢复
            console.log('核心控制器初始化成功');
            if (callback) callback(null, core);
        } catch (error) {
            console.error('初始化失败:', error);
            if (callback) callback(error);
        }
    }, 100); // 假设初始化需要100ms
}


// 自动初始化
if (document.readyState === 'loading') {
    updateStatus("正在初始化...");
    console.log('正在初始化...');
    document.addEventListener('DOMContentLoaded', () => {
        initWebview();
    });
} else {
    initWebview();
    updateStatus("初始化完成");
}


/** @type {any} */
const win = window;
win.vscode = vscode;

win.toggleConsole = toggleConsole;

win.openFilesPage = openFilesPage;
win.togglePanel = togglePanel;

win.clearCanvas = clearCanvas;
win.addNode = addNode;
win.addBlankNode = addBlankNode;
win.addTestNode = addTestNode;


win.setScale = setScale;
win.fitView = fitView;
win.changeMode = changeMode;
win.toggleConnections = toggleConnections;


win.generateTest = generateTest;
win.customCheck = customCheck;
