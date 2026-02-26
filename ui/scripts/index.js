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
        console.log('nodeManager 加载中');
        setTimeout(initWebview, 100);
        return;
    }

    if (!actionManager) {
        if (!nodeManager) {
            console.error('❌ nodeManager 未初始化');
            return;
        }
        actionManager = new BasicActionManager(canvas, updateStatus, nodeManager); // 操作管理器实例
        console.log('actionManager 加载中');
        setTimeout(initWebview, 100);
        return;
    }

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

function viewportToCanvas(canvas, x, y, transform) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (x - rect.left - transform.x) / transform.scale,
        y: (y - rect.top - transform.y) / transform.scale,
    };
}


// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWebview);
} else {
    initWebview();
}
