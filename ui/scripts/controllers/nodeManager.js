import { NodeGenerator } from "../generators/nodeGenerator.js";
import { NodeModel } from "../models/nodeModels/nodeModel.js";
import { BaseNodeModel } from "../models/nodeModels/baseNodeModel.js";
import { ControllerCore } from "./controllerCore.js";
import { EventBus } from "./eventBus.js";
import { IManager } from "./manager.js";

/**
 * 节点管理器类，用于管理画布上的节点
 * 该类负责处理节点的创建、删除、更新等操作
 * @class NodeManager
 */

export class NodeManager extends IManager {

    /**
     * 创建节点管理器实例
     * @param {HTMLElement} viewport - 视口元素，用于容纳节点
     * @param {HTMLElement} world - 画布元素，用于渲染节点
     * @param {EventBus} bus - 事件总线，用于管理器间的通信
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus,viewport,world,coreSpace);

        this.idGenerator = new BitmapIdGenerator();
        this.uidGenerator = new BitmapIdGenerator();

        // 节点列表
        this.nodes = /**@type {map<nodeID, NodeModel>} */ new Map();
        this.maxIndex = 0;

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

            const selectedNodes = [];
            this.nodes.forEach(node => {
                if (node.selected) selectedNodes.push(node);
            })

            // 开始潜在的拖动监听
            this.bus.emit('drag-start:node', { originalEvent, selectedNodes });
        });

        nodeModel.addEventListener('mousedown:port', (/**@type {CustomEvent} */e) => {

            this.setNodeSelected(nodeModel, true);

            this.bus.emit('drag-start:port', {...e.detail, node:nodeModel});
        })

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

    /**
     * 设置节点选中状态
     * @param {BaseNodeModel} node - 要选中的节点
     * @param {boolean} [clearOthers=true] - 是否清除其他节点的选中状态
     */
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

    /**
         * 将指定节点置顶
         * @param {string} nodeId 
         */
    // bringToFront(nodeId) {
    //     const node = this.nodes.get(nodeId);
    //     if (!node) return;

    //     // 1. 增加全局最高索引
    //     this.maxZIndex += 1;

    //     // 2. 更新节点的 zIndex
    //     // 注意：BaseNodeModel 里的 setZIndex 需要真正修改属性并 emit
    //     node.setZIndex(this.maxZIndex);
    // }

    // 删除节点
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

