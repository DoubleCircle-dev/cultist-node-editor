// 仅限Webview中使用，禁用检查
/* eslint-disable no-undef */
// @ts-nocheck


// 节点类型配置
const nodeTypes = {
    test: {
        title: '测试节点',
        color: '#6c5ce7',
        inputs: 1,
        outputs: 1,
        content: (id) => `这是一个测试节点<br>ID: ${id}<br>类型: 通用测试`,
        icon: '⚡',
        properties: [
            { label: '数值', type: 'number', min: 0, max: 100, default: 50 },
            { label: '开关', type: 'checkbox', default: false }
        ]
    },
    recipes: {
        title: '交互',
        color: '#4CAF50',
        inputs: 1,
        outputs: 1,
        content: (id) => `音频输入节点<br>ID: ${id}<br>采样率: 44100Hz`,
        icon: '📖',
        properties: [
        ]
    },
    elements: {
        title: '音频输出',
        color: '#2196F3',
        inputs: 1,
        outputs: 0,
        content: (id) => `音频输出节点<br>ID: ${id}<br>声道: 立体声`,
        icon: '🔊',
        properties: [
            { label: '声道', type: 'select', options: ['单声道', '立体声', '5.1'], default: 1 },
            { label: '音量', type: 'range', min: 0, max: 100, default: 75 }
        ]
    },
    decks: {
        title: '滤波器',
        color: '#FF9800',
        inputs: 1,
        outputs: 1,
        content: (id) => `滤波器节点<br>ID: ${id}<br>类型: 低通滤波器`,
        icon: '🎛️',
        properties: [
            { label: '类型', type: 'select', options: ['低通', '高通', '带通'], default: 0 },
            { label: '频率', type: 'range', min: 20, max: 20000, default: 1000 },
            { label: 'Q值', type: 'range', min: 0.1, max: 10, step: 0.1, default: 1 }
        ]
    },
    verbs: {
        title: '延迟效果',
        color: '#9C27B0',
        inputs: 1,
        outputs: 1,
        content: (id) => `延迟节点<br>ID: ${id}<br>最大延迟: 2000ms`,
        icon: '⏱️',
        properties: [
            { label: '延迟时间', type: 'range', min: 0, max: 2000, default: 500 },
            { label: '反馈', type: 'range', min: 0, max: 100, default: 30 },
            { label: '混合', type: 'range', min: 0, max: 100, default: 50 }
        ]
    },
    text: {
        title: '混音器',
        color: '#3F51B5',
        inputs: 4,
        outputs: 2,
        content: (id) => `混音器节点<br>ID: ${id}<br>通道: 4进2出`,
        icon: '🎚️',
        properties: [
            { label: '通道1', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道2', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道3', type: 'range', min: 0, max: 100, default: 100 },
            { label: '通道4', type: 'range', min: 0, max: 100, default: 100 }
        ]
    }
};


const vscode = acquireVsCodeApi();
let nodeCount = 0;
let selectedNodes = new Set();
let isDragging = false;
let isConnecting = false;
let dragOffset = { x: 0, y: 0 };
let connectionStart = null;
const nodes = new Map();
const connections = [];

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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initNodePalette();
    initCanvasEvents();
    updateStatus('就绪');
});

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
    nodeCount++;
    const canvas = document.getElementById("canvas");
    const placeholder = document.getElementById("placeholder");

    if (placeholder) {
        placeholder.style.display = "none";
    }

    const node = document.createElement("div");
    node.className = "test-node";
    node.id = "node-" + nodeCount;
    node.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px;">测试节点 #${nodeCount}</div>
        <div style="font-size: 11px; color: #999;">这是一个测试节点</div>
        <div class="port input" style="top: 50%;"></div>
        <div class="port output" style="top: 50%;"></div>
    `;

    // 随机位置
    const x = Math.random() * (canvas.clientWidth - 150);
    const y = Math.random() * (canvas.clientHeight - 100);
    node.style.left = x + "px";
    node.style.top = y + "px";

    // 添加拖拽功能
    let isDragging = false;
    let offsetX, offsetY;

    node.addEventListener("mousedown", startDrag);

    function startDrag(e) {
        if (e.target.classList.contains("port")) return;

        isDragging = true;
        offsetX = e.clientX - node.getBoundingClientRect().left;
        offsetY = e.clientY - node.getBoundingClientRect().top;

        document.addEventListener("mousemove", drag);
        document.addEventListener("mouseup", stopDrag);

        // 选中效果
        document
            .querySelectorAll(".test-node")
            .forEach((n) => n.classList.remove("selected"));
        node.classList.add("selected");
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

        node.style.left = x + "px";
        node.style.top = y + "px";

        updateStatus(`节点位置: ${Math.round(x)}, ${Math.round(y)}`);
    }

    function stopDrag() {
        isDragging = false;
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("mouseup", stopDrag);
    }

    canvas.appendChild(node);
    updateStatus(`添加测试节点 #${nodeCount}`);
}

