/* eslint-disable no-undef */
// @ts-nocheck
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
        '.port-item',           // 端口项整体
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

    // 如果点击的是以下元素，则忽略点击
    static ignoreClickItem = [
        // === 数据输入控件 ===
        'input',                    // 所有输入框（包括文本、数字、范围等）
        'select',                   // 下拉框
        'textarea',                 // 文本域
        '.property-input',          // 属性输入框（包含各种类型）

        // === 连接端口 ===
        '.port-dot',                // 端口圆点（用于连接线）
        '.port-item',           // 端口项整体
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
    constructor(viewport, canvas, updateStatus) {
        this.idGenerator = new BitmapIdGenerator();
        this.id = 'node-manager-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // 构造函数中可以初始化节点的属性和管理器所需的状态
        this.viewport = viewport;
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

        // 缩放相关变量
        this.transform = {
            x: 0,
            y: 0,
            scale: 1
        }

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
                portDirect: null,
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

        // this.basicActionManager = new BasicActionManager(this.nodes, this.connections, this.canvas, this.updateStatus);

        this.handleEvent();
    }

    getNode(uid) {
        // 类型检查
        if (typeof uid !== 'string' && typeof uid !== 'number') {
            console.error('节点UID格式不对', typeof uid, uid);
            return;
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
        return NodeManager.ignoreDragItem.some((item) => target.closest(item));
    }

    shouldIgnoreClick(target) {
        return NodeManager.ignoreClickItem.some((item) => target.closest(item));
    }
    // 处理事件
    handleEvent() {
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e)); // 添加点击事件监听器
        this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e)); // 添加contextmenu事件监听
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e)); // 添加鼠标按下事件监听器
        this.canvas.addEventListener('change', (e) => this.handleCanvasChange(e)); // 添加鼠标移动事件监听器
        // this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));  // 添加鼠标移动事件监听器
        // this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));    // 添加鼠标松开事件监听器
        // this.canvas.addEventListener('wheel', (e) => this.handleCanvasWheel(e)); // 添加滚轮事件监听器
    }

    // 处理画布上的 change 事件
    handleCanvasChange(e) {
        const target = e.target;

        // 检查是否是模式切换器
        if (target.classList.contains('mode-switcher')) {
            e.stopPropagation();

            const nodeUid = target.dataset.nodeUid;
            const propKey = target.dataset.propKey;
            const newMode = parseInt(target.value, 10);

            console.log(`检测到模式切换: 节点 ${nodeUid}, 属性 ${propKey}, 新模式 ${newMode}`);

            // 获取节点实例
            const node = this.getNode(nodeUid);
            if (node) {
                node.switchNodeMode(propKey, newMode);
            }
        }
    }

    // 处理画布点击事件
    handleCanvasClick(e) {

        if (this.shouldIgnoreClick(e.target)) {
            return;
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
            nodeElement.focus({ preventScroll: true });
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

    // 处理画布滚轮事件
    handleCanvasWheel(e) {
        this.scaleAllNodes(1.0);
    }

    scaleAllNodes(scale) {
        this.nodes.forEach((node) => {
            node.scale(scale);
        })
        this.connections.forEach((connection) => {
            this.updateConnectionPosition(connection.uid);
        })
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
        const portElement = e.target.closest('.port-item');

        if (e.button === 2) { // 右键点击
            if (portElement) {
                this.showConnectionInfo(portElement);
                return;
            }

            this.handleContextMenu(e);
            return;
        }
        const portDotElement = e.target.closest('.port-dot');
        const nodeElement = e.target.closest('.node');

        if (portDotElement) {

            if (portElement) {
                this.startPortDrag(e, portElement, nodeElement.uid);
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
        const offsetPosition = viewportToCanvas(this.viewport, event.clientX, event.clientY, this.transform);

        // 记录拖拽状态

        // 计算鼠标相对于节点的偏移
        this.dragState = {
            isDragging: true,
            nodeId: nodeId,
            offsetX: offsetPosition.x-node.x,
            offsetY: offsetPosition.y-node.y,
            initialX: node.x,
            initialY: node.y,
            draggedNode: node
        };

        node.element.classList.add('selected');

        // 获取焦点，使节点可以接收键盘事件
        node.element.focus({ preventScroll: true });

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

        // 计算新位置
        const newPosition = viewportToCanvas(this.viewport, event.clientX, event.clientY, this.transform);
        const newX = newPosition.x - this.dragState.offsetX;
        const newY = newPosition.y - this.dragState.offsetY;

        // // 边界检查
        // newX = Math.max(0, Math.min(newX, canvas.clientWidth - node.element.offsetWidth));
        // newY = Math.max(0, Math.min(newY, canvas.clientHeight - node.element.offsetHeight));

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
        const fromPos = this.getPortDotPosition(connection.from.nodeId, connection.from.portIndex, connection.from.portType);
        const toPos = this.getPortDotPosition(connection.to.nodeId, connection.to.portIndex, connection.to.portType);

        // 更新路径
        const newPath = this.createCurvedPath(fromPos.x, fromPos.y, toPos.x, toPos.y, 'out', 'in');
        path.setAttribute('d', newPath);

        // 更新连接对象的line引用
        connection.line = path;
    }

    // 更新节点的所有连接线
    updateNodeConnections(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return;

        // 收集所有需要更新的连接线
        const connectionsToUpdate = node.getAllConnections();

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

            const nodeX = node.x + node.element.offsetWidth / 2;
            const nodeY = node.y + node.element.offsetHeight / 2;

            return viewportToCanvas(this.viewport, nodeX, nodeY, this.transform);
        }

        const portDot = port.querySelector('.port-dot');
        if (!portDot) {
            console.warn(`找不到节点 ${nodeId} 的端口 ${portIndex} 的圆点`);
            const nodeX = node.x + node.element.offsetWidth / 2;
            const nodeY = node.y + node.element.offsetHeight / 2;

            return viewportToCanvas(this.viewport, nodeX, nodeY, this.transform);
        }

        const portDotRect = portDot.getBoundingClientRect();

        const portX = portDotRect.left + portDotRect.width / 2;
        const portY = portDotRect.top + portDotRect.height / 2;

        return viewportToCanvas(this.viewport, portX, portY, this.transform);

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

    // 开始端口拖拽
    startPortDrag(event, portElement, nodeId) {
        event.preventDefault();
        event.stopPropagation();
        const node = this.getNode(nodeId);
        if (!node) return;

        console.log(`开始建立连接 起始端口${portElement.portId}`);

        // 检查端口是否已连接
        if (this.isPortConnected(nodeId, portElement.portType, portElement.portIndex)) {
            this.handleConnectedPortClick(event, nodeId, portElement.portType, portElement.portIndex);

            // 检查端口是否允许多连
            if (!portElement.multiConnect) {
                this.updateStatus(`端口 ${portElement.portId} 已达到连接上限，不能连接`);
                return;
            };

        }

        // 设置拖拽状态
        this.connectionState.isDragging = true;
        this.connectionState.startInfo.nodeId = nodeId;
        this.connectionState.startInfo.portDirect = portElement.portDirect;
        this.connectionState.startInfo.portType = portElement.portType;
        this.connectionState.startInfo.portIndex = portElement.portIndex;
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

        const endPosition = viewportToCanvas(this.viewport, event.clientX, event.clientY, this.transform);

        const path = this.createCurvedPath(startPos.x, startPos.y, endPosition.x, endPosition.y, portType, null, true);
        tempLine.setAttribute('d', path);

        connectionsSvg.appendChild(tempLine);
        this.connectionState.tempLine = tempLine;
    }

    // 创建连接线SVG容器（如果不存在）
    createConnectionsSvg() {
        let svg = this.canvas.querySelector('svg');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'connections-svg';
            this.canvas.appendChild(svg);
        }
        return svg;
    }

    // 处理拖拽移动
    handlePortDragMove(event) {
        if (!this.connectionState.isDragging || !this.connectionState.tempLine) return;

        // 获取起始端口位置
        const { nodeId, portIndex, portType, portDirect } = this.connectionState.startInfo;
        const startPos = this.getPortDotPosition(nodeId, portIndex, portType);
        // 更新临时连接线

        // 获取当前鼠标位置 
        const endPosition = viewportToCanvas(this.viewport, event.clientX, event.clientY, this.transform);

        // 更新临时连接线
        const path = this.createCurvedPath(startPos.x, startPos.y, endPosition.x, endPosition.y, portDirect, null, true);
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
            const portItem = element.closest('.port-item');
            if (!portItem) continue;

            const { nodeId, portType, portDirect, portIndex, multiConnect } = portItem;

            // 不能连接到同一节点
            if (nodeId === this.connectionState.startInfo.nodeId) continue;

            // 检查是否是有效的连接目标
            if (this.isValidConnectionTarget(nodeId, portType, portDirect, parseInt(portIndex), multiConnect)) {
                return {
                    nodeId,
                    portType,
                    portIndex: parseInt(portIndex),
                    requireType: portItem.requireType,
                    element: portItem
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
            const portItem = element.closest('.port-item');
            if (!portItem) continue;

            const { nodeId, portType, portIndex, multiConnect } = portItem;

            // 检查是否可以连接
            if (this.isValidConnectionTarget(nodeId, portType, parseInt(portIndex), multiConnect)) {
                portItem.classList.add('port-highlight');
                this.connectionState.highlightedPorts.add(portItem);
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
        if (targetPort.requireType) {
            if (targetPort.requireType !== this.getNode(this.connectionState.startInfo.nodeId).type) {
                this.updateStatus('连接类型不匹配');
                console.log(`连接类型不匹配: ${this.getNode(this.connectionState.startInfo.nodeId).type} → ${targetPort.requireType}`);
                return;
            }

        }

        const { nodeId: targetNodeId, portType: targetPortType, portDirect: targetPortDirect, portIndex: targetPortIndex } = targetPort;
        const { nodeId: startNodeId, portType: startPortType, portDirect: startPortDirect, portIndex: startPortIndex } = this.connectionState.startInfo;

        // 确定连接方向
        let fromNodeId, fromPortIndex, fromPortType, toNodeId, toPortIndex, toPortType;

        if (startPortDirect === 'out') {
            fromNodeId = startNodeId;
            fromPortIndex = startPortIndex;
            fromPortType = startPortType;
            toNodeId = targetNodeId;
            toPortIndex = targetPortIndex;
            toPortType = targetPortType;
        } else {
            fromNodeId = targetNodeId;
            fromPortIndex = targetPortIndex;
            fromPortType = targetPortType;
            toNodeId = startNodeId;
            toPortIndex = startPortIndex;
            toPortType = startPortType;
        }


        console.log(`尝试连接: ${fromNodeId}:${fromPortIndex} → ${toNodeId}:${toPortIndex}`);

        // 创建连接
        this.createConnection(fromNodeId, fromPortIndex, fromPortType, toNodeId, toPortIndex, toPortType);
    }

    // 创建永久连接
    createConnection(fromNodeId, fromPortIndex, fromPortType, toNodeId, toPortIndex, toPortType) {
        // 检查连接是否已存在
        const existingConnection = this.connections.find(conn =>
            conn.from.nodeId === fromNodeId &&
            conn.from.portIndex === fromPortIndex &&
            conn.from.portType === fromPortType &&
            conn.to.nodeId === toNodeId &&
            conn.to.portIndex === toPortIndex &&
            conn.to.portType === toPortType
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
            from: { nodeId: parseInt(fromNodeId), portIndex: fromPortIndex, portType: fromPortType },
            to: { nodeId: parseInt(toNodeId), portIndex: toPortIndex, portType: toPortType },
            line: null
        };

        // 添加到connections数组
        this.connections.push(connection);

        // 更新节点连接状态
        const fromNode = this.getNode(fromNodeId);
        const toNode = this.getNode(toNodeId);

        if (fromNode) {
            fromNode.addConnection(connectionId, fromPortType, fromPortIndex);
        } else {
            throw new Error("起始节点不存在");
        }

        if (toNode) {
            toNode.addConnection(connectionId, toPortType, toPortIndex);

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
            connection.from.portType
        );

        const toPos = this.getPortDotPosition(
            connection.to.nodeId,
            connection.to.portIndex,
            connection.to.portType
        );

        console.log(`创建连接线: ${fromPos.x},${fromPos.y} -> ${toPos.x},${toPos.y}`);

        // 创建SVG路径
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('connection-path', 'permanent-connection');
        path.setAttribute('data-connection-uid', connection.uid);
        path.setAttribute('d', this.createCurvedPath(fromPos.x, fromPos.y, toPos.x, toPos.y, 'out', 'in'));

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

    // 检查端口是否已连接
    isPortConnected(nodeId, portType, portIndex) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        switch (portType) {
            case 'input':
                return node.connections.inputs[portIndex] &&
                    node.connections.inputs[portIndex].length > 0;
            case 'prop':
                return node.connections.props[portIndex] &&
                    node.connections.props[portIndex].length > 0;
            case 'output':
                return node.connections.outputs[portIndex] &&
                    node.connections.outputs[portIndex].length > 0;
        }

    }

    // 检查是否是有效的连接目标
    isValidConnectionTarget(nodeId, portType, portDirect, portIndex, portMulti = true) {
        const { nodeId: startNodeId, portType: startPortType, portDirect: startPortDirect } = this.connectionState.startInfo;

        // 基本验证
        if (nodeId === startNodeId) return false;
        if (this.isPortConnected(nodeId, portType, portIndex)) {
            if (!portMulti) {
                return false;
            }
        }

        // 输入必须连输出，输出必须连输入
        if (startPortDirect === 'in' && portDirect !== 'out') return false;
        if (startPortDirect === 'out' && portDirect !== 'in') return false;
        if (startPortDirect === 'bi' && portDirect !== 'bi') return false;

        return true;
    }

    // 创建曲线路径
    createCurvedPath(startX, startY, endX, endY, startPortDirect = 'bi', endDirect = 'bi', tempFlag = false) {
        // 计算垂直和水平距离
        const verticalDistance = Math.abs(endY - startY);
        const verticalDirect = endY - startY > 0 ? 1 : -1;
        const horizontalDistance = Math.abs(endX - startX);

        const minBoundaryOffset = 60;
        const basicBoundaryOffset = 48;
        const BoundaryOffset = Math.min(horizontalDistance * 0.4 + basicBoundaryOffset, horizontalDistance * 0.5);
        const verticalCurveFactor = 0.15; // 垂直弯曲因子，控制S型曲线的幅度
        const verticalOffset = Math.min(verticalDistance * verticalCurveFactor, 100);

        // 计算控制点
        let cp1x, cp1y, cp2x, cp2y;

        switch (startPortDirect) {
            case 'in':
                cp1x = startX - Math.max(minBoundaryOffset, BoundaryOffset);
                cp1y = startY + verticalOffset * verticalDirect;
                break;
            case 'out':
                cp1x = startX + Math.max(minBoundaryOffset, BoundaryOffset);
                cp1y = startY + verticalOffset * verticalDirect;
                break;
            case 'bi':
            default:
                cp1x = startX + Math.max(minBoundaryOffset, BoundaryOffset);
                cp1y = startY + verticalOffset * verticalDirect;
                break;
        }

        let endPortDirect = endDirect;

        if (tempFlag) {
            switch (startPortDirect) {
                case 'in':
                    endPortDirect = 'out';
                    break;
                case 'out':
                    endPortDirect = 'in';
                    break;
                case 'bi':
                default:
                    endPortDirect = 'bi';
                    break;
            }
        }

        switch (endPortDirect) {
            case 'in':
                cp2x = endX - Math.max(minBoundaryOffset, BoundaryOffset);
                cp2y = endY - verticalOffset * verticalDirect;
                break;
            case 'out':
                cp2x = endX + Math.max(minBoundaryOffset, BoundaryOffset);
                cp2y = endY - verticalOffset * verticalDirect;
                break;
            case 'bi':
            default:
                cp2x = startX + Math.max(minBoundaryOffset, BoundaryOffset);
                cp2y = startY + verticalOffset * verticalDirect;
                break;
        }

        return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

    }

    // 移除端口连接
    removePortConnection(nodeId, portType, portIndex) {
        const node = this.getNode(nodeId);
        if (!node) return;

        let connectionIds = [];

        switch (portType) {
            case 'input':
                connectionIds = node.connections.inputs[portIndex] || [];
                node.connections.inputs[portIndex] = [];
                break;
            case 'prop':
                connectionIds = node.connections.props[portIndex] || [];
                node.connections.props[portIndex] = [];
                break;
            case 'output':
                connectionIds = node.connections.outputs[portIndex] || [];
                node.connections.outputs[portIndex] = [];
                break;
            default:
                return;
        }

        console.log('连接ID: ', connectionIds);

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
            `.port-item[data-port-uid="${nodeId}-${portType}-${portIndex}"] .port-dot`
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

            node.getAllConnections().forEach(connection => {
                relatedConnectionIds.add(connection);
            })

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
    }

}


/**
 * BitmapIdGenerator 类 - 基于位图的高效ID生成器
 * 使用位图来跟踪ID的使用状态，提供高效的ID分配和释放操作
 */
class BitmapIdGenerator {
    /**
     * 构造函数
     * @param {number} maxSize - 最大ID值，默认为999999
     */
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

        this.bitmap = Uint32Array.from(bitmap);
    }

    getBitmap() {
        return this.bitmap;
    }

    reset() {
        this.bitmap.fill(0);
        this.nextId = 1;
    }
}

window.NodeManager = NodeManager;
