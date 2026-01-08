// 仅限Webview中使用，禁用检查
/* eslint-disable no-undef */
// @ts-nocheck

// PortDragManager将通过全局对象访问

// 全局变量管理
const vscode = acquireVsCodeApi();
let nodeCount = 0;
let selectedNodes = new Set();
let isConnecting = false;
let connectionStart = null;
const nodes = new Map();
const connections = [];

// 创建全局管理器实例
// 在DOM加载完成后初始化PortDragManager
let portDragManager;
let actionManager;

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
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
});
// 在DOM加载完成后初始化BasicActionManager

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

function addSimpleTestNode() {
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
        console.log('拖动中');
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

// 添加节点
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

        // 添加操作到历史记录
        if (actionManager) {
            actionManager.addActionToHistory({
                type: 'addNode',
                nodeId: nodeId,
                nodeData: {
                    id: node.id,
                    type: node.type,
                    config: node.config,
                    x: node.x,
                    y: node.y,
                    connections: node.connections,
                    data: node.data
                }
            });
        }

        // 隐藏占位符
        const placeholder = document.getElementById('placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        updateStatus(`添加 ${config.title} #${nodeCount}`);

        return node;
    } catch (error) {
        console.error('❌ 添加节点时出错:' + error);
        nodeCount--;
        updateStatus('添加节点时出错' + error.message);
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
    element.locked = false;

    node.element = element;

    // header设置，包括图标，标题，id
    element.innerHTML = '';
    element.innerHTML += `
        <div class="node-header">
            <div class="node-icon" style="color: ${node.config.color}">${node.config.icon}</div>
            <div class="node-title">
                <input type="text" 
                       class="node-title-input" 
                       value="${node.config.title}" 
                       placeholder="节点标题"
                       onchange="updateNodeTitle('${node.id}', this.value)"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
                <span class="node-id">#${node.id.split('-')[1]}</span>
            </div>
        </div>
    `;

    // 内容设置
    element.innerHTML += `
        <div class="node-content">
            <div class="node-info">${node.config.content}  </div>
    `;

    // 属性设置
    let propertiesHTML = '';
    if (node.config.properties) {
        propertiesHTML = createPropertiesHTML(node);
    }

    element.innerHTML += `
            ${propertiesHTML ? `<div class="node-properties">${propertiesHTML}</div>` : ''} 
    `;

    element.innerHTML += `
        </div>
    `;

    // 初始化节点数据
    if (node.config.properties) {
        node.config.properties.forEach((prop, index) => {
            node.data[prop.label] = prop.default;
        });
    }

    canvas.appendChild(element);

    // port-hub设置
    const portHub = document.createElement('div');
    portHub.className = 'node-port-hub';
    const portsContainer = createPortHub(node);
    portHub.appendChild(portsContainer);
    element.appendChild(portHub);

    // 为整个节点添加选中事件监听（端口和输入框除外）
    setupNodeSelected(element);

    // 为整个节点添加拖拽事件监听（端口和输入框除外）
    setupNodeDrag(element, node.id);

    // 添加键盘事件监听
    element.addEventListener('keydown', (e) => {
        if (e.key === 'Delete') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            deleteNode(node.id);
        }
    });

    // 聚焦节点使其可接收键盘事件
    element.tabIndex = 0;

    updateStatus(`节点已添加: ${node.element} #${node.id.split('-')[1]}`);
}