/// 添加节点
function addNode(type, x, y) {
    try {
        nodeCount++;
        const nodeId = `node-${nodeCount}`;
        const config = nodeTypes[type];

        const node = {
            id: nodeId,
            type: type,
            config: config,
            x: x !== undefined ? x : Math.random() * (canvas.clientWidth - 220),
            y: y !== undefined ? y : Math.random() * (canvas.clientHeight - 120),
            connections: {
                inputs: Array(config.inputs).fill(null),
                outputs: Array(config.outputs).fill(null)
            },
            data: {}
        };

        nodes.set(nodeId, node);
        createNodeElement(node);

        // 隐藏占位符
        const placeholder = document.getElementById('placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        // updateStatus(`测试点 #${nodeCount}...`);

        updateStatus(`添加 ${config.title} #${nodeCount}`);

        return node;
    } catch (error) {
        console.error('❌ 添加节点时出错:' + error);
        nodeCount--;
        updateStatus('添加节点时出错');
    }


}

// 创建节点DOM元素
function createNodeElement(node) {
    const canvas = document.getElementById('canvas');

    const element = document.createElement('div');
    element.className = 'node';
    element.id = node.id;
    element.dataset.nodeType = node.type;
    element.style.left = node.x + 'px';
    element.style.top = node.y + 'px';
    element.style.borderColor = node.config.color;

    // 构建HTML
    let portsHTML = '';

    // 输入端口
    for (let i = 0; i < node.config.inputs; i++) {
        const topPercent = ((i + 1) * 100 / (node.config.inputs + 1));
        portsHTML += `
            <div class="port input" 
                 data-node-id="${node.id}"
                 data-port-type="input"
                 data-port-index="${i}"
                 style="top: ${topPercent}%"
                 onmousedown="startConnection(event, '${node.id}', ${i}, 'input')">
                <div class="port-label">输入 ${i + 1}</div>
            </div>
        `;
    }

    // 输出端口
    for (let i = 0; i < node.config.outputs; i++) {
        const topPercent = ((i + 1) * 100 / (node.config.outputs + 1));
        portsHTML += `
            <div class="port output" 
                 data-node-id="${node.id}"
                 data-port-type="output"
                 data-port-index="${i}"
                 style="top: ${topPercent}%"
                 onmousedown="startConnection(event, '${node.id}', ${i}, 'output')">
                <div class="port-label">输出 ${i + 1}</div>
            </div>
        `;
    }

    // 属性输入
    let propertiesHTML = '';
    if (node.config.properties) {
        node.config.properties.forEach((prop, index) => {
            let inputHTML = '';
            switch (prop.type) {
                case 'range':
                    inputHTML = `
                        <input type="range" 
                               class="property-input"
                               min="${prop.min || 0}" 
                               max="${prop.max || 100}" 
                               step="${prop.step || 1}"
                               value="${prop.default || 50}"
                               onchange="updateNodeProperty('${node.id}', ${index}, this.value)">
                    `;
                    break;
                case 'select':
                    const options = prop.options.map((opt, i) =>
                        `<option value="${i}" ${i === prop.default ? 'selected' : ''}>${opt}</option>`
                    ).join('');
                    inputHTML = `
                        <select class="property-input" 
                                onchange="updateNodeProperty('${node.id}', ${index}, this.value)">
                            ${options}
                        </select>
                    `;
                    break;
                case 'checkbox':
                    inputHTML = `
                        <input type="checkbox" 
                               class="property-input"
                               ${prop.default ? 'checked' : ''}
                               onchange="updateNodeProperty('${node.id}', ${index}, this.checked)">
                    `;
                    break;
                default:
                    inputHTML = `
                        <input type="${prop.type}" 
                               class="property-input"
                               value="${prop.default || ''}"
                               onchange="updateNodeProperty('${node.id}', ${index}, this.value)">
                    `;
            }

            propertiesHTML += `
                <div class="property-item">
                    <div class="property-label">${prop.label}:</div>
                    ${inputHTML}
                </div>
            `;
        });
    }

    element.innerHTML = `
        <div class="node-header">
            <div class="node-icon" style="color: ${node.config.color}">${node.config.icon}</div>
            <div class="node-title">${node.config.title} #${node.id.split('-')[1]}</div>
        </div>
        <div class="node-content">
            <div class="node-info">${node.config.content(node.id.split('-')[1])}</div>
            ${propertiesHTML ? `<div class="node-properties">${propertiesHTML}</div>` : ''}
        </div>
        <div class="node-ports">${portsHTML}</div>
    `;

    // 初始化节点数据
    if (node.config.properties) {
        node.config.properties.forEach((prop, index) => {
            node.data[prop.label] = prop.default;
        });
    }

    canvas.appendChild(element);
    node.element = element;

    // 为整个节点添加选中事件监听（端口和输入框除外）
    // 相关变量
    setupNodeSelected(element);

    // 为整个节点添加拖拽事件监听（端口和输入框除外）
    setupNodeDrag(element, node.id);

    // 添加键盘事件监听
    element.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            deleteNode(node.id);
        }
    });

    // 聚焦节点使其可接收键盘事件
    element.tabIndex = -1;

    updateStatus(`节点已添加: ${node.element} #${node.id.split('-')[1]}`);
}

