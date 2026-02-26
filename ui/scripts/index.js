/* eslint-env browser */
// 浏览器中使用的兼容版本


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

function readMod() {
    updateStatus("读取mod中，请选择synopsis.json，如果mod文件夹内项目过多，读取时间可能较长");

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

}

// todo 加载图表
function loadGraph() {
    updateStatus("加载图表...");

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
    addNode('test');
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


function toggleConnections() {
    const hidden = actionManager.toggleConnections();
    document.getElementById('toggle-connections').textContent = hidden ? '显示连接' : '隐藏连接';
}

function changeMode(mode){
    const btns = document.querySelectorAll('.view-btn');
    let found = false;
    let currentMode = actionManager.getMode();
    let currentModeButton = null;

    btns.forEach(btn => {
        updateStatus(btn.dataset);

        if (btn.dataset.mode === currentMode) {
            currentModeButton = btn;
        }
        if (btn.dataset.mode === mode) {
            found = true;
            btn.classList.add('active');
        }else {
            btn.classList.remove('active');
        }
    })

    if (!found) {
        console.warn('❌ 未找到模式按钮');

        if (!currentModeButton) {
            console.error('❌ 未找到当前模式按钮');
            return;
        }
        currentModeButton.classList.add('active');
    }


    actionManager.setMode(mode);
    // updateStatus("模式已切换为" + mode);
}

function fitView() {
    actionManager.fitView();
}

function setScale(scale) {
    updateStatus("缩放比例已设置为" + scale);
    actionManager.setZoom(scale);
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

}

function generateTest() {
    for (let index = 0; index < 1000; index++) {
        addTestNode();
    }
}

function toggleConsole() {

}

function customCheck() {

}


// 初始化函数
function initWebview() {
    // updateStatus("已连接");

    const canvas = document.getElementById('canvas');
    const viewport = document.getElementById('canvas-container');
    if (!canvas) {
        console.error('❌ Canvas 元素未找到');
        setTimeout(initWebview, 100);
        return;
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
    document.addEventListener('DOMContentLoaded', () => {
        initWebview();
        updateStatus("初始化完成");
    });
} else {
    initWebview();
    updateStatus("初始化完成");
}

// 计算工具

function viewportToCanvas(canvas, x, y, transform) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (x - rect.left - transform.x) / transform.scale,
        y: (y - rect.top - transform.y) / transform.scale,
    };
}