function createPropertiesHTML(node) {
    let propertiesHTML = '';
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
                    <div class="property-checkbox-wrapper">
                        <input type="checkbox" 
                                class="property-input property-checkbox"
                                ${prop.default ? 'checked' : ''}
                                onchange="updateNodeProperty('${node.id}', ${index}, this.checked)">
                    </div>
                `;
                break;
            case 'bool':  // 布尔类型使用单选按钮组
                const boolId = `bool-${node.id}-${index}`;
                const trueLabel = prop.labels?.true || '是';
                const falseLabel = prop.labels?.false || '否';
                inputHTML = `
                    <div class="bool-radio-group" data-id="${boolId}">
                        <label class="bool-option">
                            <input type="radio" 
                                   name="${boolId}" 
                                   value="true"
                                   ${prop.default === true ? 'checked' : ''}
                                   onchange="updateNodeProperty('${node.id}', ${index}, true)">
                            <span class="bool-radio-label">${trueLabel}</span>
                        </label>
                        <label class="bool-option">
                            <input type="radio" 
                                   name="${boolId}" 
                                   value="false"
                                   ${prop.default === false ? 'checked' : ''}
                                   onchange="updateNodeProperty('${node.id}', ${index}, false)">
                            <span class="bool-radio-label">${falseLabel}</span>
                        </label>
                    </div>
                `;
                break;
            case 'text':  // 文本输入
                inputHTML = `
                        <input type="text" 
                               class="property-input property-text"
                               value="${prop.default || ''}"
                               placeholder="${prop.placeholder || ''}"
                               onchange="updateNodeProperty('${node.id}', ${index}, this.value)"
                               onblur="updateNodeProperty('${node.id}', ${index}, this.value)">
                `;
                break;
            case 'int':  // 整数数值输入
                inputHTML = `
                        <input type="number" 
                               class="property-input property-int"
                               min="${prop.min || ''}"
                               max="${prop.max || ''}"
                               step="1"
                               value="${prop.default || 0}"
                               placeholder="${prop.placeholder || ''}"
                               onchange="updateNodeProperty('${node.id}', ${index}, parseInt(this.value) || 0)"
                               onblur="updateNodeProperty('${node.id}', ${index}, parseInt(this.value) || 0)">
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
    return propertiesHTML
}

// 创建port hub区域存放连接端口
function createPortHub(node) {
    const portsContainer = document.createElement('div');
    portsContainer.className = 'ports-container';

    // 左侧输入端口区域
    const inputColumn = document.createElement('div');
    inputColumn.className = 'port-column port-inputs';

    if (node.config.inputs && node.config.inputs.length > 0) {
        const title = document.createElement('div');
        title.className = 'port-column-title';
        title.textContent = '输入端口';
        inputColumn.appendChild(title);

        node.config.inputs.forEach((input, index) => {
            const portElement = createPortHubItem(node, 'input', index, input);
            inputColumn.appendChild(portElement);
        });
    }
    portsContainer.appendChild(inputColumn);

    // 右侧输出端口区域
    const outputColumn = document.createElement('div');
    outputColumn.className = 'port-column port-outputs';

    if (node.config.outputs && node.config.outputs.length > 0) {
        const title = document.createElement('div');
        title.className = 'port-column-title';
        title.textContent = '输出端口';
        outputColumn.appendChild(title);

        node.config.outputs.forEach((output, index) => {
            const portElement = createPortHubItem(node, 'output', index, output);
            outputColumn.appendChild(portElement);
        });
    }
    portsContainer.appendChild(outputColumn);

    return portsContainer;
}

// 创建单个端口项
function createPortHubItem(node, portType, portIndex, portData) {
    const portId = `${node.id}-${portType}-${portIndex}`;

    // 创建DOM元素
    const element = document.createElement('div');
    element.className = `port-hub-item port-${portType}`;
    element.dataset.portId = portId;

    // 根据端口类型创建内容
    switch (portType) {
        case 'input':
            const inputDot = document.createElement('div');
            inputDot.className = 'port-dot port-input-dot';
            element.appendChild(inputDot);

            const inputLabel = document.createElement('span');
            inputLabel.className = 'port-label';
            inputLabel.textContent = portData.label;
            element.appendChild(inputLabel);
            break;

        case 'output':
            const outputLabel = document.createElement('span');
            outputLabel.className = 'port-label';
            outputLabel.textContent = portData.label;
            element.appendChild(outputLabel);

            const outputDot = document.createElement('div');
            outputDot.className = 'port-dot port-output-dot';
            element.appendChild(outputDot);
            break;

        default:
            console.warn(`未知的端口类型: ${portType}`);
            // 默认情况下创建一个基础端口
            const defaultDot = document.createElement('div');
            defaultDot.className = 'port-dot';
            element.appendChild(defaultDot);

            const defaultLabel = document.createElement('span');
            defaultLabel.className = 'port-label';
            defaultLabel.textContent = portData.label || '未命名端口';
            element.appendChild(defaultLabel);
            break;
    }

    // 初始化端口拖拽
    if (portDragManager) {
        portDragManager.initPortDrag(element, node.id, portType, portIndex);
    }

    return element;
}

// 添加刷新节点函数
function refreshNodeElement(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.element) {
        // 保存当前位置
        const rect = node.element.getBoundingClientRect();
        node.x = rect.left - canvas.offsetLeft;
        node.y = rect.top - canvas.offsetTop;

        // 删除旧元素
        node.element.remove();

        // 创建新元素
        createNodeElement(node);

        updateStatus(`节点 ${nodeId} 已刷新`);
    }
}

