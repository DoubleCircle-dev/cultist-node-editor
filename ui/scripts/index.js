import { ControllerCore } from './controllers/controllerCore.js';


// 创建全局管理器实例
let core = null;
let vscode = null;

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
export function addNode(type) {

    core.nodeManager.addNode(type);

}

export function addBlankNode() {
    addNode('blank');
}


export function toggleConnections() {


}

export function changeMode(mode) {
    // const btns = document.querySelectorAll('.view-btn');
    // let found = false;
    // let currentMode = actionManager.getMode();
    // let currentModeButton = null;

    // btns.forEach(btn => {
    //     if (btn.dataset.mode === currentMode) {
    //         currentModeButton = btn;
    //     }
    //     if (btn.dataset.mode === mode) {
    //         found = true;
    //         btn.classList.add('active');
    //     } else {
    //         btn.classList.remove('active');
    //     }
    // })

    // if (!found) {
    //     console.warn('❌ 未找到模式按钮');

    //     if (!currentModeButton) {
    //         console.error('❌ 未找到当前模式按钮');
    //         return;
    //     }
    //     currentModeButton.classList.add('active');
    // }


    // actionManager.setMode(mode);
    // // updateStatus("模式已切换为" + mode);
}

export function fitView() {
    core.canvasManager.fitView();
}

export function setScale(scale) {
    updateStatus("缩放比例已设置为" + scale);
    core.canvasManager.setZoom(scale);
}

// 撤销上一次操作
export function undoLastAction() {
}

// 重做上一次撤销的操作
export function redoLastAction() {
    
}

export function testCommunication() {

}

export function generateTest() {
    for (let index = 0; index < 1000; index++) {
        addTestNode();
    }
}

export function toggleConsole() {
    if (isVsCodeWebview){
        vscode.postMessage({ command:'openConsole' });
    }else{
        eruda.get('entryBtn').show();
        eruda.show();
    }
}

export function customCheck() {

}


// 初始化函数
function initWebview(callback) {
    console.log('初始化Webview');

    const world = document.getElementById('canvas');
    const viewport = document.getElementById('canvas-container');

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

win.customCheck = customCheck;
win.clearCanvas = clearCanvas;
win.addNode = addNode;
win.addBlankNode = addBlankNode;
win.addTestNode = addTestNode;
win.fitView = fitView;
win.toggleConsole = toggleConsole;

win.generateTest = generateTest;