// === 节点选中事件处理 ===
function setupNodeSelected(element) {
    element.addEventListener('mousedown', (e) => {
        if (shouldIgnoreDrag(e.target)) {
            return
        }

        // 选中节点
        document
            .querySelectorAll('.node')
            .forEach((n) => n.classList.remove('selected'));
        element.classList.add('selected');

    });
}

// === 拖拽功能实现 ===

// 拖拽相关变量
let dragState = {
    isDragging: false,
    nodeId: null,
    offsetX: 0,
    offsetY: 0,
    initialX: 0,
    initialY: 0,
    draggedNode: null
};

// 为节点设置拖拽功能
function setupNodeDrag(element, nodeId) {
    // 在节点上添加鼠标按下事件监听
    element.addEventListener('mousedown', (e) => {
        // 检查是否点击了不应该触发拖拽的元素
        if (shouldIgnoreDrag(e.target)) {
            return;
        }

        startDrag(e, nodeId);
    });

    // 防止在节点内进行文本选择（拖拽时）
    element.addEventListener('selectstart', (e) => {
        if (dragState.isDragging) {
            e.preventDefault();
        }
    });
}

// 检查是否应该忽略拖拽
function shouldIgnoreDrag(target) {
    // 如果点击的是以下元素，则忽略拖拽
    return target.closest('.port') ||           // 端口
        target.closest('.property-input') ||  // 属性输入框
        target.closest('.node-action-btn') || // 删除按钮
        target.closest('select') ||           // 下拉框
        target.closest('input[type="range"]') || // 滑块
        target.closest('input[type="checkbox"]'); // 复选框
}