// === 节点选中事件处理 ===
function setupNodeSelected(element) {
    element.addEventListener('mousedown', (e) => {
        if (shouldIgnoreDrag(e.target)) {
            return;
        }

        // 选中节点
        document.querySelectorAll('.node').forEach((n) => n.classList.remove('selected'));
        element.classList.add('selected');

        // 获取焦点，使节点可以接收键盘事件
        element.focus();
    });

    // 添加右键菜单事件
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 获取节点ID
        const nodeId = element.id;

        // 显示右键菜单
        showNodeContextMenu(nodeId, e.clientX, e.clientY);
    });
}

// === 右键菜单功能 ===

// 创建节点的右键菜单
function createNodeContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'node-context-menu';
    menu.innerHTML = `
        <div class="context-menu-item" data-action="delete">
            <span class="menu-icon">🗑️</span>
            <span class="menu-text">删除节点</span>
        </div>
    `;

    // 添加菜单项点击事件
    menu.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const menuItem = e.target.closest('.context-menu-item');
        if (menuItem) {
            const action = menuItem.dataset.action;
            const nodeId = menu.dataset.nodeId;

            if (action === 'delete' && nodeId) {
                // 先关闭菜单
                hideNodeContextMenu();

                // 延迟执行删除操作，确保菜单已关闭
                setTimeout(() => {
                    deleteNode(nodeId);
                }, 50);
            }
        } else {
            hideNodeContextMenu();
        }
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            hideNodeContextMenu();
        }
    });

    document.body.appendChild(menu);
    return menu;
}

// 显示节点的右键菜单
function showNodeContextMenu(nodeId, x, y) {
    let menu = document.querySelector('.node-context-menu');
    if (!menu) {
        menu = createNodeContextMenu();
    }

    menu.dataset.nodeId = nodeId;
    menu.style.display = 'block';

    // 确保菜单在视口内
    const menuWidth = menu.offsetWidth || 150;
    const menuHeight = menu.offsetHeight || 40;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    // 防止菜单超出右边界
    if (x + menuWidth > viewportWidth) {
        finalX = x - menuWidth;
    }

    // 防止菜单超出下边界
    if (y + menuHeight > viewportHeight) {
        finalY = y - menuHeight;
    }

    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;
}

// 隐藏节点的右键菜单
function hideNodeContextMenu() {
    const menu = document.querySelector('.node-context-menu');
    if (menu) {
        menu.style.display = 'none';
    }
}

// === 全局右键菜单 ===

// 创建全局右键菜单
function createGlobalContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'global-context-menu';
    menu.innerHTML = `
        <div class="context-menu-item" data-action="undo">
            <span class="menu-icon">↩️</span>
            <span class="menu-text">撤销操作</span>
        </div>
        <div class="context-menu-item" data-action="redo">
            <span class="menu-icon">↪️</span>
            <span class="menu-text">重做操作</span>
        </div>
    `;

    // 添加菜单项点击事件
    menu.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const menuItem = e.target.closest('.context-menu-item');
        if (menuItem) {
            const action = menuItem.dataset.action;

            if (action === 'undo') {
                // 先关闭菜单
                hideGlobalContextMenu();

                // 延迟执行撤销操作，确保菜单已关闭
                setTimeout(() => {
                    undoLastAction();
                }, 50);
            } else if (action === 'redo') {
                // 先关闭菜单
                hideGlobalContextMenu();

                // 延迟执行重做操作，确保菜单已关闭
                setTimeout(() => {
                    redoLastAction();
                }, 50);
            }
        } else {
            hideGlobalContextMenu();
        }
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            hideGlobalContextMenu();
        }
    });

    document.body.appendChild(menu);
    return menu;
}

// 显示全局右键菜单
function showGlobalContextMenu(x, y) {
    let menu = document.querySelector('.global-context-menu');
    if (!menu) {
        menu = createGlobalContextMenu();
    }

    menu.style.display = 'block';

    // 确保菜单在视口内
    const menuWidth = menu.offsetWidth || 150;
    const menuHeight = menu.offsetHeight || 40;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    // 防止菜单超出右边界
    if (x + menuWidth > viewportWidth) {
        finalX = x - menuWidth;
    }

    // 防止菜单超出下边界
    if (y + menuHeight > viewportHeight) {
        finalY = y - menuHeight;
    }

    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;
}

