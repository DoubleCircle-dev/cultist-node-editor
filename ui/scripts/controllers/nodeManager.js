import { NodeGenerator } from "../generators/nodeGenerator.js";
import { NodeModel } from "../models/nodeModels/nodeModel.js";
import { BaseNodeModel } from "../models/nodeModels/baseNodeModel.js";
import { ControllerCore } from "./controllerCore.js";
import { EventBus } from "./eventBus.js";

/**
 * 节点管理器类，用于管理画布上的节点
 * 该类负责处理节点的创建、删除、更新等操作
 * @class NodeManager
 */

export class NodeManager {


    /**
     * 创建节点管理器实例
     * @param {HTMLElement} viewport - 视口元素，用于容纳节点
     * @param {HTMLElement} world - 画布元素，用于渲染节点
     * @param {EventBus} bus - 事件总线，用于管理器间的通信
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        this.idGenerator = new BitmapIdGenerator();
        this.uidGenerator = new BitmapIdGenerator();
        this.id = 'node-manager-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // 构造函数中可以初始化节点的属性和管理器所需的状态
        this.viewport = viewport;
        this.world = world;
        this.bus = bus;
        this.coreSpace = coreSpace;

        // 节点列表
        this.nodes = /**@type {map<nodeID, NodeModel>} */ new Map();

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