// 开始拖拽
function startDrag(event, nodeId) {
    event.preventDefault();
    event.stopPropagation();

    const node = nodes.get(nodeId);
    if (!node) return;

    // 获取节点当前位置
    const rect = node.element.getBoundingClientRect();

    // 计算鼠标相对于节点的偏移
    dragState = {
        isDragging: true,
        nodeId: nodeId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        initialX: node.x,
        initialY: node.y,
        draggedNode: node
    };

    node.element.classList.add('selected');

    // 添加拖拽样式
    node.element.classList.add('dragging');

    // 将节点置于顶层
    bringNodeToFront(nodeId);

    // 添加全局事件监听
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);

    updateStatus(`拖动节点: ${node.config.title} #${nodeId.split('-')[1]}`);
}

// 处理拖拽
function handleDrag(event) {
    if (!dragState.isDragging || !dragState.draggedNode) return;

    event.preventDefault();

    const node = dragState.draggedNode;
    const canvasRect = canvas.getBoundingClientRect();

    // 计算新位置
    let newX = event.clientX - dragState.offsetX - canvasRect.left;
    let newY = event.clientY - dragState.offsetY - canvasRect.top;

    // 边界检查
    newX = Math.max(0, Math.min(newX, canvas.clientWidth - node.element.offsetWidth));
    newY = Math.max(0, Math.min(newY, canvas.clientHeight - node.element.offsetHeight));

    // 更新节点位置
    node.x = newX;
    node.y = newY;

    // 更新DOM元素位置
    node.element.style.left = newX + 'px';
    node.element.style.top = newY + 'px';

    // 实时更新连接线位置
    updateNodeConnections(node.id);
}

// 停止拖拽
function stopDrag(event) {
    if (!dragState.isDragging) return;

    const node = dragState.draggedNode;
    if (node) {
        node.element.classList.remove('dragging');

        // 检查位置是否有变化
        const moved = node.x !== dragState.initialX || node.y !== dragState.initialY;
        if (moved) {
            updateStatus(`移动节点到: (${Math.round(node.x)}, ${Math.round(node.y)})`);

            // 触发保存或更新操作
            if (typeof onNodeMoved === 'function') {
                onNodeMoved(node.id, node.x, node.y);
            }
        }
    }

    // 重置拖拽状态
    dragState = {
        isDragging: false,
        nodeId: null,
        offsetX: 0,
        offsetY: 0,
        initialX: 0,
        initialY: 0,
        draggedNode: null
    };

    // 移除事件监听
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', stopDrag);
}

// 更新节点的所有连接线
function updateNodeConnections(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return;

    // 更新输入连接线
    node.connections.inputs.forEach((connection, index) => {
        if (connection) {
            updateConnectionPosition(connection.id);
        }
    });

    // 更新输出连接线
    node.connections.outputs.forEach((connection, index) => {
        if (connection) {
            updateConnectionPosition(connection.id);
        }
    });
}

// 更新单个连接线的位置
function updateConnectionPosition(connectionId) {
    const connection = connections.get(connectionId);
    if (!connection) return;

    const line = document.querySelector(`.connection-line[data-connection-id="${connectionId}"]`);
    if (!line) return;

    const fromNode = nodes.get(connection.from.nodeId);
    const toNode = nodes.get(connection.to.nodeId);

    if (!fromNode || !toNode) return;

    // 获取端口位置
    const fromPort = getPortPosition(fromNode, connection.from.portIndex, 'output');
    const toPort = getPortPosition(toNode, connection.to.portIndex, 'input');

    // 更新SVG路径
    const path = line.querySelector('path');
    if (path) {
        path.setAttribute('d', createConnectionPath(fromPort, toPort));
    }
}

// 获取端口位置
function getPortPosition(node, portIndex, type) {
    const port = node.element.querySelector(`.port[data-port-type="${type}"][data-port-index="${portIndex}"]`);
    if (!port) return { x: node.x, y: node.y };

    const portRect = port.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    return {
        x: portRect.left + portRect.width / 2 - canvasRect.left,
        y: portRect.top + portRect.height / 2 - canvasRect.top
    };
}