// 隐藏全局右键菜单
function hideGlobalContextMenu() {
    const menu = document.querySelector('.global-context-menu');
    if (menu) {
        menu.style.display = 'none';
    }
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
        //锁定时随意拖动
        if (!element.locked) {
            if (shouldIgnoreDrag(e.target)) {
                return;
            }
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

// 如果点击的是以下元素，则忽略拖拽
let ignoreDragItem = [
    '.node-title',// 节点标题
    '.port-hub-item',// 端口
    '.property-input',// 属性输入框
    '.node-action-btn', // 删除按钮
    'select',// 下拉框
    'input[type="range"]',// 滑块
    '.bool-option',// 二择单选开关
    'input[type="checkbox"]'// 复选框
];

// 检查是否应该忽略拖拽
function shouldIgnoreDrag(target) {
    return ignoreDragItem.some((item) => target.closest(item));
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

    // 获取焦点，使节点可以接收键盘事件
    node.element.focus();

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
            // 添加操作到历史记录
            if (actionManager) {
                actionManager.addActionToHistory({
                    type: 'moveNode',
                    nodeId: node.id,
                    oldX: dragState.initialX,
                    oldY: dragState.initialY,
                    newX: node.x,
                    newY: node.y
                });
            }

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
    node.connections.inputs.forEach((connectionId, index) => {
        if (connectionId) {
            // 处理连接ID数组
            if (Array.isArray(connectionId)) {
                connectionId.forEach(id => updateConnectionPosition(id));
            } else {
                updateConnectionPosition(connectionId);
            }
        }
    });

    // 更新输出连接线
    node.connections.outputs.forEach((connectionId, index) => {
        if (connectionId) {
            // 处理连接ID数组
            if (Array.isArray(connectionId)) {
                connectionId.forEach(id => updateConnectionPosition(id));
            } else {
                updateConnectionPosition(connectionId);
            }
        }
    });
}

// 更新单个连接线的位置
function updateConnectionPosition(connectionId) {
    const connection = connections.find(conn => conn.id === connectionId);
    if (!connection) return;

    const path = document.querySelector(`.connection-path[data-connection-id="${connectionId}"]`);
    if (!path) return;

    const fromNode = nodes.get(connection.from.nodeId);
    const toNode = nodes.get(connection.to.nodeId);

    if (!fromNode || !toNode) return;

    // 获取端口位置
    const fromPort = getPortPosition(fromNode, connection.from.portIndex, 'output');
    const toPort = getPortPosition(toNode, connection.to.portIndex, 'input');

    // 更新SVG路径
    if (portDragManager) {
        path.setAttribute('d', portDragManager.createCurvedPath(fromPort.x, fromPort.y, toPort.x, toPort.y));
    }
}

// 获取端口位置
function getPortPosition(node, portIndex, type) {
    const port = node.element.querySelector(`.port-hub-item[data-port-id="${node.id}-${type}-${portIndex}"] .port-dot`);
    if (!port) {
        // 如果找不到端口，返回节点中心位置
        return {
            x: node.x + node.element.offsetWidth / 2,
            y: node.y + node.element.offsetHeight / 2
        };
    }

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
    updateStatus(`删除节点中...`);
    const node = nodes.get(nodeId);
    if (!node) {
        console.error('未找到节点:', nodeId);
        updateStatus(`删除失败: 未找到节点 ${nodeId}`);
        return;
    }

    // 添加操作到历史记录
    if (actionManager) {
        actionManager.addActionToHistory({
            type: 'deleteNode',
            nodeId: nodeId,
            nodeData: {
                id: node.id,
                type: node.type,
                config: node.config,
                x: node.x,
                y: node.y,
                connections: JSON.parse(JSON.stringify(node.connections)),
                data: JSON.parse(JSON.stringify(node.data))
            }
        });

        // 移除所有连接
        if (actionManager) {
            actionManager.removeAllConnections(nodeId);
        }

        // 从DOM中移除节点
        if (node.element && node.element.parentNode) {
            node.element.parentNode.removeChild(node.element);
        }

        // 从nodes集合中移除
        nodes.delete(nodeId);

        updateStatus(`已删除节点: ${node.config.title} #${nodeId.split('-')[1]}`);
    }
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
    initWebview,
    undoLastAction: () => {
        if (actionManager) {
            actionManager.undoLastAction();
        }
    },
    redoLastAction: () => {
        if (actionManager) {
            actionManager.redoLastAction();
        }
    },
    get actionManager() {
        return actionManager;
    },
    getPortPosition,
    updateNodeConnections
};

window.actionManager = actionManager;

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWebview);
} else {
    initWebview();
}
