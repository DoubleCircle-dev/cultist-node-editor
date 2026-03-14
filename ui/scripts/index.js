import { NodeManager } from './controllers/nodeManager.js';
import { BasicActionManager } from './controllers/actionManager.js';
import { BaseNodeModel } from './models/nodeModels/baseNodeModel.js'
import { NodeModel } from './models/nodeModels/nodeModel.js'
import { NodeView } from './views/nodeView.js';
import { BaseProp } from './models/propModels/baseProp.js';
import { PortProp } from './models/propModels/portProp.js';
import { PortModel } from './models/portModel.js';
import { PropView } from './views/propView.js';

// 创建全局管理器实例
let actionManager = null;
let nodeManager = null;
let canvas = null;

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

    nodeManager.clear();

    canvas.innerHTML = '';
    canvas.style.width = '100%';

    // 显示占位符
    const placeholder = document.getElementById("placeholder");
    if (placeholder) {
        placeholder.style.display = "block";
    }

    updateStatus("画布已清空");
}

// 添加测试节点（直接在Webview中）
export function addTestNode() {
    addNode('test');
}

// 添加节点
export function addNode(type) {
    try {
        let x = Math.random() * (canvas.clientWidth - 220);
        let y = Math.random() * (canvas.clientHeight - 120);
        nodeManager.addNode(type, x, y);
    } catch (error) {
        console.error('❌ 添加节点时出错:' + error);
        updateStatus('添加节点时出错' + error.message);
    }
}

export function addBlankNode() {
    addNode('blank');
}


export function toggleConnections() {
    const hidden = actionManager.toggleConnections();
    document.getElementById('toggle-connections').textContent = hidden ? '显示连接' : '隐藏连接';
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
    actionManager.fitView();
}

export function setScale(scale) {
    updateStatus("缩放比例已设置为" + scale);
    actionManager.setZoom(scale);
}

// 撤销上一次操作
export function undoLastAction() {
    if (actionManager) {
        actionManager.undoLastAction();
    }
}

// 重做上一次撤销的操作
export function redoLastAction() {
    if (actionManager) {
        actionManager.redoLastAction();
    }
}

export function testCommunication() {

}

export function generateTest() {
    for (let index = 0; index < 1000; index++) {
        addTestNode();
    }
}

export function toggleConsole() {

}

export function customCheck() {

}


// 初始化函数
function initWebview() {
    // updateStatus("已连接");

    console.log('初始化Webview');

    canvas = document.getElementById('canvas');
    const viewport = document.getElementById('canvas-container');
    if (!canvas) {
        console.error('❌ Canvas 元素未找到');
        setTimeout(initWebview, 100);
        return;
    } else {
        console.log('Canvas 加载中');
    }

    if (!nodeManager) {
        nodeManager = new NodeManager(viewport, canvas, updateStatus); // 节点管理器实例
        console.log('nodeManager 加载中');
        setTimeout(initWebview, 100);
        return;
    }

    if (!actionManager) {
        if (!nodeManager) {
            console.error('❌ nodeManager 未初始化');
            return;
        }
        actionManager = new BasicActionManager(viewport, canvas, updateStatus, nodeManager); // 操作管理器实例
        console.log('actionManager 加载中');
        setTimeout(initWebview, 100);
        return;
    }

    changeMode('select');
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


// 计算工具

export function viewportToCanvas(canvas, x, y, transform) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (x - rect.left - transform.x) / transform.scale,
        y: (y - rect.top - transform.y) / transform.scale,
    };
}

/** @type {any} */
const win = window;
win.customCheck = customCheck;
win.clearCanvas = clearCanvas;
win.addNode = addNode;
win.addBlankNode = addBlankNode;
win.addTestNode = addTestNode;