// 将节点置于顶层
function bringNodeToFront(nodeId) {
    const node = nodes.get(nodeId);
    if (!node || !node.element) return;

    // 获取当前最大z-index
    const allNodes = Array.from(document.querySelectorAll('.node'));
    const maxZIndex = Math.max(...allNodes.map(n =>
        parseInt(window.getComputedStyle(n).zIndex) || 0
    ), 1000);

    // 设置新的z-index
    node.element.style.zIndex = maxZIndex + 1;
}

// 删除节点
function deleteNode(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return;

    if (confirm(`确定要删除节点 "${node.config.title}" 吗？`)) {
        // 移除所有连接
        removeAllConnections(nodeId);

        // 从DOM中移除节点
        if (node.element && node.element.parentNode) {
            node.element.parentNode.removeChild(node.element);
        }

        // 从nodes集合中移除
        nodes.delete(nodeId);

        updateStatus(`已删除节点: ${node.config.title} #${nodeId.split('-')[1]}`);
    }
}

// 移除节点的所有连接
function removeAllConnections(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return;

    // 移除输入连接
    node.connections.inputs.forEach((connection, index) => {
        if (connection) {
            removeConnection(connection.id);
        }
    });

    // 移除输出连接
    node.connections.outputs.forEach((connection, index) => {
        if (connection) {
            removeConnection(connection.id);
        }
    });
}

// 开始创建连接
function startConnection(e, nodeId, portIndex, portType) {
    isConnecting = true;
    connectionStart = { nodeId, portIndex, portType };

    // 创建临时连接线
    const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.id = 'temp-connection';
    tempPath.classList.add('connection-path');
    document.getElementById('connections').appendChild(tempPath);

    document.addEventListener('mousemove', updateTempConnection);
    document.addEventListener('mouseup', endConnection);

    e.stopPropagation();
}

// 更新临时连接线
function updateTempConnection(e) {
    if (!isConnecting || !connectionStart) return;

    const startPort = document.querySelector(`[data-node-id="${connectionStart.nodeId}"][data-port-index="${connectionStart.portIndex}"]`);
    if (!startPort) return;

    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const startRect = startPort.getBoundingClientRect();

    const startX = startRect.left + startRect.width / 2 - canvasRect.left;
    const startY = startRect.top + startRect.height / 2 - canvasRect.top;
    const endX = e.clientX - canvasRect.left;
    const endY = e.clientY - canvasRect.top;

    const path = `M ${startX} ${startY} C ${startX + 100} ${startY}, ${endX - 100} ${endY}, ${endX} ${endY}`;

    const tempPath = document.getElementById('temp-connection');
    tempPath.setAttribute('d', path);
}

// 结束连接
function endConnection(e) {
    if (!isConnecting || !connectionStart) return;

    // 移除临时连接线
    const tempPath = document.getElementById('temp-connection');
    if (tempPath) tempPath.remove();

    // 检查是否连接到了端口
    const targetPort = e.target.closest('.port');
    if (targetPort && targetPort !== document.querySelector(`[data-node-id="${connectionStart.nodeId}"]`)) {
        const endNodeId = targetPort.dataset.nodeId;
        const endPortIndex = parseInt(targetPort.dataset.portIndex);
        const endPortType = targetPort.dataset.portType;

        // 检查连接是否有效（输入连输出或输出连输入）
        if ((connectionStart.portType === 'output' && endPortType === 'input') ||
            (connectionStart.portType === 'input' && endPortType === 'output')) {

            createConnection(
                connectionStart.nodeId,
                connectionStart.portIndex,
                connectionStart.portType,
                endNodeId,
                endPortIndex,
                endPortType
            );
        }
    }

    isConnecting = false;
    connectionStart = null;
    document.removeEventListener('mousemove', updateTempConnection);
    document.removeEventListener('mouseup', endConnection);
}

