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

    // 如果点击的是以下元素，则忽略拖拽
    static ignoreDragItem = [
        // === 数据输入控件 ===
        'input',                    // 所有输入框（包括文本、数字、范围等）
        'select',                   // 下拉框
        'textarea',                 // 文本域
        '.property-input',          // 属性输入框（包含各种类型）

        // === 连接端口 ===
        '.port-dot',                // 端口圆点（用于连接线）
        '.port-hub-item',           // 端口项整体
        '.port-connector',          // 属性端口连接器
        '.property-port-dot',       // 属性端口圆点
        '.inner-port',              // 内部端口（port-hub内部）

        // === 按钮和可点击元素 ===
        'button',                   // 所有按钮
        '.browse-btn',              // 浏览按钮
        '.node-action-btn',         // 节点操作按钮（如删除）
        '.bool-option',             // 布尔选项（可点击的标签区域）

        // === 表格交互元素 ===
        '.table-cell input',        // 表格中的输入框
        '.table-cell select',       // 表格中的下拉框
        '.table-cell textarea',     // 表格中的文本域
        '.table-cell button',       // 表格中的按钮

        // === 复选框和单选按钮 ===
        'input[type="checkbox"]',
        'input[type="radio"]',

        // === 特定输入类型（确保覆盖） ===
        'input[type="text"]',
        'input[type="number"]',
        'input[type="range"]',
        'input[type="email"]',
        'input[type="password"]',
        'input[type="search"]',
        'input[type="tel"]',
        'input[type="url"]',
        'input[type="date"]',
        'input[type="time"]',
        'input[type="datetime-local"]',
        'input[type="month"]',
        'input[type="week"]',
        'input[type="color"]',
        'input[type="file"]'
    ];

    /**
     * 创建节点管理器实例
     * @param {HTMLCanvasElement} canvas - 画布元素，用于渲染节点
     * @param {Function} updateStatus - 状态更新函数，用于更新界面显示的状态信息
     */
    constructor(canvas, updateStatus) {
        this.idGenerator = new BitmapIdGenerator();
        this.id = 'node-manager-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

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

        // 连接线相关变量
        this.connectionState = {
            isDragging: false,
            startInfo: {
                nodeId: null,
                portIndex: null,
                portType: null,
            },
            tempLine: null,
            currentPortElement: null,
            highlightedPorts: new Set(),
        }

        // 添加高亮状态缓存
        this.highlightCache = {
            highlightedNodes: new Set(),
            dimmedConnections: new Set()
        };

        this.basicActionManager = new BasicActionManager(this.nodes, this.connections, this.canvas, this.updateStatus);

        this.handleEvent();
    }

    getNode(uid) {
        // 类型检查
        if (typeof uid !== 'string' && typeof uid !== 'number') {
            throw new Error('节点UID格式不对', typeof uid);
        }
        if (typeof uid === 'string') {
            uid = parseInt(uid, 10);
        }

        // 检查节点是否存在
        if (!this.nodes.has(uid)) {
            throw new Error('节点不存在');
        }

        return this.nodes.get(uid);
    }

    addNode(type, x, y) {
        let uid = null;
        try {
            // 分配id
            uid = this.idGenerator.generate();
            if (!uid) {
                throw new Error('节点数量已达到最大值');
            }

            // 创建节点实例
            let node = new Node(uid, type, x, y, window.nodeTypes[type]);

            // 添加键盘事件监听删除快捷键
            node.element.addEventListener('keydown', (e) => {
                if (e.key === 'Delete') {
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteNode(node.uid);
                }
            });

            // 为整个节点添加选中事件监听（端口和输入框除外）
            // this.setupNodeSelected(node.element, node.uid);

            // 为整个节点添加拖拽事件监听（端口和输入框除外）
            // this.setupNodeDrag(node.element, node.uid);

            // this.setupNodePortDrag(node.ports, node.uid);

            this.canvas.appendChild(node.element);
            this.nodes.set(uid, node);

            // this.basicActionManager.addActionToHistory('addNode');

            this.updateStatus('成功添加' + node.type + '节点:#' + node.uid);
            this.bringNodeToFront(uid);
        } catch (error) {
            console.error('添加节点失败:', error);
            if (uid) {
                this.idGenerator.release(uid);
            }
            this.updateStatus(`添加节点失败: ${error.message}`);
        }
    }

    // 检查是否应该忽略拖拽
    shouldIgnoreDrag(target) {
        return BasicActionManager.ignoreDragItem.some((item) => target.closest(item));
    }

    // 处理事件
    handleEvent() {
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e)); // 添加点击事件监听器
        this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e)); // 添加contextmenu事件监听
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e)); // 添加鼠标按下事件监听器
        // this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));  // 添加鼠标移动事件监听器
        // this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));    // 添加鼠标松开事件监听器
    }

    // 处理画布点击事件
    handleCanvasClick(e) {

        if (this.shouldIgnoreClick(e.target)) {
            return; // 如果是可交互元素，直接返回，不处理节点选中
        }

        const nodeElement = e.target.closest('.node');

        // 如果在节点上点击
        if (nodeElement) {
            // 如果不是多选（ctrl未按下）
            if (!e.ctrlKey) {
                document.querySelectorAll('.node').forEach((n) => n.classList.remove('selected'));
            }

            // 选中节点
            nodeElement.classList.add('selected');
            this.bringNodeToFront(nodeElement.uid);

            // 更新连接线样式
            this.updateSelectedNodesConnections();

            // 获取焦点，使节点可以接收键盘事件
            nodeElement.focus();
        } else {
            // 如果点击的是画布空白处，取消选中所有节点
            document.querySelectorAll('.node').forEach((n) => n.classList.remove('selected'));
            // 取消焦点，使节点无法接收键盘事件
            document.querySelectorAll('.node').forEach((n) => n.blur());

            // 清除所有连接线高亮
            this.clearConnectionHighlights();
        }
        return;

    }

    // === 右键菜单功能 ===

    // 处理右键菜单事件
    handleContextMenu(e) {
        const nodeElement = e.target.closest('.node');
        if (nodeElement) {
            e.preventDefault(); // 阻止默认右键菜单
            const nodeId = parseInt(nodeElement.uid);
            this.showNodeContextMenu(nodeId, e.clientX, e.clientY);
        } else {
            // 如果点击的是画布空白处，隐藏右键菜单
            this.hideNodeContextMenu();
        }
    }

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

                    // 删除操作
                    this.deleteNode(nodeId);
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

    // 处理鼠标按下事件
    handleCanvasMouseDown(e) {
        const portDotElement = e.target.closest('.port-dot');
        const portElement = e.target.closest('.port-hub-item');
        const nodeElement = e.target.closest('.node');

        if (e.button === 2) { // 右键点击
            if (portElement) {
                return;
            }
            this.handleContextMenu(e);
            return;
        }

        if (portDotElement) {
            if (portElement) {
                this.startPortDrag(e, portElement, nodeElement.uid, portElement.portType, portElement.portIndex);
            } else {
                throw new Error('端口未正确初始化：portElement为空');
            }
        }
        if (nodeElement) {
            const nodeId = parseInt(nodeElement.uid);
            if (!nodeElement.locked) {
                if (this.shouldIgnoreDrag(e.target)) {
                    return;
                }
            }

            this.startDrag(e, nodeId);
            return;
        }
        else {
            // 如果点击的是画布空白处，取消选中所有节点
            document.querySelectorAll('.node').forEach((n) => n.classList.remove('selected'));
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
        this.updateNodeConnections(node.uid);

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

    // 更新单个连接线的位置
    updateConnectionPosition(connectionId) {
        const connection = this.connections.find(conn => conn.uid === connectionId);
        if (!connection) return;

        const path = document.querySelector(`.connection-path[data-connection-uid="${connectionId}"]`);
        if (!path) return;

        const fromNode = this.getNode(connection.from.nodeId);
        const toNode = this.getNode(connection.to.nodeId);

        if (!fromNode || !toNode) return;

        // 获取端口位置
        const fromPos = this.getPortDotPosition(connection.from.nodeId, connection.from.portIndex, 'output');
        const toPos = this.getPortDotPosition(connection.to.nodeId, connection.to.portIndex, 'input');

        // 更新路径
        const newPath = this.createCurvedPath(fromPos.x, fromPos.y, toPos.x, toPos.y);
        path.setAttribute('d', newPath);

        // 更新连接对象的line引用
        connection.line = path;
    }

    // 更新节点的所有连接线
    updateNodeConnections(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return;

        // 收集所有需要更新的连接线
        const connectionsToUpdate = new Set();

        // 更新输入连接线
        node.connections.inputs.forEach((connectionIds, index) => {
            if (connectionIds && connectionIds.length > 0) {
                connectionIds.forEach(connectionId => {
                    if (connectionId) {
                        connectionsToUpdate.add(connectionId);
                    }
                });
            }
        });

        // 更新输出连接线
        node.connections.outputs.forEach((connectionIds, index) => {
            if (connectionIds && connectionIds.length > 0) {
                connectionIds.forEach(connectionId => {
                    if (connectionId) {
                        connectionsToUpdate.add(connectionId);
                    }
                });
            }
        });

        // 更新所有相关连接线
        connectionsToUpdate.forEach(connectionId => {
            this.updateConnectionPosition(connectionId);
        });
    }

    // 获取端口圆点位置
    getPortDotPosition(nodeId, portIndex, type) {
        const node = this.getNode(nodeId)
        if (!node) {
            console.error(`找不到节点 ${nodeId}`);
        }

        const port = node.getPort(portIndex, type);
        if (!port) {
            // 如果找不到端口，返回节点中心位置
            console.warn(`找不到节点 ${nodeId} 的端口 ${portIndex} (${type})`);
            return {
                x: node.x + node.element.offsetWidth / 2,
                y: node.y + node.element.offsetHeight / 2
            }
        }

        const portDot = port.querySelector('.port-dot');
        if (!portDot) {
            console.warn(`找不到节点 ${nodeId} 的端口 ${portIndex} 的圆点`);
            return this.getPortPosition(nodeId, portIndex, type);
        }

        const portDotRect = portDot.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        return {
            x: portDotRect.left + portDotRect.width / 2 - canvasRect.left,
            y: portDotRect.top + portDotRect.height / 2 - canvasRect.top
        };
    }

    // 获取端口中心位置
    getPortPosition(nodeId, portIndex, type) {
        const node = this.getNode(nodeId)
        if (!node) {
            console.error(`找不到节点 ${nodeId}`);
        }

        const port = node.getPort(portIndex, type);
        if (!port) {
            // 如果找不到端口，返回节点中心位置
            console.warn(`找不到节点 ${nodeId} 的端口 ${portIndex} (${type})`);
            return {
                x: node.x + node.element.offsetWidth / 2,
                y: node.y + node.element.offsetHeight / 2
            }
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
        if (typeof nodeId !== 'number' && typeof nodeId !== 'string') {
            console.error('无效的节点ID:', nodeId);
            return;
        }
        if (typeof nodeId == 'string') {
            nodeId = parseInt(nodeId);
        }

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

        // 从connections中移除连接线
        const connectionsToRemove = this.connections.filter(conn =>
            conn.from.nodeId === nodeId || conn.to.nodeId === nodeId
        );
        connectionsToRemove.forEach(conn => {
            this.removeConnection(conn.uid);
        });
        // 从nodes集合中移除
        this.nodes.delete(nodeId);
        this.idGenerator.release(nodeId);


        this.updateStatus(`已删除节点: ${node.config.title} #${nodeId}`);
    }

    // 删除所有节点
    clear() {
        this.nodes.clear();
        this.connections = [];
        this.idGenerator.reset();
        this.highlightCache = {
            highlightedNodes: new Set(),
            dimmedConnections: new Set()
        };

        const test_nodes = this.canvas.querySelectorAll(".test-node");
        test_nodes.forEach((node) => node.remove());
        const nodes = this.canvas.querySelectorAll(".node");
        nodes.forEach((node) => node.remove());
        const connections = this.canvas.querySelectorAll(".connection-path");
        connections.forEach((connection) => connection.remove());

        this.updateStatus(`已清空所有节点及连接线`);
    }

    // === 连接线功能实现 ===

    setupNodePortDrag(ports, nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return;

        // 初始化输入端口拖拽事件
        node.element.querySelectorAll('.port-hub-item.input .port-dot').forEach((element, index) => {
            this.initPortDrag(element, nodeId, 'input', index);
        });

        // 初始化输出端口拖拽事件
        node.element.querySelectorAll('.port-hub-item.output .port-dot').forEach((element, index) => {
            this.initPortDrag(element, nodeId, 'output', index);
        });

    }

    // 初始化端口拖拽事件
    initPortDrag(element, nodeId, portType, portIndex) {
        const portDot = element.querySelector('.port-dot');
        if (!portDot) return;

        // 添加鼠标按下事件
        portDot.addEventListener('mousedown', (e) => {
            this.startPortDrag(e, element, nodeId, portType, portIndex);
        });

        // 添加鼠标进入/离开事件（用于悬停效果）
        element.addEventListener('mouseenter', () => {
            if (!this.connectionState.isDragging) {
                element.classList.add('port-hover');
            }
        });

        element.addEventListener('mouseleave', () => {
            if (!this.connectionState.isDragging) {
                element.classList.remove('port-hover');
            }
        });
    }

    // 开始端口拖拽
    startPortDrag(event, portElement, nodeId, portType, portIndex) {
        event.preventDefault();
        event.stopPropagation();

        console.log(`开始建立连接 起始端口${portElement.portId}`);

        const node = this.getNode(nodeId);
        if (!node) return;


        // 检查端口是否已连接
        if (this.isPortConnected(nodeId, portType, portIndex)) {
            this.handleConnectedPortClick(event, nodeId, portType, portIndex);
            return;
        }


        // 设置拖拽状态
        this.connectionState.isDragging = true;
        this.connectionState.startInfo.nodeId = nodeId;
        this.connectionState.startInfo.portType = portType;
        this.connectionState.startInfo.portIndex = portIndex;
        this.connectionState.currentPortElement = portElement;

        // 添加拖拽样式
        portElement.classList.add('port-dragging');

        // 创建临时连接线
        this.createTempLine(event);

        // 绑定全局事件
        document.addEventListener('mousemove', this.handlePortDragMove.bind(this));
        document.addEventListener('mouseup', this.handlePortDragEnd.bind(this));

    }

    // 处理已连接端口的点击
    handleConnectedPortClick(event, nodeId, portType, portIndex) {
        if (event.ctrlKey || event.metaKey) {
            // Ctrl+点击断开连接
            this.removePortConnection(nodeId, portType, portIndex);
        } else {
            // 普通点击显示连接信息
            this.showConnectionInfo(nodeId, portType, portIndex);
        }
    }

    // 创建临时连接线
    createTempLine(event) {
        const connectionsSvg = this.canvas.querySelector('svg') || this.createConnectionsSvg();

        // 获取起始端口位置
        const { nodeId, portIndex, portType } = this.connectionState.startInfo;
        const startPos = this.getPortDotPosition(nodeId, portIndex, portType);

        // 创建SVG路径
        const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempLine.uid = 'temp-connection-line';
        tempLine.classList.add('connection-path', 'temp-connection');

        // 初始路径
        const canvasRect = this.canvas.getBoundingClientRect();
        const endX = event.clientX - canvasRect.left;
        const endY = event.clientY - canvasRect.top;

        const path = this.createCurvedPath(startPos.x, startPos.y, endX, endY, portType, null);
        tempLine.setAttribute('d', path);

        connectionsSvg.appendChild(tempLine);
        this.connectionState.tempLine = tempLine;
    }

    // 创建连接线SVG容器（如果不存在）
    createConnectionsSvg() {
        let svg = this.canvas.querySelector('svg');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.position = 'absolute';
            svg.style.top = '0';
            svg.style.left = '0';
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.pointerEvents = 'none';
            svg.style.zIndex = '10';
            svg.uid = 'connections-svg';
            this.canvas.appendChild(svg);
        }
        return svg;
    }

    // 处理拖拽移动
    handlePortDragMove(event) {
        if (!this.connectionState.isDragging || !this.connectionState.tempLine) return;

        const canvasRect = this.canvas.getBoundingClientRect();

        // 获取起始端口位置
        const { nodeId, portIndex, portType } = this.connectionState.startInfo;
        const startPos = this.getPortDotPosition(nodeId, portIndex, portType);
        // 更新临时连接线

        // 获取当前鼠标位置 
        const endX = event.clientX - canvasRect.left;
        const endY = event.clientY - canvasRect.top;

        // 更新临时连接线
        const path = this.createCurvedPath(startPos.x, startPos.y, endX, endY);
        this.connectionState.tempLine.setAttribute('d', path);

        // 检查并高亮悬停的端口
        this.checkHoveredPorts(event);
    }

    // 处理拖拽结束
    handlePortDragEnd(event) {
        if (!this.connectionState.isDragging) return;

        const targetPort = this.findTargetPort(event);

        if (targetPort) {
            // 尝试创建连接
            this.tryCreateConnection(targetPort);
        }

        // 清理拖拽状态
        this.cleanupPortDrag();
    }

    // 查找目标端口
    findTargetPort(event) {
        const elements = document.elementsFromPoint(event.clientX, event.clientY);

        for (const element of elements) {
            const portHubItem = element.closest('.port-hub-item');
            if (!portHubItem) continue;

            const { nodeId, portType, portIndex } = portHubItem;

            // TODO 暂时不允许自连
            // 不能连接到同一节点
            if (nodeId === this.connectionState.startInfo.nodeId) continue;

            // 检查是否是有效的连接目标
            if (this.isValidConnectionTarget(nodeId, portType, parseInt(portIndex))) {
                return {
                    nodeId,
                    portType,
                    portIndex: parseInt(portIndex),
                    element: portHubItem
                };
            }
        }

        return null;
    }

    // 检查悬停的端口
    checkHoveredPorts(event) {
        // 清除之前的高亮
        this.clearHighlights();

        const elements = document.elementsFromPoint(event.clientX, event.clientY);

        for (const element of elements) {
            const portHubItem = element.closest('.port-hub-item');
            if (!portHubItem) continue;

            const { nodeId, portType, portIndex } = portHubItem;

            // 检查是否可以连接
            if (this.isValidConnectionTarget(nodeId, portType, parseInt(portIndex))) {
                portHubItem.classList.add('port-highlight');
                this.connectionState.highlightedPorts.add(portHubItem);
                break; // 只高亮最上面的一个
            }
        }
    }

    // 清除高亮
    clearHighlights() {
        this.connectionState.highlightedPorts.forEach(port => {
            port.classList.remove('port-highlight');
        });
        this.connectionState.highlightedPorts.clear();
    }

    // 尝试创建连接
    tryCreateConnection(targetPort) {
        const { nodeId: targetNodeId, portType: targetPortType, portIndex: targetPortIndex } = targetPort;
        const { nodeId: startNodeId, portType: startPortType, portIndex: startPortIndex } = this.connectionState.startInfo;

        // 确定连接方向
        let fromNodeId, fromPortIndex, toNodeId, toPortIndex;

        if (startPortType === 'output') {
            fromNodeId = startNodeId;
            fromPortIndex = startPortIndex;
            toNodeId = targetNodeId;
            toPortIndex = targetPortIndex;
        } else {
            fromNodeId = targetNodeId;
            fromPortIndex = targetPortIndex;
            toNodeId = startNodeId;
            toPortIndex = startPortIndex;
        }

        console.log(`尝试连接: ${fromNodeId}:${fromPortIndex} → ${toNodeId}:${toPortIndex}`);

        // 创建连接
        this.createConnection(fromNodeId, fromPortIndex, toNodeId, toPortIndex);
    }

    // 创建永久连接
    createConnection(fromNodeId, fromPortIndex, toNodeId, toPortIndex) {
        // 检查连接是否已存在
        const existingConnection = this.connections.find(conn =>
            conn.from.nodeId === fromNodeId &&
            conn.from.portIndex === fromPortIndex &&
            conn.to.nodeId === toNodeId &&
            conn.to.portIndex === toPortIndex
        );

        if (existingConnection) {
            this.updateStatus('连接已存在');
            return;
        }

        // 创建连接ID
        const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 创建连接对象
        const connection = {
            uid: connectionId,
            from: { nodeId: parseInt(fromNodeId), portIndex: fromPortIndex },
            to: { nodeId: parseInt(toNodeId), portIndex: toPortIndex },
            line: null
        };

        // 添加到connections数组
        this.connections.push(connection);

        // 更新节点连接状态
        const fromNode = this.getNode(fromNodeId);
        const toNode = this.getNode(toNodeId);

        if (fromNode) {
            if (!fromNode.connections.outputs[fromPortIndex]) {
                fromNode.connections.outputs[fromPortIndex] = [];
            }
            fromNode.connections.outputs[fromPortIndex].push(connectionId);
        } else {
            throw new Error("起始节点不存在");
        }

        if (toNode) {
            if (!toNode.connections.inputs[toPortIndex]) {
                toNode.connections.inputs[toPortIndex] = [];
            }
            toNode.connections.inputs[toPortIndex].push(connectionId);
        } else {
            throw new Error("终点节点不存在");
        }

        // 创建连接线
        this.createConnectionLine(connection);

        // 更新端口样式
        this.updatePortStyles();

        // 更新连接线高亮
        this.updateSelectedNodesConnections();

        this.updateStatus(`已连接: ${fromNode.config.title} → ${toNode.config.title}`);
    }

    // 创建连接线SVG
    createConnectionLine(connection) {
        const svg = this.canvas.querySelector('#connections-svg') || this.createConnectionsSvg();

        // 获取节点和端口位置
        const fromNode = this.getNode(connection.from.nodeId);
        const toNode = this.getNode(connection.to.nodeId);

        if (!fromNode || !toNode) {
            console.error('创建连接线失败：节点不存在', connection);
            return;
        }
        const fromPos = this.getPortDotPosition(
            connection.from.nodeId,
            connection.from.portIndex,
            'output'
        );

        const toPos = this.getPortDotPosition(
            connection.to.nodeId,
            connection.to.portIndex,
            'input'
        );

        console.log(`创建连接线: ${fromPos.x},${fromPos.y} -> ${toPos.x},${toPos.y}`);

        // 创建SVG路径
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('connection-path', 'permanent-connection');
        path.setAttribute('data-connection-uid', connection.uid);
        path.setAttribute('d', this.createCurvedPath(fromPos.x, fromPos.y, toPos.x, toPos.y));

        // 添加悬停效果
        path.addEventListener('mouseenter', () => {
            path.classList.add('connection-hover');
        });

        path.addEventListener('mouseleave', () => {
            path.classList.remove('connection-hover');
        });

        // 双击断开连接
        path.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.removeConnection(connection.uid);
        });

        svg.appendChild(path);
        connection.line = path;
    }

    // 清理拖拽状态
    cleanupPortDrag() {
        // 移除临时连接线
        if (this.connectionState.tempLine) {
            this.connectionState.tempLine.remove();
            this.connectionState.tempLine = null;
        }

        // 移除拖拽样式
        if (this.connectionState.currentPortElement) {
            this.connectionState.currentPortElement.classList.remove('port-dragging');
        }

        // 清除高亮
        this.clearHighlights();

        // 移除全局事件监听
        document.removeEventListener('mousemove', this.handlePortDragMove.bind(this));
        document.removeEventListener('mouseup', this.handlePortDragEnd.bind(this));

        // 重置状态
        this.connectionState.isDragging = false;
        this.connectionState.startInfo = {
            nodeId: null,
            portId: null,
            portType: null,
        },
            this.connectionState.currentPortElement = null;
    }

    // TODO 暂时不允许多连
    // 检查端口是否已连接
    isPortConnected(nodeId, portType, portIndex) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        if (portType === 'input') {
            return node.connections.inputs[portIndex] &&
                node.connections.inputs[portIndex].length > 0;
        } else {
            return node.connections.outputs[portIndex] &&
                node.connections.outputs[portIndex].length > 0;
        }
    }

    // 检查是否是有效的连接目标
    isValidConnectionTarget(nodeId, portType, portIndex) {
        const { nodeId: startNodeId, portType: startPortType } = this.connectionState.startInfo;

        // 基本验证
        if (nodeId === startNodeId) return false;
        if (this.isPortConnected(nodeId, portType, portIndex)) return false;

        // 输入必须连输出，输出必须连输入
        if (startPortType === 'input' && portType !== 'output') return false;
        if (startPortType === 'output' && portType !== 'input') return false;

        return true;
    }

    // 创建曲线路径
    createCurvedPath(startX, startY, endX, endY, startPortType = 'output', endPortType = 'input') {
        // 计算节点边界偏移量
        const boundaryOffset = 50; // 基础离开节点边界的距离

        // 计算垂直和水平距离
        const verticalDistance = Math.abs(endY - startY);
        const horizontalDistance = Math.abs(endX - startX);

        // 对于永久连接（startPortType=output, endPortType=input）
        if (startPortType === 'output' && endPortType === 'input') {
            // 判断连接方向
            const isForward = endX - startX > 40; // 正向连接：output在左侧
            const isBackward = !isForward; // 反向连接：output在右侧

            // 计算控制点
            let cp1x, cp1y, cp2x, cp2y;

            if (isForward) {
                // 正向连接：output在左侧，input在右侧
                // 计算水平偏移：基于水平距离的30-40%
                const horizontalOffset = Math.max(boundaryOffset, horizontalDistance * 0.4);

                // 第一个控制点：水平向右离开节点
                cp1x = startX + horizontalOffset;
                cp1y = startY; // 保持水平，确保起点附近斜率接近0

                // 第二个控制点：水平向左进入节点
                cp2x = endX - horizontalOffset;
                cp2y = endY; // 保持水平，确保终点附近斜率接近0

                // 如果垂直距离较大，创建拉伸的S型曲线
                if (verticalDistance > 20) {
                    // 计算中间控制点的垂直偏移
                    // 使用一个较小的系数，确保两端30%的区域保持水平
                    const verticalCurveFactor = 0.15; // 垂直弯曲因子，控制S型曲线的幅度
                    const verticalOffset = Math.min(verticalDistance * verticalCurveFactor, 100);

                    // 确定弯曲方向
                    if (startY < endY) {
                        // 起点在上，终点在下：创建先向下再向上的拉伸S型
                        // 起点控制点稍微向下
                        cp1y = startY + verticalOffset * 0.2;
                        // 终点控制点稍微向上
                        cp2y = endY - verticalOffset * 0.2;
                    } else {
                        // 起点在下，终点在上：创建先向上再向下的拉伸S型
                        cp1y = startY - verticalOffset * 0.2;
                        cp2y = endY + verticalOffset * 0.2;
                    }
                }

                // 为了使曲线更平滑，添加中间控制点的轻微水平调整
                // 这有助于创建更优美的拉伸S型
                const midX = (startX + endX) / 2;
                const horizontalAdjustment = Math.min(horizontalDistance * 0.1, 20);

                // 轻微调整控制点的水平位置，使曲线更平滑
                cp1x = startX + horizontalOffset + horizontalAdjustment;
                cp2x = endX - horizontalOffset - horizontalAdjustment;

            } else if (isBackward) {
                // 反向连接：output在右侧，input在左侧
                // 增大基础偏移，确保曲线明显离开节点
                const backwardOffset = Math.max(boundaryOffset * 1.8, horizontalDistance * 0.6);

                // 第一个控制点：从output向右延伸更远，保持水平
                cp1x = startX + backwardOffset;
                cp1y = startY;

                // 第二个控制点：从input向左延伸更远，保持水平
                cp2x = endX - backwardOffset;
                cp2y = endY;

                // 如果垂直距离较大，创建反向连接的拉伸S型
                if (verticalDistance > 20) {
                    const verticalCurveFactor = 0.12; // 反向连接的弯曲幅度稍小
                    const verticalOffset = Math.min(verticalDistance * verticalCurveFactor, 80);

                    if (startY < endY) {
                        // 起点在上，终点在下
                        cp1y = startY + verticalOffset * 0.3;
                        cp2y = endY - verticalOffset * 0.3;
                    } else {
                        // 起点在下，终点在上
                        cp1y = startY - verticalOffset * 0.3;
                        cp2y = endY + verticalOffset * 0.3;
                    }
                }
            } else {
                // 垂直连接，节点在同一垂直线上
                // 创建明显的水平S型过渡
                const horizontalCurveOffset = Math.max(boundaryOffset, 70);

                cp1x = startX + horizontalCurveOffset;
                cp1y = startY;
                cp2x = endX - horizontalCurveOffset;
                cp2y = endY;

                // 对于垂直连接，创建拉伸的S型曲线
                if (verticalDistance > 30) {
                    const midY = (startY + endY) / 2;
                    const verticalOffset = Math.min(verticalDistance * 0.2, 60);

                    if (startY < endY) {
                        // 起点在上，终点在下：创建向下的拉伸S型
                        cp1y = startY + verticalOffset * 0.3;
                        cp2y = endY - verticalOffset * 0.3;
                    } else {
                        // 起点在下，终点在上：创建向上的拉伸S型
                        cp1y = startY - verticalOffset * 0.3;
                        cp2y = endY + verticalOffset * 0.3;
                    }
                }
            }

            return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
        }

        // 对于临时连接线（临时连接线可能会从input出发）
        if (endPortType === null) {
            // 临时连接线，只有起点有端口类型
            let cp1x, cp1y, cp2x, cp2y;

            if (startPortType === 'output') {
                // 从output出发的临时连接线：水平向右延伸
                cp1x = startX + boundaryOffset;
                cp1y = startY;

                // 计算终点偏移，使临时连接线也有一定的水平过渡
                const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                const endOffset = Math.min(boundaryOffset, distance * 0.3);

                cp2x = endX - endOffset;
                cp2y = endY;
            } else {
                // 从input出发的临时连接线：水平向左延伸
                cp1x = startX - boundaryOffset;
                cp1y = startY;

                // 计算终点偏移
                const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                const endOffset = Math.min(boundaryOffset, distance * 0.3);

                cp2x = endX + endOffset;
                cp2y = endY;
            }

            return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
        }

        // 其他情况（比如input到output的连接）
        // 使用默认的贝塞尔曲线，创建拉伸的S型
        const defaultOffset = 60;
        const cp1x = startX + (startPortType === 'output' ? defaultOffset : -defaultOffset);
        const cp2x = endX + (endPortType === 'input' ? -defaultOffset : defaultOffset);

        // 创建拉伸S型曲线的控制点
        let cp1y = startY;
        let cp2y = endY;

        if (verticalDistance > 20) {
            const verticalOffset = Math.min(verticalDistance * 0.15, 60);

            if (startY < endY) {
                cp1y = startY + verticalOffset * 0.25;
                cp2y = endY - verticalOffset * 0.25;
            } else {
                cp1y = startY - verticalOffset * 0.25;
                cp2y = endY + verticalOffset * 0.25;
            }
        }

        return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
    }


    // 移除端口连接
    removePortConnection(nodeId, portType, portIndex) {
        const node = this.getNode(nodeId);
        if (!node) return;

        let connectionIds = [];

        if (portType === 'input') {
            connectionIds = node.connections.inputs[portIndex] || [];
            node.connections.inputs[portIndex] = [];
        } else {
            connectionIds = node.connections.outputs[portIndex] || [];
            node.connections.outputs[portIndex] = [];
        }

        // 移除所有相关连接
        connectionIds.forEach(connectionId => {
            this.removeConnection(connectionId);
        });

        this.updateStatus(`已删除连接`);
    }

    // 移除连接
    removeConnection(connectionId) {
        // 从connections数组中查找并移除
        const connectionIndex = this.connections.findIndex(conn => conn.uid === connectionId);
        if (connectionIndex === -1) return;

        const connection = this.connections[connectionIndex];

        // 从节点连接中移除
        const fromNode = this.getNode(connection.from.nodeId);
        const toNode = this.getNode(connection.to.nodeId);

        if (fromNode) {
            const outputIndex = fromNode.connections.outputs[connection.from.portIndex]
                ?.indexOf(connectionId);
            if (outputIndex > -1) {
                fromNode.connections.outputs[connection.from.portIndex].splice(outputIndex, 1);
            }
        }

        if (toNode) {
            const inputIndex = toNode.connections.inputs[connection.to.portIndex]
                ?.indexOf(connectionId);
            if (inputIndex > -1) {
                toNode.connections.inputs[connection.to.portIndex].splice(inputIndex, 1);
            }
        }

        // 移除连接线
        if (connection.line && connection.line.parentNode) {
            connection.line.parentNode.removeChild(connection.line);
        }

        // 从数组中移除
        this.connections.splice(connectionIndex, 1);

        // 更新端口样式
        this.updatePortStyles();

        // 更新连接线高亮
        this.updateSelectedNodesConnections();

        this.updateStatus(`已断开连接`);
    }

    // 显示连接信息
    showConnectionInfo(nodeId, portType, portIndex) {
        const node = this.getNode(nodeId);
        if (!node) return;

        const connectionIds = portType === 'input'
            ? node.connections.inputs[portIndex] || []
            : node.connections.outputs[portIndex] || [];

        if (connectionIds.length > 0) {
            let info = `连接信息: `;
            connectionIds.forEach((connId, index) => {
                const connection = this.connections.find(conn => conn.uid === connId);
                if (connection) {
                    const fromNode = this.getNode(connection.from.nodeId);
                    const toNode = this.getNode(connection.to.nodeId);
                    if (fromNode && toNode) {
                        info += `${fromNode.config.title} → ${toNode.config.title}`;
                        if (index < connectionIds.length - 1) info += ', ';
                    }
                }
            });
            this.updateStatus(info);
        }
    }

    // 更新端口样式
    updatePortStyles() {
        // 先清除所有连接样式
        document.querySelectorAll('.port-dot').forEach(dot => {
            dot.classList.remove('connected');
        });

        // 为所有连接的端口添加样式
        this.connections.forEach(connection => {
            const fromPort = this.findPortElement(connection.from.nodeId, 'output', connection.from.portIndex);
            const toPort = this.findPortElement(connection.to.nodeId, 'input', connection.to.portIndex);

            if (fromPort) fromPort.classList.add('connected');
            if (toPort) toPort.classList.add('connected');
        });
    }

    // 查找端口元素
    findPortElement(nodeId, portType, portIndex) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.element) return null;

        return node.element.querySelector(
            `.port-hub-item[data-port-uid="${nodeId}-${portType}-${portIndex}"] .port-dot`
        );
    }

    // === 连接线高亮功能 ===

    /**
     * 高亮节点相关的所有连接线
     * @param {number} nodeId - 节点ID
     */
    highlightNodeConnections(nodeId) {
        // 移除所有连接线的高亮和淡化样式
        this.clearConnectionHighlights();

        // 获取节点
        const node = this.getNode(nodeId);
        if (!node) return;

        // 收集所有相关的连接线ID
        const relatedConnectionIds = new Set();

        // 检查输入连接
        if (node.connections.inputs) {
            node.connections.inputs.forEach(connectionArray => {
                if (connectionArray && Array.isArray(connectionArray)) {
                    connectionArray.forEach(connectionId => {
                        if (connectionId) relatedConnectionIds.add(connectionId);
                    });
                } else if (connectionArray) {
                    relatedConnectionIds.add(connectionArray);
                }
            });
        }

        // 检查输出连接
        if (node.connections.outputs) {
            node.connections.outputs.forEach(connectionArray => {
                if (connectionArray && Array.isArray(connectionArray)) {
                    connectionArray.forEach(connectionId => {
                        if (connectionId) relatedConnectionIds.add(connectionId);
                    });
                } else if (connectionArray) {
                    relatedConnectionIds.add(connectionArray);
                }
            });
        }

        // 高亮相关连接线
        relatedConnectionIds.forEach(connectionId => {
            const path = document.querySelector(`.connection-path[data-connection-uid="${connectionId}"]`);
            if (path) {
                // 确保为永久连接线添加高亮样式
                if (path.classList.contains('permanent-connection')) {
                    path.classList.add('highlighted');
                    path.classList.remove('dimmed');
                }
            }
        });

        // 淡化其他连接线
        this.dimOtherConnections(Array.from(relatedConnectionIds));

        this.updateStatus(`已高亮显示节点 ${node.config.title} 的连接线`);
    }

    /**
     * 淡化非相关的连接线
     * @param {Array} highlightedConnectionIds - 高亮连接线ID数组
     */
    dimOtherConnections(highlightedConnectionIds) {
        const allPaths = document.querySelectorAll('.connection-path.permanent-connection');
        allPaths.forEach(path => {
            const connectionId = path.getAttribute('data-connection-uid');
            if (connectionId && !highlightedConnectionIds.includes(connectionId)) {
                path.classList.add('dimmed');
                path.classList.remove('highlighted');
            }
        });
    }

    /**
     * 清除所有连接线的高亮和淡化样式
     */
    clearConnectionHighlights() {
        const allPaths = document.querySelectorAll('.connection-path');
        allPaths.forEach(path => {
            path.classList.remove('highlighted');
            path.classList.remove('dimmed');
        });
    }

    /**
     * 更新多个选中节点的连接线高亮
     */
    updateSelectedNodesConnections() {
        // 获取所有选中的节点
        const selectedNodes = document.querySelectorAll('.node.selected');

        // 如果没有选中的节点，清除所有高亮
        if (selectedNodes.length === 0) {
            this.clearConnectionHighlights();
            return;
        }

        // 收集所有相关连接线ID
        const relatedConnectionIds = new Set();

        // 遍历每个选中的节点
        selectedNodes.forEach(nodeElement => {
            const nodeId = parseInt(nodeElement.uid);
            const node = this.getNode(nodeId);
            if (!node) return;

            // 添加输入连接
            if (node.connections.inputs) {
                node.connections.inputs.forEach(connectionArray => {
                    if (connectionArray && Array.isArray(connectionArray)) {
                        connectionArray.forEach(connectionId => {
                            if (connectionId) relatedConnectionIds.add(connectionId);
                        });
                    } else if (connectionArray) {
                        relatedConnectionIds.add(connectionArray);
                    }
                });
            }

            // 添加输出连接
            if (node.connections.outputs) {
                node.connections.outputs.forEach(connectionArray => {
                    if (connectionArray && Array.isArray(connectionArray)) {
                        connectionArray.forEach(connectionId => {
                            if (connectionId) relatedConnectionIds.add(connectionId);
                        });
                    } else if (connectionArray) {
                        relatedConnectionIds.add(connectionArray);
                    }
                });
            }
        });

        // 清除之前的高亮
        this.clearConnectionHighlights();

        // 高亮相关连接线
        relatedConnectionIds.forEach(connectionId => {
            const path = document.querySelector(`.connection-path[data-connection-uid="${connectionId}"]`);
            if (path && path.classList.contains('permanent-connection')) {
                path.classList.add('highlighted');
                path.classList.remove('dimmed');
            }
        });

        // 淡化其他连接线
        this.dimOtherConnections(Array.from(relatedConnectionIds));

        const count = relatedConnectionIds.size;
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
    release(uid) {
        if (uid < 1 || uid > this.maxSize) {
            throw new Error(`uid ${uid} 超出范围 (1-${this.maxSize})`);
        }

        if (this._checkBit(uid - 1)) {
            this._clearBit(uid - 1);
            // 如果释放的ID比nextId小，更新nextId
            if (uid < this.nextId) {
                this.nextId = uid;
            }
            return true;
        }

        return false;
    }

    occupy(uid) {
        if (uid < 1 || uid > this.maxSize) {
            throw new Error(`uid ${uid} 超出范围 (1-${this.maxSize})`);
        }

        // 如果占领的ID已经存在
        if (this._checkBit(uid - 1)) {
            return false;
        }

        this._setBit(uid - 1);

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

    reset() {
        this.bitmap.fill(0);
        this.nextId = 1;
    }
}

/**
 * 节点类(Node)
 * 用于表示图形界面中的基本元素节点
 * 包含节点的基本属性如位置、尺寸、端口等信息
 */
class Node {
    constructor(uid, type, x, y, config) {
        this.uid = uid;
        this.type = type;
        this.config = config;
        this.x = x;
        this.y = y;
        this.ports = new Map();
        this.data = {};
        this.connections = {
            inputs: [],
            outputs: []
        };

        this.currentMode = null; // 当前模式
        this.activeExProperties = new Map(); // 当前激活的扩展属性

        // 存储动态属性状态
        this.dynamicProperties = new Map();
        this.propertyValues = {};

        // 检查是否有 exProperties[999] 并初始化添加按钮
        this.hasExProperties999 = this.config.exProperties && this.config.exProperties[999];

        // 初始化数据
        this._initializeData();

        this.element = this._createNodeElement();

        // 隐藏占位符
        const placeholder = document.getElementById('placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

    }

    // 初始化节点数据
    _initializeData() {
        // 初始化固定属性
        if (this.config.fixedProperties) {
            this.config.fixedProperties.forEach((prop, index) => {
                const key = prop.label || `fixed_${index}`;
                this.data[key] = prop.default !== undefined ? prop.default : '';
                this.propertyValues[key] = prop.default !== undefined ? prop.default : '';
            });
        }

        // 初始化常规属性
        if (this.config.properties) {
            this.config.properties.forEach((prop, index) => {
                const key = prop.label || `prop_${index}`;
                this.data[key] = prop.default !== undefined ? prop.default : '';
                this.propertyValues[key] = prop.default !== undefined ? prop.default : '';
            });
        }

        // 初始化标题
        this.data.title = this.config.title;
    }

    // 创建节点DOM元素
    _createNodeElement() {
        const element = document.createElement('div');
        element.className = 'node';
        element.uid = this.uid;
        element.dataset.nodeType = this.type;
        element.style.left = this.x + 'px';
        element.style.top = this.y + 'px';
        element.style.borderColor = this.config.color;
        element.locked = false;

        // 构建节点HTML结构
        let html = this._createHeaderHTML();
        html += '<div class="node-content">';
        html += this._createContentHTML();
        html += this._createPropertiesHTML();
        html += '</div>';

        element.innerHTML = html;
        // 创建端口区域
        this._createPortsSection(element);

        // 聚焦节点使其可接收键盘事件
        element.tabIndex = 0;

        // 添加事件委托处理模式切换
        element.addEventListener('change', (e) => {
            if (e.target.classList.contains('mode-switcher')) {
                e.stopPropagation();
                const propKey = e.target.dataset.propKey;
                const newMode = e.target.value;
                this._switchNodeMode(propKey, newMode);
            }
        });

        return element;
    }

    // 创建头部HTML
    _createHeaderHTML() {
        return `
        <div class="node-header">
            <div class="node-icon" style="color: ${this.config.color}">
                ${this.config.icon || '⚡'}
            </div>
            <div class="node-title">
                <input type="text" 
                       class="node-title-input" 
                       value="${this.config.title}" 
                       placeholder="节点标题"
                       data-node-uid="${this.uid}"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
                <span class="node-uid">#${this.uid}</span>
            </div>
            <div class="node-label">
                <input type="text" 
                       class="node-label-input" 
                       value="${this.config.label || ''}" 
                       placeholder="标签（可选）"
                       data-node-uid="${this.uid}"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
            </div>
        </div>
    `;
    }

    // 创建内容HTML
    _createContentHTML() {
        let content = this.config.content || '';
        // 替换内容中的变量
        return `<div class="node-info">${content}</div>`;
    }

    // 创建属性HTML
    _createPropertiesHTML() {
        let html = '';

        // 固定属性
        if (this.config.fixedProperties && this.config.fixedProperties.length > 0) {
            html += '<div class="node-properties fixed-properties">';
            this.config.fixedProperties.forEach((prop, index) => {
                html += this._createPropertyHTML(prop, `fixed_${index}`, true);
            });
            html += '</div>';
        }

        // 常规属性
        if (this.config.properties && this.config.properties.length > 0) {
            html += '<div class="node-properties regular-properties">';
            this.config.properties.forEach((prop, index) => {
                html += this._createPropertyHTML(prop, `prop_${index}`);
            });
            html += '</div>';
        }

        // 扩展属性容器
        html += '<div class="node-properties extended-properties"></div>';

        return html;
    }

    // 创建单个属性HTML
    _createPropertyHTML(prop, propId, fixed = false) {
        const value = prop.default !== undefined ? prop.default : '';
        const key = prop.label || propId;
        this.propertyValues[key] = value;

        let inputHTML = '';
        const commonAttrs = `data-node-uid="${this.uid}" data-prop-key="${key}"`;

        switch (prop.type) {
            case 'text':
                inputHTML = `
                    <input type="text" 
                           class="property-input property-text" 
                           value="${value}"
                           placeholder="${prop.placeholder || ''}"
                           ${commonAttrs}
                           onchange="updateNodeProperty('${this.uid}', '${key}', this.value)"
                           onclick="event.stopPropagation()">
                `;
                break;

            case 'number':
            case 'int':
                inputHTML = `
                    <input type="number" 
                           class="property-input property-int" 
                           value="${value}"
                           min="${prop.min || ''}"
                           max="${prop.max || ''}"
                           step="${prop.type === 'int' ? '1' : 'any'}"
                           ${commonAttrs}
                           onchange="updateNodeProperty('${this.uid}', '${key}', ${prop.type === 'int' ? 'parseInt(this.value) || 0' : 'parseFloat(this.value) || 0'})"
                           onclick="event.stopPropagation()">
                `;
                break;

            case 'range':
                inputHTML = `
                    <div class="property-range-wrapper">
                        <input type="range" 
                               class="property-input property-range" 
                               value="${value}"
                               min="${prop.min || 0}"
                               max="${prop.max || 100}"
                               ${commonAttrs}
                               oninput="updateNodeProperty('${this.uid}', '${key}', parseFloat(this.value)); 
                                        this.nextElementSibling.textContent = this.value"
                               onclick="event.stopPropagation()">
                        <span class="range-value">${value}</span>
                    </div>
                `;
                break;

            case 'bool':
                const boolId = `bool-${this.uid}-${propId}`;
                const trueLabel = prop.labels?.true || '是';
                const falseLabel = prop.labels?.false || '否';
                inputHTML = `
                    <div class="bool-radio-group" data-id="${boolId}">
                        <label class="bool-option">
                            <input type="radio" 
                                   name="${boolId}" 
                                   value="true"
                                   ${value === true ? 'checked' : ''}
                                   ${commonAttrs}
                                   onchange="updateNodeProperty('${this.uid}', '${key}', true)">
                            <span class="bool-radio-label">${trueLabel}</span>
                        </label>
                        <label class="bool-option">
                            <input type="radio" 
                                   name="${boolId}" 
                                   value="false"
                                   ${value === false ? 'checked' : ''}
                                   ${commonAttrs}
                                   onchange="updateNodeProperty('${this.uid}', '${key}', false)">
                            <span class="bool-radio-label">${falseLabel}</span>
                        </label>
                    </div>
                `;
                break;

            case 'checkbox':
                inputHTML = `
                    <div class="property-checkbox-wrapper">
                        <input type="checkbox" 
                               class="property-input property-checkbox"
                               ${value ? 'checked' : ''}
                               ${commonAttrs}
                               onchange="updateNodeProperty('${this.uid}', '${key}', this.checked)">
                    </div>
                `;
                break;

            case 'select':
                // 检查是否为模式切换器
                const isModeSwitcher = fixed || false;

                if (isModeSwitcher) {
                    // 模式切换器
                    const options = prop.options.map((opt, i) =>
                        `<option value="${i}" ${i === this.currentMode ? 'selected' : ''}>${opt}</option>`
                    ).join('');

                    inputHTML = `
                        <select class="property-input property-select mode-switcher" 
                                data-node-uid="${this.uid}"
                                data-prop-key="${key}"
                                onchange="event.stopPropagation();">
                            ${options}
                        </select>
                    `;
                } else {
                    // 普通select
                    const options = prop.options.map((opt, i) =>
                        `<option value="${i}" ${i === value ? 'selected' : ''}>${opt}</option>`
                    ).join('');

                    inputHTML = `
                        <select class="property-input property-select" 
                                ${commonAttrs}
                                onchange="updateNodeProperty('${this.uid}', '${key}', this.value)">
                            ${options}
                        </select>
                    `;
                }
                break;

            case 'port':
                inputHTML = `
                    <div class="property-port" ${commonAttrs}>
                        <div class="port-connector" 
                             data-port-type="property"
                             data-node-uid="${this.uid}"
                             data-prop-key="${key}"
                             data-require-type="${prop.requireType || 'any'}"
                             data-multi-connect="${prop.multiConnect || false}">
                            <span class="port-label">${prop.label}</span>
                            <div class="port-dot property-port-dot"></div>
                        </div>
                    </div>
                `;
                break;

            case 'image':
                inputHTML = `
                    <div class="property-image">
                        <input type="text" 
                               class="property-input property-text" 
                               value="${value}"
                               placeholder="图片文件名"
                               ${commonAttrs}
                               onchange="updateNodeProperty('${this.uid}', '${key}', this.value)"
                               onclick="event.stopPropagation()">
                        <button class="btn btn-small browse-btn" onclick="browseImage('${this.uid}', '${key}', this)">浏览</button>
                    </div>
                `;
                break;

            case 'port-hub':
                if (prop.innerPort && Array.isArray(prop.innerPort)) {
                    let innerPortsHTML = '<div class="port-hub-inner">';
                    prop.innerPort.forEach((innerPort, innerIndex) => {
                        innerPortsHTML += `
                            <div class="inner-port">
                                <span class="inner-port-label">${innerPort.label}</span>
                                <div class="port-connector" 
                                     data-port-type="property"
                                     data-node-uid="${this.uid}"
                                     data-prop-key="${key}_${innerIndex}"
                                     data-require-type="${innerPort.requireType || 'any'}"
                                     data-multi-connect="${innerPort.multiConnect || false}">
                                    <div class="port-dot property-port-dot"></div>
                                </div>
                            </div>
                        `;
                    });
                    innerPortsHTML += '</div>';
                    inputHTML = innerPortsHTML;
                }
                break;

            default:
                inputHTML = `
                    <input type="text" 
                           class="property-input" 
                           value="${value}"
                           ${commonAttrs}
                           onchange="updateNodeProperty('${this.uid}', '${key}', this.value)"
                           onclick="event.stopPropagation()">
                `;
        }

        // 添加帮助信息
        let helpHTML = '';
        if (prop.description) {
            helpHTML = `<div class="property-help" title="${prop.description}">?</div>`;
        }

        // 添加警告信息
        let warningHTML = '';
        // if (prop.NotSetWarning) {
        //     warningHTML = `<div class="property-warning">⚠ ${prop.NotSetWarning}</div>`;
        // }

        return `
            <div class="property-item" data-prop-key="${key}">
                <div class="property-label">
                    ${prop.label}:
                    ${helpHTML}
                </div>
                ${inputHTML}
                ${warningHTML}
            </div>
        `;
    }

    // 在Node类中添加
    _switchNodeMode(propKey, newMode) {
        // 保存当前模式的属性值
        if (this.currentMode !== null) {
            this.saveModeProperties(this.currentMode);
        }

        // 更新当前模式
        this.currentMode = parseInt(newMode);

        // 加载新模式的属性
        this.loadModeProperties(this.currentMode);

        // 更新UI
        this.updateModePropertiesUI();

        // 通知状态更新
        if (this.updateStatus) {
            this.updateStatus(`切换节点模式为: ${this.config.fixedProperties.find(p => p.label === propKey).options[newMode]}`);
        }
    }

    // 保存当前模式的属性值
    _saveModeProperties(mode) {
        const exProps = this.config.exProperties[mode];
        if (!exProps) return;

        exProps.forEach((prop, index) => {
            const key = `ex_${mode}_${index}`;
            if (this.activeExProperties.has(key)) {
                this.data[key] = this.activeExProperties.get(key).value;
            }
        });
    }

    // 加载新模式的属性
    _loadModeProperties(mode) {
        // 清除当前激活的扩展属性
        this.activeExProperties.clear();

        // 加载新模式的属性
        const exProps = this.config.exProperties[mode];
        if (!exProps) return;

        exProps.forEach((prop, index) => {
            const key = `ex_${mode}_${index}`;
            const value = this.data[key] !== undefined ? this.data[key] : (prop.default !== undefined ? prop.default : '');

            this.activeExProperties.set(key, {
                prop: prop,
                value: value
            });
        });
    }

    // 更新模式属性UI
    _updateModePropertiesUI() {
        const extendedPropsContainer = this.element.querySelector('.extended-properties');
        if (!extendedPropsContainer) return;

        // 清空容器
        extendedPropsContainer.innerHTML = '';

        // 添加当前模式的属性
        this.activeExProperties.forEach((item, key) => {
            const prop = item.prop;
            const value = item.value;

            // 创建属性HTML
            const propHTML = this._createPropertyHTML(prop, key, value);

            // 添加到容器
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = propHTML;
            const propElement = tempDiv.firstChild;
            propElement.dataset.mode = this.currentMode;
            extendedPropsContainer.appendChild(propElement);
        });

        // 检查是否有编号999的exProperties
        if (this.config.exProperties[999]) {
            // 添加"+"按钮
            const addButton = document.createElement('button');
            addButton.className = 'add-ex-property-btn';
            addButton.innerHTML = '+';
            addButton.style.color = '#9C27B0';
            addButton.style.backgroundColor = 'transparent';
            addButton.style.border = '1px solid #9C27B0';
            addButton.style.borderRadius = '50%';
            addButton.style.width = '24px';
            addButton.style.height = '24px';
            addButton.style.fontSize = '18px';
            addButton.style.lineHeight = '20px';
            addButton.style.padding = '0';
            addButton.style.cursor = 'pointer';
            addButton.style.marginLeft = 'auto';
            addButton.style.marginRight = '5px';
            addButton.style.display = 'inline-flex';
            addButton.style.justifyContent = 'center';
            addButton.style.alignItems = 'center';
            addButton.title = '添加属性';

            // 添加点击事件
            addButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showExPropertiesMenu(e);
            });

            extendedPropsContainer.appendChild(addButton);
        }
    }

    // 显示exProperties菜单
    _showExPropertiesMenu(event) {
        // 创建菜单
        const menu = document.createElement('div');
        menu.className = 'ex-properties-menu';
        menu.style.position = 'absolute';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        menu.style.backgroundColor = '#fff';
        menu.style.border = '1px solid #ccc';
        menu.style.borderRadius = '4px';
        menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        menu.style.zIndex = '1000';
        menu.style.padding = '5px 0';

        // 添加菜单项
        const exProps999 = this.config.exProperties[999];
        if (exProps999 && Array.isArray(exProps999)) {
            exProps999.forEach((prop, index) => {
                const menuItem = document.createElement('div');
                menuItem.className = 'ex-properties-menu-item';
                menuItem.textContent = prop.label || `属性 ${index}`;
                menuItem.style.padding = '8px 15px';
                menuItem.style.cursor = 'pointer';

                // 添加悬停效果
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.backgroundColor = '#f5f5f5';
                });
                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.backgroundColor = 'transparent';
                });

                // 添加点击事件
                menuItem.addEventListener('click', () => {
                    this.addExProperty(prop, index);
                    document.body.removeChild(menu);
                });

                menu.appendChild(menuItem);
            });
        }

        // 添加到文档
        document.body.appendChild(menu);

        // 点击其他地方关闭菜单
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                document.body.removeChild(menu);
                document.removeEventListener('click', closeMenu);
            }
        };

        // 延迟添加点击事件，避免立即触发
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    // 添加扩展属性
    _checkBitaddExProperty(prop, index) {
        // 生成属性键
        const key = `ex_custom_${Date.now()}_${index}`;

        // 添加到激活的扩展属性
        this.activeExProperties.set(key, {
            prop: prop,
            value: prop.default !== undefined ? prop.default : ''
        });

        // 更新UI
        this.updateModePropertiesUI();

        // 通知状态更新
        if (this.updateStatus) {
            this.updateStatus(`添加属性: ${prop.label}`);
        }
    }

    // 创建端口区域
    _createPortsSection(element) {
        const portHub = document.createElement('div');
        portHub.className = 'node-port-hub';
        const portsContainer = this._createPortHub();
        portHub.appendChild(portsContainer);
        element.appendChild(portHub);
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
        const portId = `${this.uid}-${portType}-${portIndex}`;

        // 创建DOM元素
        const element = document.createElement('div');
        element.className = `port-hub-item`;
        element.nodeId = this.uid;
        element.portId = portId;
        element.portType = portType;
        element.portIndex = portIndex;

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

        this.ports.set(portId, element);

        return element;
    }

    // 锁定节点
    lockNode() {
        this.element.locked = true;
    }

    // 解锁节点
    unlockNode() {
        this.element.locked = false;
    }

    // 获取端口
    getPort(portIndex, portType) {
        const portId = `${this.uid}-${portType}-${portIndex}`;
        const port = this.ports.get(portId)
        if (!port) {
            console.warn(`节点 ${this.uid} 没有端口 ${portIndex} (${portType})`);
            return null;
        }
        return port;
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
            uid: nodeData.uid,
            type: nodeData.type,
            config: nodeData.config,
            x: nodeData.x,
            y: nodeData.y,
            connections: JSON.parse(JSON.stringify(nodeData.connections)),
            data: JSON.parse(JSON.stringify(nodeData.data))
        };

        this.nodes.set(node.uid, node);

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
            uid: nodeId,
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
                fromNode.connections.outputs[connection.from.portIndex].push(connection.uid);
            }

            if (toNode.connections.inputs[connection.to.portIndex]) {
                if (!Array.isArray(toNode.connections.inputs[connection.to.portIndex])) {
                    toNode.connections.inputs[connection.to.portIndex] = [];
                }
                toNode.connections.inputs[connection.to.portIndex].push(connection.uid);
            }

            // 创建连接线
            if (window.vscodeAPI && window.vscodeAPI.portDragManager) {
                const fromPort = window.vscodeAPI.getPortDotPosition(fromNode, connection.from.portIndex, 'output');
                const toPort = window.vscodeAPI.getPortDotPosition(toNode, connection.to.portIndex, 'input');

                const svg = this.canvas.querySelector('#connections-svg') || window.vscodeAPI.portDragManager.createConnectionsSvg();
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.classList.add('connection-path', 'permanent-connection');
                path.setAttribute('data-connection-uid', connection.uid);
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
                fromNode.connections.outputs[connection.from.portIndex].push(connection.uid);
            }

            if (toNode.connections.inputs[connection.to.portIndex]) {
                if (!Array.isArray(toNode.connections.inputs[connection.to.portIndex])) {
                    toNode.connections.inputs[connection.to.portIndex] = [];
                }
                toNode.connections.inputs[connection.to.portIndex].push(connection.uid);
            }

            // 创建连接线
            if (window.vscodeAPI && window.vscodeAPI.portDragManager) {
                const fromPort = window.vscodeAPI.getPortDotPosition(fromNode, connection.from.portIndex, 'output');
                const toPort = window.vscodeAPI.getPortDotPosition(toNode, connection.to.portIndex, 'input');

                const svg = this.canvas.querySelector('#connections-svg') || window.vscodeAPI.portDragManager.createConnectionsSvg();
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.classList.add('connection-path', 'permanent-connection');
                path.setAttribute('data-connection-uid', connection.uid);
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
                connectionIdsToRemove.add(connection.uid);
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
        const connectionIndex = this.connections.findIndex(conn => conn.uid === connectionId);
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
        const path = document.querySelector(`.connection-path[data-connection-uid="${connectionId}"]`);
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

    // 恢复初始状态
    reset() {
        this.clearHistory();
        this.nodes.clear();
        this.connections = [];
    }

    clearHistory() {
        this.actionHistory = [];
        this.historyIndex = -1;
    }
}

// 直接导出为全局对象，供webview使用
window.BasicActionManager = BasicActionManager;
window.NodeManager = NodeManager;
