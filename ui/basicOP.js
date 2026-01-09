// 仅限Webview中使用，禁用检查
/* eslint-disable no-undef */
// @ts-nocheck

// /src/ui/basicOP.js

/**
 * 节点管理器类，用于管理画布上的节点
 * 该类负责处理节点的创建、删除、更新等操作
 * @class NodeManager
 */
class NodeManager {
    // 节点类型配置
    static nodeTypes = {
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
    // 如果点击的是以下元素，则忽略拖拽
    static ignoreDragItem = [
        '.node-title',// 节点标题
        '.port-hub-item',// 端口
        '.property-input',// 属性输入框
        '.node-action-btn', // 删除按钮
        'select',// 下拉框
        'input[type="range"]',// 滑块
        '.bool-option',// 二择单选开关
        'input[type="checkbox"]'// 复选框
    ];

    /**
     * 创建节点管理器实例
     * @param {HTMLCanvasElement} canvas - 画布元素，用于渲染节点
     * @param {Function} updateStatus - 状态更新函数，用于更新界面显示的状态信息
     */
    constructor(canvas, updateStatus) {
        this.idGenerator = new BitmapIdGenerator();

        // 构造函数中可以初始化节点的属性和管理器所需的状态
        this.canvas = canvas;
        this.updateStatus = updateStatus;

        // 节点列表
        this.nodes = new Map();

        // 连接列表
        this.connections = [];

        // 当前选中的节点
        this.selectedNode = null;

        // 当前选中的连接
        this.selectedConnection = null;

        // 拖拽相关变量
        this.dragState = {
            isDragging: false,
            nodeId: null,
            offsetX: 0,
            offsetY: 0,
            initialX: 0,
            initialY: 0,
            draggedNode: null
        };

    }

    getNode(id) {
        return this.nodes.get(id);
    }

    addNode(type, x, y) {
        let id = null;
        try {
            // 分配id
            id = this.idGenerator.generate();
            if (!id) {
                throw new Error('节点数量已达到最大值');
            }

            console.log('分配的ID:', id);
            console.log('节点类型:', type);
            console.log('节点位置:', x, y);
            console.log('节点配置:', nodeTypes[type]);

            // 创建节点实例
            let node = new Node(id, type, x, y, NodeManager.nodeTypes[type]);

            // 添加键盘事件监听删除快捷键
            node.element.addEventListener('keydown', (e) => {
                if (e.key === 'Delete') {
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteNode(node.id);
                }
            });

            // 为整个节点添加选中事件监听（端口和输入框除外）
            this.setupNodeSelected(node.element, node.id);

            // 为整个节点添加拖拽事件监听（端口和输入框除外）
            this.setupNodeDrag(node.element, node.id);

            canvas.appendChild(node.element);

            this.nodes.set(id, node);

            // 添加操作到历史记录

            this.updateStatus('成功添加' + node.type + '节点:#' + node.id);

        } catch (error) {
            console.error('添加节点失败:', error);
            if (id) {
                this.idGenerator.release(id);
            }
            this.updateStatus(`添加节点失败: ${error.message}`);
        }
    }
    setupNodeSelected(element, nodeId) {
        element.addEventListener('mousedown', (e) => {
            if (this.shouldIgnoreDrag(e.target)) {
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

            // 显示右键菜单
            this.showNodeContextMenu(nodeId, e.clientX, e.clientY);
        });
    }

    // === 右键菜单功能 ===

    // 创建节点的右键菜单
    createNodeContextMenu() {
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
                    this.hideNodeContextMenu();

                    // 延迟执行删除操作，确保菜单已关闭
                    setTimeout(() => {
                        this.deleteNode(parseInt(nodeId));
                    }, 50);
                }
            } else {
                this.hideNodeContextMenu();
            }
        });

        // 点击其他地方关闭菜单
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                this.hideNodeContextMenu();
            }
        });

        document.body.appendChild(menu);
        return menu;
    }

    // 显示节点的右键菜单
    showNodeContextMenu(nodeId, x, y) {
        let menu = document.querySelector('.node-context-menu');
        if (!menu) {
            menu = this.createNodeContextMenu();
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
    hideNodeContextMenu() {
        const menu = document.querySelector('.node-context-menu');
        if (menu) {
            menu.style.display = 'none';
        }
    }

    // === 拖拽功能实现 ===


    // 为节点设置拖拽功能
    setupNodeDrag(element, nodeId) {
        // 在节点上添加鼠标按下事件监听
        element.addEventListener('mousedown', (e) => {
            // 检查是否点击了不应该触发拖拽的元素
            //锁定时随意拖动
            if (!element.locked) {
                if (this.shouldIgnoreDrag(e.target)) {
                    return;
                }
            }

            this.startDrag(e, nodeId);
        });

        // 防止在节点内进行文本选择（拖拽时）
        element.addEventListener('selectstart', (e) => {
            if (this.dragState.isDragging) {
                e.preventDefault();
            }
        });

        console.log(element.listeners);
    }



    // 检查是否应该忽略拖拽
    shouldIgnoreDrag(target) {
        return NodeManager.ignoreDragItem.some((item) => target.closest(item));
    }

    // 开始拖拽
    startDrag(event, nodeId) {
        event.preventDefault();
        event.stopPropagation();

        const node = this.getNode(nodeId);
        if (!node) return;

        // 获取节点当前位置
        const rect = node.element.getBoundingClientRect();

        // 计算鼠标相对于节点的偏移
        this.dragState = {
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
        this.bringNodeToFront(nodeId);

        // 添加全局事件监听
        document.addEventListener('mousemove', (e) => this.handleDrag(e));
        document.addEventListener('mouseup', (e) => this.stopDrag(e));

        this.updateStatus(`拖动节点: ${node.config.title} #${nodeId}`);
    }

    // 处理拖拽
    handleDrag(event) {
        if (!this.dragState.isDragging || !this.dragState.draggedNode) return;

        event.preventDefault();

        const node = this.dragState.draggedNode;
        const canvasRect = this.canvas.getBoundingClientRect();

        // 计算新位置
        let newX = event.clientX - this.dragState.offsetX - canvasRect.left;
        let newY = event.clientY - this.dragState.offsetY - canvasRect.top;

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
        this.updateNodeConnections(node.id);
    }

    // 停止拖拽
    stopDrag(event) {
        if (!this.dragState.isDragging) return;

        const node = this.dragState.draggedNode;
        if (node) {
            node.element.classList.remove('dragging');

            // 检查位置是否有变化
            const moved = node.x !== this.dragState.initialX || node.y !== this.dragState.initialY;
            if (moved) {
                updateStatus(`移动节点到: (${Math.round(node.x)}, ${Math.round(node.y)})`);
            }
        }

        // 重置拖拽状态
        this.dragState = {
            isDragging: false,
            nodeId: null,
            offsetX: 0,
            offsetY: 0,
            initialX: 0,
            initialY: 0,
            draggedNode: null
        };

        // 移除事件监听
        document.removeEventListener('mousemove', this.handleDrag);
        document.removeEventListener('mouseup', this.stopDrag);
    }

    // 更新节点的所有连接线
    updateNodeConnections(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return;

        // 更新输入连接线
        node.connections.inputs.forEach((connectionId, index) => {
            if (connectionId) {
                // 处理连接ID数组
                if (Array.isArray(connectionId)) {
                    connectionId.forEach(id => this.updateConnectionPosition(id));
                } else {
                    this.updateConnectionPosition(connectionId);
                }
            }
        });

        // 更新输出连接线
        node.connections.outputs.forEach((connectionId, index) => {
            if (connectionId) {
                // 处理连接ID数组
                if (Array.isArray(connectionId)) {
                    connectionId.forEach(id => this.updateConnectionPosition(id));
                } else {
                    this.updateConnectionPosition(connectionId);
                }
            }
        });
    }

    // 更新单个连接线的位置
    updateConnectionPosition(connectionId) {
        const connection = this.connections.find(conn => conn.id === connectionId);
        if (!connection) return;

        const path = document.querySelector(`.connection-path[data-connection-id="${connectionId}"]`);
        if (!path) return;

        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

        if (!fromNode || !toNode) return;

        // 获取端口位置
        const fromPort = this.getPortPosition(fromNode, connection.from.portIndex, 'output');
        const toPort = this.getPortPosition(toNode, connection.to.portIndex, 'input');

        // 更新SVG路径
        if (portDragManager) {
            path.setAttribute('d', portDragManager.createCurvedPath(fromPort.x, fromPort.y, toPort.x, toPort.y));
        }
    }

    // 获取端口位置
    getPortPosition(node, portIndex, type) {
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
    bringNodeToFront(nodeId) {
        const node = this.getNode(nodeId);
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
    deleteNode(nodeId) {
        this.updateStatus(`删除节点中... `);
        const node = this.getNode(nodeId);
        if (!node) {
            console.error('未找到节点:', nodeId);
            this.updateStatus(`删除失败: 未找到节点 ${nodeId}`);
            return;
        }

        // 从DOM中移除节点
        if (node.element && node.element.parentNode) {
            node.element.parentNode.removeChild(node.element);
        }

        // 从nodes集合中移除
        this.nodes.delete(nodeId);
        this.idGenerator.release(nodeId);

        this.updateStatus(`已删除节点: ${node.config.title} #${nodeId}`);
    }
}




/**
 * BitmapIdGenerator 类 - 使用位图算法高效管理ID的生成和释放
 * 这种方式特别适合需要频繁分配和释放ID的场景，如对象池、资源管理等
 */
class BitmapIdGenerator {
    constructor(maxSize = 999999) {
        this.maxSize = maxSize;
        this.bitmap = new Uint32Array(Math.ceil(maxSize / 32)); // 使用位图存储使用状态
        this.nextId = 1;
    }

    // 设置位
    _setBit(index) {
        const wordIndex = Math.floor(index / 32);
        const bitIndex = index % 32;
        this.bitmap[wordIndex] |= (1 << bitIndex);
    }

    // 清除位
    _clearBit(index) {
        const wordIndex = Math.floor(index / 32);
        const bitIndex = index % 32;
        this.bitmap[wordIndex] &= ~(1 << bitIndex);
    }

    // 检查位
    _checkBit(index) {
        const wordIndex = Math.floor(index / 32);
        const bitIndex = index % 32;
        return (this.bitmap[wordIndex] & (1 << bitIndex)) !== 0;
    }

    // 生成ID（更高效的算法）
    generate() {
        // 尝试从nextId开始查找
        for (let i = this.nextId; i <= this.maxSize; i++) {
            if (!this._checkBit(i - 1)) { // 位图索引从0开始
                this._setBit(i - 1);
                this.nextId = i + 1;
                return i;
            }
        }

        // 如果从nextId开始没找到，从头开始查找
        for (let i = 1; i < this.nextId; i++) {
            if (!this._checkBit(i - 1)) {
                this._setBit(i - 1);
                return i;
            }
        }

        return null; // 没有可用ID
    }

    // 释放ID
    release(id) {
        if (id < 1 || id > this.maxSize) {
            throw new Error(`ID ${id} 超出范围 (1-${this.maxSize})`);
        }

        if (this._checkBit(id - 1)) {
            this._clearBit(id - 1);
            // 如果释放的ID比nextId小，更新nextId
            if (id < this.nextId) {
                this.nextId = id;
            }
            return true;
        }

        return false;
    }

    occupy(id) {
        if (id < 1 || id > this.maxSize) {
            throw new Error(`ID ${id} 超出范围 (1-${this.maxSize})`);
        }

        // 如果占领的ID已经存在
        if (this._checkBit(id - 1)) {
            return false;
        }

        this._setBit(id - 1);

        return true;

    }

    // 获取空闲ID数量
    getAvailableCount() {
        let count = 0;
        for (let i = 0; i < this.maxSize; i++) {
            if (!this._checkBit(i)) count++;
        }
        return count;
    }

    setBitmap(bitmap) {
        //  类型检查
        if (!(bitmap instanceof Uint32Array)) {
            throw new TypeError('bitmap must be an instance of Uint32Array');
        }

        //  长度检查
        if (bitmap.length * 32 < this.maxSize) {
            throw new RangeError(`bitmap length must be at least ${Math.ceil(this.maxSize / 32)}`);
        }

        this.bitmap = bitmap;
    }

    getBitmap() {
        return this.bitmap;
    }
}

/**
 * 节点类(Node)
 * 用于表示图形界面中的基本元素节点
 * 包含节点的基本属性如位置、尺寸、端口等信息
 */
class Node {
    constructor(id, type, x, y, config) {
        this.id = id;
        this.type = type;
        this.config = config;
        this.x = x;
        this.y = y;
        this.ports = [];
        this.data = {};
        this.connections = [];

        this.element = this._createNodeElement();

        // 隐藏占位符
        const placeholder = document.getElementById('placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

    }

    // 创建节点DOM元素
    _createNodeElement() {
        const element = document.createElement('div');
        element.className = 'node';
        element.id = this.id;
        element.dataset.nodeType = this.type;
        element.style.left = this.x + 'px';
        element.style.top = this.y + 'px';
        element.style.borderColor = this.config.color;
        element.locked = false;

        // header设置，包括图标，标题，id
        element.innerHTML = '';
        element.innerHTML += `
        <div class="node-header">
            <div class="node-icon" style="color: ${this.config.color}">${this.config.icon}</div>
            <div class="node-title">
                <input type="text" 
                       class="node-title-input" 
                       value="${this.config.title}" 
                       placeholder="节点标题"
                       onchange="updateNodeTitle('${this.id}', this.value)"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
                <span class="node-id">#${this.id}</span>
            </div>
        </div>
    `;

        // 内容设置
        element.innerHTML += `
        <div class="node-content">
            <div class="node-info">${this.config.content}  </div>
    `;

        // 属性设置
        let propertiesHTML = '';
        if (this.config.properties) {
            propertiesHTML = this._createPropertiesHTML();
        }

        element.innerHTML += `
            ${propertiesHTML ? `<div class="node-properties">${propertiesHTML}</div>` : ''} 
    `;

        element.innerHTML += `
        </div>
    `;

        // 初始化节点数据
        if (this.config.properties) {
            this.config.properties.forEach((prop, index) => {
                this.data[prop.label] = prop.default;
            });
        }

        // port-hub设置
        const portHub = document.createElement('div');
        portHub.className = 'node-port-hub';
        const portsContainer = this._createPortHub();
        portHub.appendChild(portsContainer);
        element.appendChild(portHub);



        // 聚焦节点使其可接收键盘事件
        element.tabIndex = 0;

        return element;
    }

    _createPropertiesHTML() {
        let propertiesHTML = '';
        this.config.properties.forEach((prop, index) => {
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
                               onchange="updateNodeProperty('${this.id}', ${index}, this.value)">
                    `;
                    break;
                case 'select':
                    const options = prop.options.map((opt, i) =>
                        `<option value="${i}" ${i === prop.default ? 'selected' : ''}>${opt}</option>`
                    ).join('');
                    inputHTML = `
                        <select class="property-input" 
                                onchange="updateNodeProperty('${this.id}', ${index}, this.value)">
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
                                onchange="updateNodeProperty('${this.id}', ${index}, this.checked)">
                    </div>
                `;
                    break;
                case 'bool':  // 布尔类型使用单选按钮组
                    const boolId = `bool-${this.id}-${index}`;
                    const trueLabel = prop.labels?.true || '是';
                    const falseLabel = prop.labels?.false || '否';
                    inputHTML = `
                    <div class="bool-radio-group" data-id="${boolId}">
                        <label class="bool-option">
                            <input type="radio" 
                                   name="${boolId}" 
                                   value="true"
                                   ${prop.default === true ? 'checked' : ''}
                                   onchange="updateNodeProperty('${this.id}', ${index}, true)">
                            <span class="bool-radio-label">${trueLabel}</span>
                        </label>
                        <label class="bool-option">
                            <input type="radio" 
                                   name="${boolId}" 
                                   value="false"
                                   ${prop.default === false ? 'checked' : ''}
                                   onchange="updateNodeProperty('${this.id}', ${index}, false)">
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
                               onchange="updateNodeProperty('${this.id}', ${index}, this.value)"
                               onblur="updateNodeProperty('${this.id}', ${index}, this.value)">
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
                               onchange="updateNodeProperty('${this.id}', ${index}, parseInt(this.value) || 0)"
                               onblur="updateNodeProperty('${this.id}', ${index}, parseInt(this.value) || 0)">
                `;
                    break;
                default:
                    inputHTML = `
                        <input type="${prop.type}" 
                               class="property-input"
                               value="${prop.default || ''}"
                               onchange="updateNodeProperty('${this.id}', ${index}, this.value)">
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
    _createPortHub() {
        const portsContainer = document.createElement('div');
        portsContainer.className = 'ports-container';

        // 左侧输入端口区域
        const inputColumn = document.createElement('div');
        inputColumn.className = 'port-column port-inputs';

        if (this.config.inputs && this.config.inputs.length > 0) {
            const title = document.createElement('div');
            title.className = 'port-column-title';
            title.textContent = '输入端口';
            inputColumn.appendChild(title);

            this.config.inputs.forEach((input, index) => {
                const portElement = this._createPortHubItem('input', index, input);
                inputColumn.appendChild(portElement);
            });
        }
        portsContainer.appendChild(inputColumn);

        // 右侧输出端口区域
        const outputColumn = document.createElement('div');
        outputColumn.className = 'port-column port-outputs';

        if (this.config.outputs && this.config.outputs.length > 0) {
            const title = document.createElement('div');
            title.className = 'port-column-title';
            title.textContent = '输出端口';
            outputColumn.appendChild(title);

            this.config.outputs.forEach((output, index) => {
                const portElement = this._createPortHubItem('output', index, output);
                outputColumn.appendChild(portElement);
            });
        }
        portsContainer.appendChild(outputColumn);

        return portsContainer;
    }

    // 创建单个端口项
    _createPortHubItem(portType, portIndex, portData) {
        const portId = `${this.id}-${portType}-${portIndex}`;

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
            portDragManager.initPortDrag(element, this.id, portType, portIndex);
        }

        return element;
    }

    lockElement() {
        this.element.locked = true;
    }

    unlockElement() {
        this.element.locked = false;
    }

}

class BasicActionManager {
    constructor(nodes, connections, canvas, updateStatus) {
        this.nodes = nodes;
        this.connections = connections;
        this.canvas = canvas;
        this.updateStatus = updateStatus;

        // 操作历史记录
        this.actionHistory = [];
        this.MAX_HISTORY_SIZE = 50; // 最大历史记录数量
        this.historyIndex = -1; // 当前历史记录位置

        // 监听器
        this.listeners = {
            onActionAdded: [],
            onActionUndone: [],
            onActionRedone: []
        };

    }

    // 添加操作到历史记录
    addActionToHistory(action) {
        // 如果当前位置不在历史记录末尾，删除当前位置之后的所有记录
        if (this.historyIndex < this.actionHistory.length - 1) {
            this.actionHistory.splice(this.historyIndex + 1);
        }

        // 添加新操作
        this.actionHistory.push(action);
        this.historyIndex++;

        // 限制历史记录大小
        if (this.actionHistory.length > this.MAX_HISTORY_SIZE) {
            this.actionHistory.shift();
            this.historyIndex--;
        }

        // 通知监听器
        this.notifyListeners('onActionAdded', action);

        console.log('添加操作到历史记录:', action);
        console.log('当前历史记录:', this.actionHistory);
        console.log('历史记录位置:', this.historyIndex);
    }

    // 撤销上一次操作
    undoLastAction() {
        this.updateStatus('正在撤销操作...');
        if (this.historyIndex < 0) {
            this.updateStatus('没有可撤销的操作');
            return false;
        }

        const action = this.actionHistory[this.historyIndex];
        console.log('撤销操作:', action);

        let success = false;

        switch (action.type) {
            case 'addNode':
                success = this.undoAddNode(action);
                break;
            case 'deleteNode':
                success = this.undoDeleteNode(action);
                break;
            case 'addConnection':
                success = this.undoAddConnection(action);
                break;
            case 'deleteConnection':
                success = this.undoDeleteConnection(action);
                break;
            case 'moveNode':
                success = this.undoMoveNode(action);
                break;
            case 'updateNodeProperty':
                success = this.undoUpdateNodeProperty(action);
                break;
            default:
                console.warn('未知的操作类型:', action.type);
                return false;
        }

        if (success) {
            this.historyIndex--;
            this.notifyListeners('onActionUndone', action);
            this.updateStatus('已撤销操作');
            return true;
        }

        return false;
    }

    // 重做上一次撤销的操作
    redoLastAction() {
        if (this.historyIndex >= this.actionHistory.length - 1) {
            this.updateStatus('没有可重做的操作');
            return false;
        }

        this.historyIndex++;
        const action = this.actionHistory[this.historyIndex];
        console.log('重做操作:', action);

        let success = false;

        switch (action.type) {
            case 'addNode':
                success = this.redoAddNode(action);
                break;
            case 'deleteNode':
                success = this.redoDeleteNode(action);
                break;
            case 'addConnection':
                success = this.redoAddConnection(action);
                break;
            case 'deleteConnection':
                success = this.redoDeleteConnection(action);
                break;
            case 'moveNode':
                success = this.redoMoveNode(action);
                break;
            case 'updateNodeProperty':
                success = this.redoUpdateNodeProperty(action);
                break;
            default:
                console.warn('未知的操作类型:', action.type);
                return false;
        }

        if (success) {
            this.notifyListeners('onActionRedone', action);
            this.updateStatus('已重做操作');
            return true;
        }

        return false;
    }

    // 撤销添加节点
    undoAddNode(action) {
        const nodeId = action.nodeId;
        const node = this.nodes.get(nodeId);

        if (node) {
            // 移除所有连接
            this.removeAllConnections(nodeId);

            // 从DOM中移除节点
            if (node.element && node.element.parentNode) {
                node.element.parentNode.removeChild(node.element);
            }

            // 从nodes集合中移除
            this.nodes.delete(nodeId);

            this.updateStatus(`已撤销添加节点: ${node.config.title}`);
            return true;
        }

        return false;
    }

    // 重做添加节点
    redoAddNode(action) {
        const { nodeData } = action;

        // 重新创建节点
        const node = {
            id: nodeData.id,
            type: nodeData.type,
            config: nodeData.config,
            x: nodeData.x,
            y: nodeData.y,
            connections: JSON.parse(JSON.stringify(nodeData.connections)),
            data: JSON.parse(JSON.stringify(nodeData.data))
        };

        this.nodes.set(node.id, node);

        // 创建节点DOM元素
        if (window.vscodeAPI && window.vscodeAPI.createNodeElement) {
            window.vscodeAPI.createNodeElement(node);
        }

        this.updateStatus(`已重做添加节点: ${node.config.title}`);
        return true;
    }

    // 撤销删除节点
    undoDeleteNode(action) {
        const { nodeId, nodeData } = action;

        // 重新创建节点
        const node = {
            id: nodeId,
            type: nodeData.type,
            config: nodeData.config,
            x: nodeData.x,
            y: nodeData.y,
            connections: JSON.parse(JSON.stringify(nodeData.connections)),
            data: JSON.parse(JSON.stringify(nodeData.data))
        };

        this.nodes.set(nodeId, node);

        // 创建节点DOM元素
        if (window.vscodeAPI && window.vscodeAPI.createNodeElement) {
            window.vscodeAPI.createNodeElement(node);
        }

        this.updateStatus(`已撤销删除节点: ${node.config.title}`);
        return true;
    }

    // 重做删除节点
    redoDeleteNode(action) {
        const nodeId = action.nodeId;
        const node = this.nodes.get(nodeId);

        if (node) {
            // 移除所有连接
            this.removeAllConnections(nodeId);

            // 从DOM中移除节点
            if (node.element && node.element.parentNode) {
                node.element.parentNode.removeChild(node.element);
            }

            // 从nodes集合中移除
            this.nodes.delete(nodeId);

            this.updateStatus(`已重做删除节点: ${node.config.title}`);
            return true;
        }

        return false;
    }

    // 撤销添加连接
    undoAddConnection(action) {
        const { connectionId } = action;
        this.removeConnection(connectionId);
        this.updateStatus('已撤销添加连接');
        return true;
    }

    // 重做添加连接
    redoAddConnection(action) {
        const { connection } = action;

        // 重新创建连接
        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

        if (fromNode && toNode) {
            // 添加到connections数组
            this.connections.push(connection);

            // 更新节点连接状态
            if (fromNode.connections.outputs[connection.from.portIndex]) {
                if (!Array.isArray(fromNode.connections.outputs[connection.from.portIndex])) {
                    fromNode.connections.outputs[connection.from.portIndex] = [];
                }
                fromNode.connections.outputs[connection.from.portIndex].push(connection.id);
            }

            if (toNode.connections.inputs[connection.to.portIndex]) {
                if (!Array.isArray(toNode.connections.inputs[connection.to.portIndex])) {
                    toNode.connections.inputs[connection.to.portIndex] = [];
                }
                toNode.connections.inputs[connection.to.portIndex].push(connection.id);
            }

            // 创建连接线
            if (window.vscodeAPI && window.vscodeAPI.portDragManager) {
                const fromPort = window.vscodeAPI.getPortPosition(fromNode, connection.from.portIndex, 'output');
                const toPort = window.vscodeAPI.getPortPosition(toNode, connection.to.portIndex, 'input');

                const svg = this.canvas.querySelector('#connections-svg') || window.vscodeAPI.portDragManager.createConnectionsSvg();
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.classList.add('connection-path', 'permanent-connection');
                path.setAttribute('data-connection-id', connection.id);
                path.setAttribute('d', window.vscodeAPI.portDragManager.createCurvedPath(fromPort.x, fromPort.y, toPort.x, toPort.y));

                svg.appendChild(path);
                connection.line = path;
            }

            this.updateStatus('已重做添加连接');
            return true;
        }

        return false;
    }

    // 撤销删除连接
    undoDeleteConnection(action) {
        const { connection } = action;

        // 重新创建连接
        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

        if (fromNode && toNode) {
            // 添加到connections数组
            this.connections.push(connection);

            // 更新节点连接状态
            if (fromNode.connections.outputs[connection.from.portIndex]) {
                if (!Array.isArray(fromNode.connections.outputs[connection.from.portIndex])) {
                    fromNode.connections.outputs[connection.from.portIndex] = [];
                }
                fromNode.connections.outputs[connection.from.portIndex].push(connection.id);
            }

            if (toNode.connections.inputs[connection.to.portIndex]) {
                if (!Array.isArray(toNode.connections.inputs[connection.to.portIndex])) {
                    toNode.connections.inputs[connection.to.portIndex] = [];
                }
                toNode.connections.inputs[connection.to.portIndex].push(connection.id);
            }

            // 创建连接线
            if (window.vscodeAPI && window.vscodeAPI.portDragManager) {
                const fromPort = window.vscodeAPI.getPortPosition(fromNode, connection.from.portIndex, 'output');
                const toPort = window.vscodeAPI.getPortPosition(toNode, connection.to.portIndex, 'input');

                const svg = this.canvas.querySelector('#connections-svg') || window.vscodeAPI.portDragManager.createConnectionsSvg();
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.classList.add('connection-path', 'permanent-connection');
                path.setAttribute('data-connection-id', connection.id);
                path.setAttribute('d', window.vscodeAPI.portDragManager.createCurvedPath(fromPort.x, fromPort.y, toPort.x, toPort.y));

                svg.appendChild(path);
                connection.line = path;
            }

            this.updateStatus('已撤销删除连接');
            return true;
        }

        return false;
    }

    // 重做删除连接
    redoDeleteConnection(action) {
        const { connectionId } = action;
        this.removeConnection(connectionId);
        this.updateStatus('已重做删除连接');
        return true;
    }

    // 撤销移动节点
    undoMoveNode(action) {
        const { nodeId, oldX, oldY } = action;
        const node = this.nodes.get(nodeId);

        if (node) {
            node.x = oldX;
            node.y = oldY;
            node.element.style.left = oldX + 'px';
            node.element.style.top = oldY + 'px';

            // 更新连接线位置
            if (window.vscodeAPI && window.vscodeAPI.updateNodeConnections) {
                window.vscodeAPI.updateNodeConnections(nodeId);
            }

            this.updateStatus(`已撤销移动节点: ${node.config.title}`);
            return true;
        }

        return false;
    }

    // 重做移动节点
    redoMoveNode(action) {
        const { nodeId, newX, newY } = action;
        const node = this.nodes.get(nodeId);

        if (node) {
            node.x = newX;
            node.y = newY;
            node.element.style.left = newX + 'px';
            node.element.style.top = newY + 'px';

            // 更新连接线位置
            if (window.vscodeAPI && window.vscodeAPI.updateNodeConnections) {
                window.vscodeAPI.updateNodeConnections(nodeId);
            }

            this.updateStatus(`已重做移动节点: ${node.config.title}`);
            return true;
        }

        return false;
    }

    // 撤销更新节点属性
    undoUpdateNodeProperty(action) {
        const { nodeId, propertyIndex, oldValue } = action;
        const node = this.nodes.get(nodeId);

        if (node && node.config.properties && node.config.properties[propertyIndex]) {
            const prop = node.config.properties[propertyIndex];
            node.data[prop.label] = oldValue;

            // 更新UI
            if (window.vscodeAPI && window.vscodeAPI.updateNodePropertyUI) {
                window.vscodeAPI.updateNodePropertyUI(nodeId, propertyIndex, oldValue);
            }

            this.updateStatus(`已撤销更新节点属性: ${prop.label}`);
            return true;
        }

        return false;
    }

    // 重做更新节点属性
    redoUpdateNodeProperty(action) {
        const { nodeId, propertyIndex, newValue } = action;
        const node = this.nodes.get(nodeId);

        if (node && node.config.properties && node.config.properties[propertyIndex]) {
            const prop = node.config.properties[propertyIndex];
            node.data[prop.label] = newValue;

            // 更新UI
            if (window.vscodeAPI && window.vscodeAPI.updateNodePropertyUI) {
                window.vscodeAPI.updateNodePropertyUI(nodeId, propertyIndex, newValue);
            }

            this.updateStatus(`已重做更新节点属性: ${prop.label}`);
            return true;
        }

        return false;
    }

    // 移除节点所有连接
    removeAllConnections(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        // 收集所有需要删除的连接ID
        const connectionIdsToRemove = new Set();

        // 遍历所有连接，找到与该节点相关的连接
        this.connections.forEach(connection => {
            if (connection.from.nodeId === nodeId || connection.to.nodeId === nodeId) {
                connectionIdsToRemove.add(connection.id);
            }
        });

        // 删除所有相关连接
        connectionIdsToRemove.forEach(connectionId => {
            this.removeConnection(connectionId);
        });

        // 清空节点的连接数据
        if (node.connections) {
            if (node.connections.inputs) {
                node.connections.inputs = Array(node.connections.inputs.length).fill(null);
            }
            if (node.connections.outputs) {
                node.connections.outputs = Array(node.connections.outputs.length).fill(null);
            }
        }
    }

    // 移除单个连接
    removeConnection(connectionId) {
        const connectionIndex = this.connections.findIndex(conn => conn.id === connectionId);
        if (connectionIndex === -1) return;

        const connection = this.connections[connectionIndex];

        // 从节点连接中移除
        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

        if (fromNode) {
            const outputConnections = fromNode.connections.outputs[connection.from.portIndex];
            if (outputConnections) {
                if (Array.isArray(outputConnections)) {
                    const index = outputConnections.indexOf(connectionId);
                    if (index > -1) {
                        outputConnections.splice(index, 1);
                    }
                } else if (outputConnections === connectionId) {
                    fromNode.connections.outputs[connection.from.portIndex] = null;
                }
            }
        }

        if (toNode) {
            const inputConnections = toNode.connections.inputs[connection.to.portIndex];
            if (inputConnections) {
                if (Array.isArray(inputConnections)) {
                    const index = inputConnections.indexOf(connectionId);
                    if (index > -1) {
                        inputConnections.splice(index, 1);
                    }
                } else if (inputConnections === connectionId) {
                    toNode.connections.inputs[connection.to.portIndex] = null;
                }
            }
        }

        // 移除连接线
        const path = document.querySelector(`.connection-path[data-connection-id="${connectionId}"]`);
        if (path && path.parentNode) {
            path.parentNode.removeChild(path);
        }

        // 从数组中移除
        this.connections.splice(connectionIndex, 1);
    }

    // 添加监听器
    addListener(eventType, callback) {
        if (this.listeners[eventType]) {
            this.listeners[eventType].push(callback);
        }
    }

    // 移除监听器
    removeListener(eventType, callback) {
        if (this.listeners[eventType]) {
            const index = this.listeners[eventType].indexOf(callback);
            if (index > -1) {
                this.listeners[eventType].splice(index, 1);
            }
        }
    }

    // 通知监听器
    notifyListeners(eventType, data) {
        if (this.listeners[eventType]) {
            this.listeners[eventType].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`监听器执行错误 (${eventType}):`, error);
                }
            });
        }
    }

    // 清空历史记录
    clearHistory() {
        this.actionHistory = [];
        this.historyIndex = -1;
        this.updateStatus('已清空操作历史');
    }

    // 获取当前历史记录
    getHistory() {
        return {
            actions: [...this.actionHistory],
            currentIndex: this.historyIndex
        };
    }
}

// 直接导出为全局对象，供webview使用
window.BasicActionManager = BasicActionManager;
window.NodeManager = NodeManager;