        // 连接线相关变量
        this.connectionState = {
            isDragging: false,
            startInfo: {
                nodeId: null,
                portId: null,
                portDirect: null,
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

        // this.handleEvent();

        this._initListeners();

        this._onEvent();
    }

    _initListeners() {
        // document.addEventListener('mousedown', this.handleClick.bind(this));
    }

    _onEvent() {
        this.bus.on('canvas:click', this.clearNodeSelected.bind(this))
    }

    get SelectedNodes() {
        const result = [];

        this.nodes.forEach((node) => {
            if (node.selected) {
                result.push(node);
            }
        })

        return result;
    }

    /**
     * @param {NodeID} id
     * @returns {NodeModel}
     */
    getNode(id) {
        // 类型检查
        if (typeof id !== 'string' && typeof id !== 'number') {
            console.error('节点UID格式不对', typeof id, id);
            return;
        }
        if (typeof id === 'string') {
            id = parseInt(id, 10);
        }

        // 检查节点是否存在
        if (!this.nodes.has(id)) {
            throw new Error(`节点 ${id} 不存在`);
        }

        return this.nodes.get(id);
    }

    addNode(type, Px, Py) {
        let id = null;
        let uid = null;
        let x = Px;
        let y = Py;
        if (!Px || !Py) {
            ({ x, y } = this.coreSpace.ViewCenter);
            x = x + Math.random() * 300 - 150;
            y = y + Math.random() * 100 - 100;

        }
        try {
            // 分配id
            id = this.idGenerator.generate();
            if (!id) {
                throw new Error('节点数量已达到最大值');
            }
            uid = this.uidGenerator.generate();

            // 创建节点视图
            const { nodeView, nodeModel } = NodeGenerator.createNode(String(id), uid, type, x, y);

            this.world.appendChild(nodeView.element);
            nodeView.onMounted();

            this._bindModelListeners(nodeModel);

            this.nodes.set(id, nodeModel);

            // this.basicActionManager.addActionToHistory('addNode');
            this.bus.emit('nodeAdded', nodeModel);

            // this.bringNodeToFront(uid);
        } catch (error) {
            console.error('添加节点失败:', error);
            if (uid) {
                this.idGenerator.release(uid);
            }
            this.bus.emit('nodeAddFailed', error);
        }
    }

    /**
     * @param {BaseNodeModel} nodeModel
     */
    _bindModelListeners(nodeModel) {

        nodeModel.addEventListener('mousedown', (/**@type {CustomEvent} */e) => {
            const originalEvent = e.detail.originalEvent;
            // 立即触发点击处理（鼠标按下时）
            this._handleNodeClick(originalEvent, nodeModel);

            // 取消选择时忽略拖动
            if (!nodeModel.selected) return;

            // 开始潜在的拖动监听
            this.bus.emit('drag-start:node', {originalEvent});
        });

    }

    _handleNodeClick(e, model) {
        // 监听鼠标选中事件
        if (e.ctrlKey || e.metaKey) {
            // 多选模式：切换当前节点的选中状态，不改变其他
            this.toggleNodeSelected(model);
        } else {
            // 单选模式：选中当前节点，清除其他
            this.setNodeSelected(model, true)
        }
    }

    clearNodeSelected() {
        Array.from(this.nodes.values()).forEach(node => {
            if (node.selected) node.setSelected(false);
        });
    }

    setNodeSelected(node, clearOthers = true) {

        if (clearOthers) {
            this.clearNodeSelected();
        }

        if (!node.selected) {
            node.setSelected(true);
        } else {
            node.setSelected(false);
        }
    }

    toggleNodeSelected(node) {
        if (!node) return;

        if (node.selected) {
            node.setSelected(false);
        } else {
            node.setSelected(true);
            
        }
    }

    // handleEvent() {
    //     this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
    //     this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
    //     this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
    //     this.canvas.addEventListener('change', this.handleCanvasChange.bind(this));

    // }

    // shouldIgnoreClick(target) {
    //     return NodeManager.ignoreItem.some((item) => target.closest(item));
    // }

    // // 处理画布点击事件
    // handleCanvasClick(e) {

    //     if (this.shouldIgnoreClick(e.target)) {
    //         return;
    //     }
    //     const nodeElement = e.target.closest('.node');

    //     // 如果在节点上点击
    //     if (nodeElement) {
    //         // 如果不是多选（ctrl未按下）
    //         if (!e.ctrlKey) {
    //             document.querySelectorAll('.node').forEach((n) => n.classList.remove('selected'));
    //         }

    //         // 选中节点
    //         nodeElement.classList.add('selected');
    //         this.bringNodeToFront(nodeElement.uid);

    //         // 更新连接线样式
    //         this.updateSelectedNodesConnections();

    //         // 获取焦点，使节点可以接收键盘事件
    //         nodeElement.focus({ preventScroll: true });
    //     } else {
    //         // 如果点击的是画布空白处，取消选中所有节点
    //         document.querySelectorAll('.node').forEach((n) => n.classList.remove('selected'));
    //         // 取消焦点，使节点无法接收键盘事件
    //         document.querySelectorAll('.node').forEach((n) => n.blur());

    //         // 清除所有连接线高亮
    //         this.clearConnectionHighlights();
    //     }
    //     return;

    // }

    // // === 右键菜单功能 ===

    // // 处理右键菜单事件
    // handleContextMenu(e) {
    //     const nodeElement = e.target.closest('.node');
    //     if (nodeElement) {
    //         e.preventDefault(); // 阻止默认右键菜单
    //         const nodeId = parseInt(nodeElement.uid);
    //         this.showNodeContextMenu(nodeId, e.clientX, e.clientY);
    //     } else {
    //         // 如果点击的是画布空白处，隐藏右键菜单
    //         this.hideNodeContextMenu();
    //     }
    // }

    // // 创建节点的右键菜单
    // createNodeContextMenu() {
    //     const menu = document.createElement('div');
    //     menu.className = 'node-context-menu';
    //     menu.innerHTML = `
    //     <div class="context-menu-item" data-action="delete">
    //         <span class="menu-icon">🗑️</span>
    //         <span class="menu-text">删除节点</span>
    //     </div>
    //     `;

    //     // 添加菜单项点击事件
    //     menu.addEventListener('click', (e) => {
    //         e.preventDefault();
    //         e.stopPropagation();

    //         const menuItem = e.target.closest('.context-menu-item');
    //         if (menuItem) {
    //             const action = menuItem.dataset.action;
    //             const nodeId = menu.dataset.nodeId;

    //             if (action === 'delete' && nodeId) {

    //                 // 先关闭菜单
    //                 this.hideNodeContextMenu();

    //                 // 删除操作
    //                 this.deleteNode(nodeId);
    //             }
    //         } else {
    //             this.hideNodeContextMenu();
    //         }
    //     });

    //     // 点击其他地方关闭菜单
    //     document.addEventListener('click', (e) => {
    //         if (!menu.contains(e.target)) {
    //             this.hideNodeContextMenu();
    //         }
    //     });

    //     document.body.appendChild(menu);
    //     return menu;
    // }

    // // 显示节点的右键菜单
    // showNodeContextMenu(nodeId, x, y) {
    //     let menu = document.querySelector('.node-context-menu');
    //     if (!menu) {
    //         menu = this.createNodeContextMenu();
    //     }

    //     menu.dataset.nodeId = nodeId;
    //     menu.style.display = 'block';

    //     // 确保菜单在视口内
    //     const menuWidth = menu.offsetWidth || 150;
    //     const menuHeight = menu.offsetHeight || 40;

    //     const viewportWidth = window.innerWidth;
    //     const viewportHeight = window.innerHeight;

    //     let finalX = x;
    //     let finalY = y;

    //     // 防止菜单超出右边界
    //     if (x + menuWidth > viewportWidth) {
    //         finalX = x - menuWidth;
    //     }

    //     // 防止菜单超出下边界
    //     if (y + menuHeight > viewportHeight) {
    //         finalY = y - menuHeight;
    //     }

    //     menu.style.left = `${finalX}px`;
    //     menu.style.top = `${finalY}px`;
    // }

    // // 隐藏节点的右键菜单
    // hideNodeContextMenu() {
    //     const menu = document.querySelector('.node-context-menu');
    //     if (menu) {
    //         menu.style.display = 'none';
    //     }
    // }

    // // 处理鼠标按下事件
    // handleCanvasMouseDown(e) {
    //     const portElement = e.target.closest('.port-item');

    //     if (e.button === 2) { // 右键点击
    //         if (portElement) {
    //             this.showConnectionInfo(portElement);
    //             return;
    //         }

    //         this.handleContextMenu(e);
    //         return;
    //     }
    //     const portDotElement = e.target.closest('.port-dot');
    //     const nodeElement = e.target.closest('.node');

    //     if (portDotElement) {

    //         if (portElement) {
    //             this.startPortDrag(e, portElement, nodeElement.uid);
    //         } else {
    //             throw new Error('端口未正确初始化：portElement为空');
    //         }
    //     }
    //     if (nodeElement) {
    //         const nodeId = parseInt(nodeElement.uid);
    //         if (!nodeElement.locked) {
    //             if (this.shouldIgnoreDrag(e.target)) {
    //                 return;
    //             }
    //         }

    //         this.startDrag(e, nodeId);
    //         return;
    //     }
    //     else {
    //         // 如果点击的是画布空白处，取消选中所有节点
    //         document.querySelectorAll('.node').forEach((n) => n.classList.remove('selected'));
    //     }


    // }

    // // === 拖拽功能实现 ===

    // // 检查是否应该忽略拖拽
    // shouldIgnoreDrag(target) {
    //     return NodeManager.ignoreDragItem.some((item) => target.closest(item));
    // }

    // // 开始拖拽
    // startDrag(event, nodeId) {
    //     event.preventDefault();
    //     event.stopPropagation();

    //     const node = this.getNode(nodeId);
    //     if (!node) return;

    //     // 获取节点当前位置
    //     const offsetPosition = viewportToCanvas(this.viewport, event.clientX, event.clientY, this.transform);

    //     // 记录拖拽状态

    //     // 计算鼠标相对于节点的偏移
    //     this.dragState = {
    //         isDragging: true,
    //         nodeId: nodeId,
    //         offsetX: offsetPosition.x - node.x,
    //         offsetY: offsetPosition.y - node.y,
    //         initialX: node.x,
    //         initialY: node.y,
    //         draggedNode: node
    //     };

    //     node.element.classList.add('selected');

    //     // 获取焦点，使节点可以接收键盘事件
    //     node.element.focus({ preventScroll: true });

    //     // 添加拖拽样式
    //     node.element.classList.add('dragging');

    //     // 将节点置于顶层
    //     this.bringNodeToFront(nodeId);

    //     // 添加全局事件监听
    //     document.addEventListener('mousemove', this.handleDrag.bind(this));
    //     document.addEventListener('mouseup', this.stopDrag.bind(this));

    //     this.updateStatus(`拖动节点: ${node.config.title} #${nodeId}`);
    // }

    // // 处理拖拽
    // handleDrag(event) {
    //     if (!this.dragState.isDragging || !this.dragState.draggedNode) return;

    //     event.preventDefault();

    //     const node = this.dragState.draggedNode;

    //     // 计算新位置
    //     const newPosition = viewportToCanvas(this.viewport, event.clientX, event.clientY, this.transform);
    //     const newX = newPosition.x - this.dragState.offsetX;
    //     const newY = newPosition.y - this.dragState.offsetY;

    //     // // 边界检查
    //     // newX = Math.max(0, Math.min(newX, canvas.clientWidth - node.element.offsetWidth));
    //     // newY = Math.max(0, Math.min(newY, canvas.clientHeight - node.element.offsetHeight));

    //     // 更新节点位置
    //     node.x = newX;
    //     node.y = newY;

    //     // 更新DOM元素位置
    //     node.element.style.left = newX + 'px';
    //     node.element.style.top = newY + 'px';

    //     // 实时更新连接线位置
    //     this.updateNodeConnections(node.uid);

    // }

    // // 停止拖拽
    // stopDrag(event) {
    //     if (!this.dragState.isDragging) return;

    //     const node = this.dragState.draggedNode;
    //     if (node) {
    //         node.element.classList.remove('dragging');

    //         // 检查位置是否有变化
    //         const moved = node.x !== this.dragState.initialX || node.y !== this.dragState.initialY;
    //         if (moved) {
    //             updateStatus(`移动节点到: (${Math.round(node.x)}, ${Math.round(node.y)})`);
    //         }
    //     }

    //     // 重置拖拽状态
    //     this.dragState = {
    //         isDragging: false,
    //         nodeId: null,
    //         offsetX: 0,
    //         offsetY: 0,
    //         initialX: 0,
    //         initialY: 0,
    //         draggedNode: null
    //     };

    //     // 移除事件监听
    //     document.removeEventListener('mousemove', this.handleDrag);
    //     document.removeEventListener('mouseup', this.stopDrag);
    // }

    // // 更新单个连接线的位置
    // updateConnectionPosition(connection) {
    //     if (!connection) return;

    //     const path = connection.line || document.querySelector(`.connection-path[data-connection-id="${connection.id}"]`);
    //     if (!path) return;

    //     const fromNode = this.getNode(connection.fromNodeId);
    //     const toNode = this.getNode(connection.toNodeId);

    //     if (!fromNode || !toNode) return;

    //     // 获取端口位置
    //     const fromPos = this.getPortDotPosition(connection.fromNodeId, connection.fromPortId);
    //     const toPos = this.getPortDotPosition(connection.toNodeId, connection.toPortId);

    //     // 更新路径
    //     const newPath = this.createCurvedPath(fromPos.x, fromPos.y, toPos.x, toPos.y, 'out', 'in');
    //     path.setAttribute('d', newPath);

    //     // 更新连接对象的line引用
    //     connection.line = path;
    // }

    // // 更新节点的所有连接线
    // updateNodeConnections(nodeId) {
    //     const node = this.getNode(nodeId);
    //     if (!node) return;

    //     // 收集所有需要更新的连接线
    //     const connectionsToUpdate = node.getAllConnections();

    //     // 更新所有相关连接线
    //     connectionsToUpdate.forEach(connection => {
    //         this.updateConnectionPosition(connection);
    //     });
    // }

    // // 将节点置于顶层
    // bringNodeToFront(nodeId) {
    //     const node = this.getNode(nodeId);
    //     if (!node || !node.element) return;

    //     // 获取当前最大z-index
    //     const allNodes = Array.from(document.querySelectorAll('.node'));
    //     const maxZIndex = Math.max(...allNodes.map(n =>
    //         parseInt(window.getComputedStyle(n).zIndex) || 0
    //     ), 1000);

    //     // 设置新的z-index
    //     node.element.style.zIndex = maxZIndex + 1;
    // }

    // // 删除节点
    // deleteNode(nodeId) {
    //     this.updateStatus(`删除节点中... `);
    //     if (typeof nodeId !== 'number' && typeof nodeId !== 'string') {
    //         console.error('无效的节点ID:', nodeId);
    //         return;
    //     }
    //     if (typeof nodeId == 'string') {
    //         nodeId = parseInt(nodeId);
    //     }

    //     const node = this.getNode(nodeId);
    //     if (!node) {
    //         console.error('未找到节点:', nodeId);
    //         this.updateStatus(`删除失败: 未找到节点 ${nodeId}`);
    //         return;
    //     }

    //     // 从DOM中移除节点
    //     if (node.element && node.element.parentNode) {
    //         node.element.parentNode.removeChild(node.element);
    //     }

    //     // 从connections中移除连接线
    //     const connectionsToRemove = this.connections.filter(conn =>
    //         conn.from.nodeId === nodeId || conn.to.nodeId === nodeId
    //     );
    //     connectionsToRemove.forEach(conn => {
    //         this.removeConnection(conn.uid);
    //     });
    //     // 从nodes集合中移除
    //     this.nodes.delete(nodeId);
    //     this.idGenerator.release(nodeId);


    //     this.updateStatus(`已删除节点: ${node.config.title} #${nodeId}`);
    // }

    // 删除所有节点
    clear() {
        this.nodes.clear();
        this.connections = [];
        this.idGenerator.reset();
        this.highlightCache = {
            highlightedNodes: new Set(),
            dimmedConnections: new Set()
        };

        const test_nodes = this.world.querySelectorAll(".test-node");
        test_nodes.forEach((node) => node.remove());
        const nodes = this.world.querySelectorAll(".node");
        nodes.forEach((node) => node.remove());
        const connections = this.world.querySelectorAll(".connection-path");
        connections.forEach((connection) => connection.remove());

        this.bus.emit('清理完毕');

    }

    // // === 连接线功能实现 ===

    // // 获取端口圆点位置
    // getPortDotPosition(nodeId, portId) {
    //     const node = this.getNode(nodeId)
    //     if (!node) {
    //         console.error(`找不到节点 ${nodeId}`);
    //     }

    //     const port = node.getPort(portId);
    //     if (!port) {
    //         // 如果找不到端口，终止连接
    //         console.error(`找不到节点 ${nodeId} 的端口 ${portIndex} (${type})`);
    //         return null;
    //     }

    //     const portDot = port.querySelector('.port-dot');
    //     if (!portDot) {
    //         console.error(`找不到节点 ${nodeId} 的端口 ${portIndex} 的圆点`);
    //         return null;
    //     }

    //     const portDotRect = portDot.getBoundingClientRect();

    //     const portX = portDotRect.left + portDotRect.width / 2;
    //     const portY = portDotRect.top + portDotRect.height / 2;

    //     return viewportToCanvas(this.viewport, portX, portY, this.transform);

    // }

    // // 开始端口拖拽
    // startPortDrag(event, portElement, nodeId) {
    //     event.preventDefault();
    //     event.stopPropagation();
    //     const node = this.getNode(nodeId);
    //     if (!node) return;

    //     console.log(`开始建立连接 起始端口${portElement.dataset.portId}`);


    //     try {
    //         // 检查端口是否已连接
    //         if (this.isPortConnected(nodeId, portElement.dataset.portId)) {

    //             // 检查端口是否允许多连
    //             if (!portElement.dataset.portMulti) {
    //                 this.updateStatus(`端口 ${portElement.dataset.portId} 已达到连接上限，不能连接`);
    //                 return;
    //             };

    //         }

    //         // 设置拖拽状态
    //         this.connectionState.isDragging = true;
    //         this.connectionState.startInfo.nodeId = nodeId;
    //         this.connectionState.startInfo.portDirect = portElement.dataset.portDirect;
    //         this.connectionState.startInfo.portId = portElement.dataset.portId;
    //         this.connectionState.currentPortElement = portElement;

    //         // 添加拖拽样式
    //         portElement.classList.add('port-dragging');

    //         // 创建临时连接线
    //         this.createTempLine(event);

    //         // 绑定全局事件
    //         document.addEventListener('mousemove', this.handlePortDragMove.bind(this));
    //         document.addEventListener('mouseup', this.handlePortDragEnd.bind(this));
    //     } catch (error) {
    //         console.error('Error starting port drag:', error);
    //         this.cleanupPortDrag();
    //     }



    // }

    // // 创建临时连接线
    // createTempLine(event) {
    //     if (!this.svg) {
    //         console.error('找不到连接线SVG容器');
    //         return;
    //     }

    //     // 获取起始端口位置
    //     const { nodeId, portId, portDirect } = this.connectionState.startInfo;

    //     const startPos = this.getPortDotPosition(nodeId, portId);

    //     // 创建SVG路径
    //     const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    //     tempLine.uid = 'temp-connection-line';
    //     tempLine.classList.add('connection-path', 'temp-connection');

    //     // 初始路径

    //     const endPosition = viewportToCanvas(this.viewport, event.clientX, event.clientY, this.transform);

    //     const path = this.createCurvedPath(startPos.x, startPos.y, endPosition.x, endPosition.y, portDirect, null, true);
    //     tempLine.setAttribute('d', path);

    //     this.svg.appendChild(tempLine);
    //     this.connectionState.tempLine = tempLine;
    // }

    // // 创建连接线SVG容器（如果不存在）
    // createConnectionsSvg() {
    //     let svg = this.canvas.querySelector('svg');
    //     if (!svg) {
    //         svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    //         svg.id = 'connections-svg';
    //         this.canvas.appendChild(svg);
    //     }
    //     return svg;
    // }

    // // 处理拖拽移动
    // handlePortDragMove(event) {
    //     if (!this.connectionState.isDragging || !this.connectionState.tempLine) return;

    //     try {
    //         // 获取起始端口位置
    //         const { nodeId, portId, portDirect } = this.connectionState.startInfo;
    //         const startPos = this.getPortDotPosition(nodeId, portId, portDirect);
    //         // 更新临时连接线

    //         // 获取当前鼠标位置 
    //         const endPosition = viewportToCanvas(this.viewport, event.clientX, event.clientY, this.transform);

    //         // 更新临时连接线
    //         const path = this.createCurvedPath(startPos.x, startPos.y, endPosition.x, endPosition.y, portDirect, null, true);
    //         this.connectionState.tempLine.setAttribute('d', path);

    //         // 检查并高亮悬停的端口
    //         this.checkHoveredPorts(event);
    //     } catch (error) {
    //         console.error('处理拖拽移动时出错：', error, error.cause);
    //         this.cleanupPortDrag();
    //     }


    // }

    // // 处理拖拽结束
    // handlePortDragEnd(event) {
    //     if (!this.connectionState.isDragging) return;

    //     const targetPort = this.findTargetPort(event);

    //     if (targetPort) {
    //         // 尝试创建连接
    //         this.tryCreateConnection(targetPort);
    //     }

    //     // 清理拖拽状态
    //     this.cleanupPortDrag();
    // }

    // // 查找目标端口
    // findTargetPort(event) {
    //     const elements = document.elementsFromPoint(event.clientX, event.clientY);

    //     for (const element of elements) {
    //         const portItem = element.closest('.port-item');
    //         if (!portItem) continue;

    //         const { nodeId, portDirect, portId, portMulti } = portItem.dataset;

    //         // 不能连接到同一节点
    //         if (nodeId === this.connectionState.startInfo.nodeId) continue;

    //         // 检查是否是有效的连接目标
    //         if (this.isValidConnectionTarget(nodeId, portDirect, portId, portMulti)) {
    //             return portItem;
    //         }
    //     }

    //     return null;
    // }

    // // 检查悬停的端口
    // checkHoveredPorts(event) {
    //     // 清除之前的高亮
    //     this.clearHighlights();

    //     const elements = document.elementsFromPoint(event.clientX, event.clientY);

    //     for (const element of elements) {
    //         const portItem = element.closest('.port-item');
    //         if (!portItem) continue;

    //         const { nodeId, portId, portDirect, portMulti } = portItem.dataset;

    //         // 检查是否可以连接
    //         if (this.isValidConnectionTarget(nodeId, portDirect, portId, portMulti)) {
    //             portItem.classList.add('port-highlight');
    //             this.connectionState.highlightedPorts.add(portItem);
    //             break; // 只高亮最上面的一个
    //         }
    //     }
    // }

    // // 清除高亮
    // clearHighlights() {
    //     this.connectionState.highlightedPorts.forEach(port => {
    //         port.classList.remove('port-highlight');
    //     });
    //     this.connectionState.highlightedPorts.clear();
    // }

    // // 尝试创建连接
    // tryCreateConnection(targetPort) {
    //     try {
    //         if (targetPort.dataset.requireType) {
    //             if (targetPort.dataset.requireType !== this.getNode(this.connectionState.startInfo.nodeId).type) {
    //                 this.updateStatus('连接类型不匹配');
    //                 console.log(`连接类型不匹配: ${this.getNode(this.connectionState.startInfo.nodeId).type} → ${targetPort.requireType}`);
    //                 return;
    //             }

    //         }

    //         const { nodeId: targetNodeId, portDirect: targetPortDirect, portId: targetPortId } = targetPort.dataset;
    //         const { nodeId: startNodeId, portDirect: startPortDirect, portId: startPortId } = this.connectionState.startInfo;

    //         // 确定连接方向
    //         let fromNodeId, fromPortId, toNodeId, toPortId;

    //         if (startPortDirect === targetPortDirect) {
    //             if (startPortDirect !== 'bi') {
    //                 console.error(`端口方向不匹配: ${startPortDirect} → ${targetPortDirect}`);
    //                 return;
    //             }
    //         }

    //         if (startPortDirect === 'out') {
    //             fromNodeId = startNodeId;
    //             fromPortId = startPortId;
    //             toNodeId = targetNodeId;
    //             toPortId = targetPortId;
    //         } else {
    //             fromNodeId = targetNodeId;
    //             fromPortId = targetPortId;
    //             toNodeId = startNodeId;
    //             toPortId = startPortId;
    //         }

    //         console.log(`尝试连接: ${fromNodeId}:${fromPortId} → ${toNodeId}:${toPortId}`);


    //         // 创建连接
    //         this.createConnection(fromNodeId, fromPortId, toNodeId, toPortId);

    //     } catch (error) {
    //         console.error('尝试创建连接时出错：', error);
    //     }


    // }

    // // 创建永久连接
    // createConnection(fromNodeId, fromPortId, toNodeId, toPortId) {

    //     try {
    //         // 创建连接对象
    //         const connectionId = `conn-${Date.now()}+${fromNodeId}+${fromPortId}+${toNodeId}+${toPortId}`;
    //         const connection = new Connection(connectionId, fromNodeId, fromPortId, toNodeId, toPortId);


    //         // 检查连接是否已存在
    //         const existingConnection = this.connections.find(conn =>
    //             conn == connection
    //         );

    //         if (existingConnection) {
    //             this.updateStatus('连接已存在');
    //             return;
    //         }

    //         // 添加到connections数组
    //         this.connections.push(connection);

    //         // 更新节点连接状态
    //         const fromNode = this.getNode(fromNodeId);
    //         const toNode = this.getNode(toNodeId);

    //         if (fromNode) {
    //             fromNode.addConnection(connection);
    //             fromNode.getPort(fromPortId).classList.add('connected');
    //         } else {
    //             this.connections.pop();
    //             throw new Error("起始节点不存在");
    //         }

    //         if (toNode) {
    //             toNode.addConnection(connection);
    //             toNode.getPort(toPortId).classList.add('connected');
    //         } else {
    //             this.connections.pop();
    //             throw new Error("终点节点不存在");
    //         }

    //         // 创建连接线
    //         this.createConnectionLine(connection);

    //         // 更新端口样式
    //         this.updatePortStyles();

    //         // 更新连接线高亮
    //         this.updateSelectedNodesConnections();

    //         this.updateStatus(`已连接: ${fromNode.config.title} → ${toNode.config.title}`);
    //     } catch (error) {
    //         console.error('创建连接时出错：', error);
    //         this.cleanupPortDrag()
    //     }


    // }

    // // 创建连接线SVG
    // createConnectionLine(connection) {
    //     // 获取节点和端口位置
    //     const fromNode = this.getNode(connection.fromNodeId);
    //     const toNode = this.getNode(connection.toNodeId);

    //     if (!fromNode || !toNode) {
    //         console.error('创建连接线失败：节点不存在', connection);
    //         throw new Error("节点不存在");
    //     }
    //     const fromPos = this.getPortDotPosition(
    //         connection.fromNodeId,
    //         connection.fromPortId,
    //     );

    //     const toPos = this.getPortDotPosition(
    //         connection.toNodeId,
    //         connection.toPortId,
    //     );

    //     console.log(`创建连接线: ${fromPos.x},${fromPos.y} -> ${toPos.x},${toPos.y}`);

    //     // 创建SVG路径
    //     const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    //     path.classList.add('connection-path', 'permanent-connection');
    //     path.setAttribute('data-connection-uid', connection.uid);
    //     path.setAttribute('d', this.createCurvedPath(fromPos.x, fromPos.y, toPos.x, toPos.y, 'out', 'in'));

    //     // 添加悬停效果
    //     path.addEventListener('mouseenter', () => {
    //         path.classList.add('connection-hover');
    //     });

    //     path.addEventListener('mouseleave', () => {
    //         path.classList.remove('connection-hover');
    //     });

    //     // 双击断开连接
    //     path.addEventListener('dblclick', (e) => {
    //         e.stopPropagation();
    //         this.removeConnection(connection.id);
    //     });

    //     this.svg.appendChild(path);
    //     connection.line = path;
    // }

    // // 清理拖拽状态
    // cleanupPortDrag() {
    //     // 移除临时连接线
    //     if (this.connectionState.tempLine) {
    //         this.connectionState.tempLine.remove();
    //         this.connectionState.tempLine = null;
    //     }

    //     // 移除拖拽样式
    //     if (this.connectionState.currentPortElement) {
    //         this.connectionState.currentPortElement.classList.remove('port-dragging');
    //     }

    //     // 清除高亮
    //     this.clearHighlights();

    //     // 移除全局事件监听
    //     document.removeEventListener('mousemove', this.handlePortDragMove.bind(this));
    //     document.removeEventListener('mouseup', this.handlePortDragEnd.bind(this));

    //     // 重置状态
    //     this.connectionState.isDragging = false;
    //     this.connectionState.startInfo = {
    //         nodeId: null,
    //         portId: null,
    //         portDirect: null,
    //     },
    //         this.connectionState.currentPortElement = null;
    // }

    // // 检查端口是否已连接
    // isPortConnected(nodeId, portId) {

    //     const node = this.getNode(nodeId);
    //     if (!node) {
    //         console.error('节点不存在', nodeId);
    //         return false;
    //     }

    //     const port = node.getPort(portId);
    //     if (!port) {
    //         console.error('端口不存在', nodeId, portId);
    //         return false;
    //     }

    //     return port.dataset.portConnected;

    // }

    // // 检查是否是有效的连接目标
    // isValidConnectionTarget(nodeId, portDirect, portId, portMulti = true) {
    //     const { nodeId: startNodeId, portDirect: startPortDirect } = this.connectionState.startInfo;

    //     // 基本验证
    //     if (nodeId === startNodeId) return false;
    //     if (this.isPortConnected(nodeId, portId)) {
    //         if (!portMulti) {
    //             return false;
    //         }
    //     }

    //     // 输入必须连输出，输出必须连输入
    //     if (startPortDirect === 'in' && portDirect !== 'out') return false;
    //     if (startPortDirect === 'out' && portDirect !== 'in') return false;
    //     if (startPortDirect === 'bi' && portDirect !== 'bi') return false;

    //     return true;
    // }

    // // 创建曲线路径
    // createCurvedPath(startX, startY, endX, endY, startPortDirect = 'bi', endDirect = 'bi', tempFlag = false) {
    //     // 计算垂直和水平距离
    //     const verticalDistance = Math.abs(endY - startY);
    //     const verticalDirect = endY - startY > 0 ? 1 : -1;
    //     const horizontalDistance = Math.abs(endX - startX);

    //     const minBoundaryOffset = 60;
    //     const basicBoundaryOffset = 48;
    //     const BoundaryOffset = Math.min(horizontalDistance * 0.4 + basicBoundaryOffset, horizontalDistance * 0.5);
    //     const verticalCurveFactor = 0.15; // 垂直弯曲因子，控制S型曲线的幅度
    //     const verticalOffset = Math.min(verticalDistance * verticalCurveFactor, 100);

    //     // 计算控制点
    //     let cp1x, cp1y, cp2x, cp2y;

    //     switch (startPortDirect) {
    //         case 'in':
    //             cp1x = startX - Math.max(minBoundaryOffset, BoundaryOffset);
    //             cp1y = startY + verticalOffset * verticalDirect;
    //             break;
    //         case 'out':
    //             cp1x = startX + Math.max(minBoundaryOffset, BoundaryOffset);
    //             cp1y = startY + verticalOffset * verticalDirect;
    //             break;
    //         case 'bi':
    //         default:
    //             cp1x = startX + Math.max(minBoundaryOffset, BoundaryOffset);
    //             cp1y = startY + verticalOffset * verticalDirect;
    //             break;
    //     }

    //     let endPortDirect = endDirect;

    //     if (tempFlag) {
    //         switch (startPortDirect) {
    //             case 'in':
    //                 endPortDirect = 'out';
    //                 break;
    //             case 'out':
    //                 endPortDirect = 'in';
    //                 break;
    //             case 'bi':
    //             default:
    //                 endPortDirect = 'bi';
    //                 break;
    //         }
    //     }

    //     switch (endPortDirect) {
    //         case 'in':
    //             cp2x = endX - Math.max(minBoundaryOffset, BoundaryOffset);
    //             cp2y = endY - verticalOffset * verticalDirect;
    //             break;
    //         case 'out':
    //             cp2x = endX + Math.max(minBoundaryOffset, BoundaryOffset);
    //             cp2y = endY - verticalOffset * verticalDirect;
    //             break;
    //         case 'bi':
    //         default:
    //             cp2x = startX + Math.max(minBoundaryOffset, BoundaryOffset);
    //             cp2y = startY + verticalOffset * verticalDirect;
    //             break;
    //     }

    //     return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

    // }

    // // 移除端口连接
    // removePortConnection(nodeId, portType, portIndex) {
    //     const node = this.getNode(nodeId);
    //     if (!node) return;

    //     let connectionIds = [];

    //     switch (portType) {
    //         case 'input':
    //             connectionIds = node.connections.inputs[portIndex] || [];
    //             node.connections.inputs[portIndex] = [];
    //             break;
    //         case 'prop':
    //             connectionIds = node.connections.props[portIndex] || [];
    //             node.connections.props[portIndex] = [];
    //             break;
    //         case 'output':
    //             connectionIds = node.connections.outputs[portIndex] || [];
    //             node.connections.outputs[portIndex] = [];
    //             break;
    //         default:
    //             return;
    //     }

    //     console.log('连接ID: ', connectionIds);

    //     // 移除所有相关连接
    //     connectionIds.forEach(connectionId => {
    //         this.removeConnection(connectionId);
    //     });

    //     this.updateStatus(`已删除连接`);
    // }

    // // 移除连接
    // removeConnection(connectionId) {
    //     // 从connections数组中查找并移除
    //     const connectionIndex = this.connections.findIndex(conn => conn.uid === connectionId);
    //     if (connectionIndex === -1) return;

    //     const connection = this.connections[connectionIndex];

    //     // 从节点连接中移除
    //     const fromNode = this.getNode(connection.from.nodeId);
    //     const toNode = this.getNode(connection.to.nodeId);

    //     if (fromNode) {
    //         const outputIndex = fromNode.connections.outputs[connection.from.portIndex]
    //             ?.indexOf(connectionId);
    //         if (outputIndex > -1) {
    //             fromNode.connections.outputs[connection.from.portIndex].splice(outputIndex, 1);
    //         }
    //     }

    //     if (toNode) {
    //         const inputIndex = toNode.connections.inputs[connection.to.portIndex]
    //             ?.indexOf(connectionId);
    //         if (inputIndex > -1) {
    //             toNode.connections.inputs[connection.to.portIndex].splice(inputIndex, 1);
    //         }
    //     }

    //     // 移除连接线
    //     if (connection.line && connection.line.parentNode) {
    //         connection.line.parentNode.removeChild(connection.line);
    //     }

    //     // 从数组中移除
    //     this.connections.splice(connectionIndex, 1);

    //     // 更新端口样式
    //     this.updatePortStyles();

    //     // 更新连接线高亮
    //     this.updateSelectedNodesConnections();

    //     this.updateStatus(`已断开连接`);
    // }

    // // 显示连接信息
    // showConnectionInfo(nodeId, portType, portIndex) {
    //     const node = this.getNode(nodeId);
    //     if (!node) return;

    //     const connectionIds = portType === 'input'
    //         ? node.connections.inputs[portIndex] || []
    //         : node.connections.outputs[portIndex] || [];

    //     if (connectionIds.length > 0) {
    //         let info = `连接信息: `;
    //         connectionIds.forEach((connId, index) => {
    //             const connection = this.connections.find(conn => conn.uid === connId);
    //             if (connection) {
    //                 const fromNode = this.getNode(connection.from.nodeId);
    //                 const toNode = this.getNode(connection.to.nodeId);
    //                 if (fromNode && toNode) {
    //                     info += `${fromNode.config.title} → ${toNode.config.title}`;
    //                     if (index < connectionIds.length - 1) info += ', ';
    //                 }
    //             }
    //         });
    //         this.updateStatus(info);
    //     }
    // }

    // // 更新端口样式
    // updatePortStyles() {
    //     // 先清除所有连接样式
    //     document.querySelectorAll('.port-dot').forEach(dot => {
    //         dot.classList.remove('connected');
    //     });

    //     // 为所有连接的端口添加样式
    //     this.connections.forEach(connection => {
    //         const fromPort = this.getNode(connection.fromNodeId).getPort(connection.fromPortId);
    //         const toPort = this.getNode(connection.toNodeId).getPort(connection.toPortId);

    //         if (fromPort) fromPort.classList.add('connected');
    //         if (toPort) toPort.classList.add('connected');
    //     });
    // }

    // // 查找端口元素
    // findPortElement(nodeId, portType, portIndex) {
    //     const node = this.nodes.get(nodeId);
    //     if (!node || !node.element) return null;

    //     return node.element.querySelector(
    //         `.port-item[data-port-uid="${nodeId}-${portType}-${portIndex}"] .port-dot`
    //     );
    // }

    // // === 连接线高亮功能 ===

    // /**
    //  * 高亮节点相关的所有连接线
    //  * @param {number} nodeId - 节点ID
    //  */
    // highlightNodeConnections(nodeId) {
    //     // 移除所有连接线的高亮和淡化样式
    //     this.clearConnectionHighlights();

    //     // 获取节点
    //     const node = this.getNode(nodeId);
    //     if (!node) return;

    //     // 淡化所有连接线
    //     this.dimAllConnections();

    //     node.getAllConnections().forEach(connection => {
    //         const path = connection.line || document.querySelector(`.connection-path[data-connection-id="${connection.id}"]`);
    //         if (path) {
    //             path.classList.add('highlighted');
    //             path.classList.remove('dimmed');
    //         }
    //     })

    //     // this.updateStatus(`已高亮显示节点 ${node.config.title} 的连接线`);
    // }

    // /**
    //  * 淡化非相关的连接线
    //  * @param {Array} highlightedConnectionIds - 高亮连接线ID数组
    //  */
    // dimOtherConnections(highlightedConnectionIds) {
    //     const allPaths = document.querySelectorAll('.connection-path');
    //     allPaths.forEach(path => {
    //         const connectionId = path.getAttribute('data-connection-uid');
    //         if (connectionId && !highlightedConnectionIds.includes(connectionId)) {
    //             path.classList.add('dimmed');
    //             path.classList.remove('highlighted');
    //         }
    //     });
    // }

    // dimAllConnections() {
    //     const allPaths = document.querySelectorAll('.connection-path');
    //     allPaths.forEach(path => {
    //         path.classList.add('dimmed');
    //         path.classList.remove('highlighted');
    //     })
    // }


    // /**
    //  * 清除所有连接线的高亮和淡化样式
    //  */
    // clearConnectionHighlights() {
    //     const allPaths = document.querySelectorAll('.connection-path');
    //     allPaths.forEach(path => {
    //         path.classList.remove('highlighted');
    //         path.classList.remove('dimmed');
    //     });
    // }

    // /**
    //  * 更新多个选中节点的连接线高亮
    //  */
    // updateSelectedNodesConnections() {
    //     // 获取所有选中的节点
    //     const selectedNodes = document.querySelectorAll('.node.selected');

    //     this.clearConnectionHighlights();

    //     // 如果没有选中的节点，清除所有高亮
    //     if (selectedNodes.length === 0) {
    //         return;
    //     }


    //     // 遍历每个选中的节点
    //     selectedNodes.forEach(nodeElement => {
    //         const nodeId = parseInt(nodeElement.uid);
    //         const node = this.getNode(nodeId);
    //         if (!node) return;

    //         node.getAllConnections().forEach(connection => {
    //             const path = connection.line || document.querySelector(`.connection-path[data-connection-id="${connection.id}"]`);
    //             if (path) {
    //                 path.classList.add('highlighted');
    //                 path.classList.remove('dimmed');
    //             }
    //         })

    //     });

    // }

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