// 创建连接
function createConnection(startNodeId, startPortIndex, startPortType, endNodeId, endPortIndex, endPortType) {
    const connectionId = `${startNodeId}-${startPortIndex}-${endNodeId}-${endPortIndex}`;

    // 检查连接是否已存在
    if (connections.some(c => c.id === connectionId)) {
        return;
    }

    const connection = {
        id: connectionId,
        start: { nodeId: startNodeId, portIndex: startPortIndex, portType: startPortType },
        end: { nodeId: endNodeId, portIndex: endPortIndex, portType: endPortType }
    };

    connections.push(connection);

    // 更新节点连接状态
    const startNode = nodes.get(startNodeId);
    const endNode = nodes.get(endNodeId);

    if (startPortType === 'output') {
        startNode.connections.outputs[startPortIndex] = connectionId;
    } else {
        startNode.connections.inputs[startPortIndex] = connectionId;
    }

    if (endPortType === 'output') {
        endNode.connections.outputs[endPortIndex] = connectionId;
    } else {
        endNode.connections.inputs[endPortIndex] = connectionId;
    }

    // 更新端口样式
    updatePortStyles();
    // 绘制连接线
    drawConnections();

    updateStatus(`创建连接: ${startNodeId} → ${endNodeId}`);
}

// 绘制所有连接线
function drawConnections() {
    const svg = document.getElementById('connections');
    svg.innerHTML = '';

    connections.forEach(connection => {
        const startPort = document.querySelector(
            `[data-node-id="${connection.start.nodeId}"][data-port-index="${connection.start.portIndex}"]`
        );
        const endPort = document.querySelector(
            `[data-node-id="${connection.end.nodeId}"][data-port-index="${connection.end.portIndex}"]`
        );

        if (!startPort || !endPort) return;

        const canvas = document.getElementById('canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const startRect = startPort.getBoundingClientRect();
        const endRect = endPort.getBoundingClientRect();

        const startX = startRect.left + startRect.width / 2 - canvasRect.left;
        const startY = startRect.top + startRect.height / 2 - canvasRect.top;
        const endX = endRect.left + endRect.width / 2 - canvasRect.left;
        const endY = endRect.top + endRect.height / 2 - canvasRect.top;

        // 贝塞尔曲线
        const dx = Math.abs(endX - startX);
        const curve = Math.min(dx * 0.5, 150);

        let path;
        if (connection.start.portType === 'output') {
            path = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
        } else {
            path = `M ${startX} ${startY} C ${startX - curve} ${startY}, ${endX + curve} ${endY}, ${endX} ${endY}`;
        }

        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttribute('d', path);
        pathElement.classList.add('connection-path');
        pathElement.dataset.connectionId = connection.id;
        pathElement.addEventListener('dblclick', () => removeConnection(connection.id));

        svg.appendChild(pathElement);
    });
}

// 更新连接线
function updateConnections() {
    drawConnections();
}

// 更新端口样式
function updatePortStyles() {
    document.querySelectorAll('.port').forEach(port => {
        port.classList.remove('connected');
    });

    connections.forEach(connection => {
        const startPort = document.querySelector(
            `[data-node-id="${connection.start.nodeId}"][data-port-index="${connection.start.portIndex}"]`
        );
        const endPort = document.querySelector(
            `[data-node-id="${connection.end.nodeId}"][data-port-index="${connection.end.portIndex}"]`
        );

        if (startPort) startPort.classList.add('connected');
        if (endPort) endPort.classList.add('connected');
    });
}

// 初始化函数
function initWebview() {
    updateStatus("已连接");

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

// 导出函数到全局作用域
window.vscodeAPI = {
    updateStatus,
    addNode,
    readMod,
    saveGraph,
    loadGraph,
    executeGraph,
    clearCanvas,
    addTestNode,
    initWebview
};

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWebview);
} else {
    initWebview();
}

