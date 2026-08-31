import { ControllerCore } from './controllers/controllerCore.js';
import { NodeModel } from './models/nodeModels/nodeModel.js';
import { NodeTypeRegistry } from "./types/nodeTypes.js";
import { NodeGenerator } from "./generators/nodeGenerator.js"
import { NodeView } from './views/nodeView.js';
import { ModDataRegistry } from './modDataRegistry.js';


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
    if (vscode) {
        vscode.postMessage({ command: 'readMod' });
    } else {
        console.warn('非 VSCode 环境，无法读取 mod');
    }
}

/** 保存图表（经 VSCode 后端写入文件） */
export function saveGraph() {
    updateStatus("保存图表...");
    if (!vscode) {
        console.warn('非 VSCode 环境，无法保存图表');
        return;
    }
    const graphData = {
        nodes: (core ? core.nodes : []).map((node) => node.toJSON()),
        connections: [],
        metadata: {
            created: new Date().toISOString(),
            version: "1.0",
        },
    };
    vscode.postMessage({ command: 'saveGraph', data: graphData });
}

/** 加载图表（从 JSON 文件恢复） */
export function loadGraph() {
    updateStatus("加载图表...");
    if (vscode) {
        vscode.postMessage({ command: 'loadGraph' });
    } else {
        console.warn('非 VSCode 环境，无法加载图表');
    }
}

/** 新建 mod 基础结构（synopsis.json + content/） */
export function newMod() {
    updateStatus("新建 mod 基础结构...");
    if (vscode) {
        vscode.postMessage({ command: 'newMod' });
    } else {
        console.warn('非 VSCode 环境，无法新建 mod');
    }
}

/** 打开单个 mod json 文件作为节点预览 */
export function openJsonPreview() {
    updateStatus("打开 json 预览...");
    if (vscode) {
        vscode.postMessage({ command: 'openJsonPreview' });
    } else {
        console.warn('非 VSCode 环境，无法预览 json');
    }
}

/**
 * 把后端加载的数据注册进数据池（按类别，供基础类型实例化时选择）。
 * 注意：节点类型始终是基础类型（recipes/elements/...），这里不注册任何动态类型。
 *
 * @param {string} label - 来源描述（用于状态提示）
 * @param {{ namespace: string, source: string, categories: Record<string, any[]>, count?: number }} data
 */
function registerData(label, data) {
    if (!data || !data.categories || typeof data.categories !== 'object') return;
    const registered = ModDataRegistry.register(data);
    // 加载后自动把数据转换为可查看的节点（铺到画布，受规模上限限制；超出保留在数据池）
    const created = core ? core.autoLayoutLoadedData(data.namespace) : 0;
    updateStatus(`✅ ${label}：已加载 ${registered} 条数据，铺图 ${created} 个节点`);
    console.log(`[数据池] ${label} 加载 ${registered} 条（来源: ${data.source}），自动铺图 ${created} 个`);
}

/** 接收 VSCode 后端消息 */
function handleVscodeMessage(event) {
    const message = event.data;
    if (!message || !message.command) return;

    switch (message.command) {
        case 'init':
            updateStatus(message.message || '已就绪');
            break;
        case 'originLoaded':
            registerData('游戏基础内容', message.data);
            break;
        case 'modLoaded': {
            const name = (message.data.synopsis && message.data.synopsis.name) || '';
            registerData(`Mod:${name}`, message.data);
            if (message.data.errors && message.data.errors.length) {
                console.warn('[modLoaded] 读取告警:', message.data.errors);
            }
            break;
        }
        case 'jsonPreviewLoaded':
            registerData(`预览:${message.data.fileName}`, message.data);
            break;
        case 'modCreated':
            updateStatus(`✅ 已创建 mod: ${message.data.synopsisPath}`);
            break;
        case 'saveConfirmed':
            updateStatus(`✅ 图表已保存到: ${message.path}`);
            break;
        case 'graphLoaded':
            updateStatus(`✅ 图表已加载（${message.data ? message.data.nodes?.length || 0 : 0} 个节点）`);
            break;
        case 'error':
            updateStatus(`❌ ${message.message || '发生错误'}`);
            break;
        default:
            break;
    }
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
    core.addNode(type);
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
            win.controlCore = core;

            // 通知后端 webview 已就绪（自定义编辑器「打开方式」依赖此信号发送预览数据）
            if (vscode) {
                vscode.postMessage({ command: 'webviewReady' });
            }

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

win.readMod = readMod;
win.saveGraph = saveGraph;
win.loadGraph = loadGraph;
win.newMod = newMod;
win.openJsonPreview = openJsonPreview;

win.setScale = setScale;
win.fitView = fitView;
win.changeMode = changeMode;
win.toggleConnections = toggleConnections;

win.controlCore = core;


win.generateTest = generateTest;
win.customCheck = customCheck;

// 接收 VSCode 后端消息（init / originLoaded / modLoaded / jsonPreviewLoaded / modCreated ...）
// 浏览器环境也挂载，便于用 window.postMessage 调试；真实 webview 中后端消息同样走该事件。
window.addEventListener('message', handleVscodeMessage);
