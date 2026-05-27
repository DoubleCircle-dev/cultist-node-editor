import { EventBus } from '../types/eventBus.js';
import { ControllerCore } from './controllerCore.js';
import { PortModel } from '../models/portModel.js';
import { IManager } from './manager.js';
import { ConnectionModel } from '../models/connectionModel.js';
import { StandardDetail } from '../types/standardDetail.js';
export class ConnectionManager extends IManager {
    static get initDragState() {
        return {
            isDragging: false,
            canConnectToTarget: true,
            initialX: 0,
            initialY: 0,
            startPos: { x: 0, y: 0 },
            endPos: { x: 0, y: 0 },
            /** @type {listenerMap[]} */
            listeners: [],
        };
    }

    /**
     * @param {EventBus} bus
     * @param {HTMLElement} viewport
     * @param {HTMLElement} world
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus, viewport, world, coreSpace);

        this.SVG_layer = null;
        this._createSVGLayer();

        /** @type {Map<string, ConnectionModel>} */
        this.connections = new Map();

        /** @type {Map<string, ConnectionModel[]>} */
        this.fromNodeIndex = new Map();

        /** @type {Map<string, ConnectionModel[]>} */
        this.toNodeIndex = new Map();

        this.dragState = ConnectionManager.initDragState;

        this.startNode = null;
        this.targetNode = null;

        /** @type {PortModel | null} */
        this.startPort = null;
        /** @type {PortModel | null} */
        this.targetPort = null;

        this.tempLine = null;

        this._onEvents();
    }

    //* 初始化 *//
    /**
     * 新建svg层用于显示连接线
     *
     * @private
     */
    _createSVGLayer() {
        if (this.SVG_layer) return;
        const svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgLayer.id = 'connections-svg-layer';

        this.world.appendChild(svgLayer);

        this.SVG_layer = svgLayer;
    }

    /** @private */
    _onEvents() {
        this.registerListener(this.bus, 'drag:port:start', this._onPortDragStart);
        this.registerListener(this.bus, 'drag:node:running', this._updateConnections);
        this.registerListener(this.bus, 'drag:node:end', this._updateConnections);
        this.registerListener(this.bus, 'delete:node:finished', this._deleteNodeConnections);
    }

    /**
     * @private
     * @param {CustomEvent} e
     */
    _onPortDragStart(e) {
        if (this.dragState.isDragging) return;

        const { clientX, clientY, offsetX, offsetY } = e.detail.originalEvent;

        ({ x: this.dragState.initialX, y: this.dragState.initialY } = this.coreSpace.viewportToWorld(clientX, clientY));

        this.dragState.isDragging = true;
        this.dragState.startPos = this.getPortDotPosition(e.detail.port);

        this.startNode = e.detail.node;
        this.startPort = e.detail.port;

        const onceListenerEnd = this.bus.once('drag:port:end', this.setTargetPort.bind(this));
        this.dragState.listeners.push({
            target: this.bus,
            type: 'drag:port:end',
            listener: onceListenerEnd
        });
        const onceListenerFailed = this.bus.once('connect:port:failed', this.checkTarget.bind(this));

        this.dragState.listeners.push({
            target: this.bus,
            type: 'connect:port:failed',
            listener: onceListenerFailed,
        });
        try {
            this._createTempLine(e);

            this.dragState.listeners.push(this.autoBind(document, 'mousemove', this._handlePortDragMove));
            this.dragState.listeners.push(this.autoBind(document, 'mouseup', this._handlePortDragEnd));
        } catch (error) {
            console.error('端口拖动错误', error);
            this.cleanupPortDrag();
        }
    }

    /**
     * @private
     * @param {StandardDetail} detail
     */
    /**
     * @private
     * @param {CustomEvent} ce
     */
    _deleteNodeConnections(ce) {
        const detail = ce.detail;
        const nodeIds = detail.data.nodeIds;

        if (!nodeIds) {
            console.error('删除节点消息未正确提供节点 id');
            return;
        }

        // 兼容单个 id 或 id 数组
        const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];

        // 用于记录需要删除的连接 ID（Set 自动去重）
        const connectionIdsToRemove = new Set();
        // 用于保存被删除的连接模型实体，以便撤销时原样恢复
        const connectionsToRemove = [];

        // 第一步：收集所有相关的连接 ID 和模型实体
        ids.forEach((nodeId) => {
            // 处理作为起点的连接
            const fromList = this.fromNodeIndex.get(nodeId);
            if (fromList) {
                fromList.forEach((conn) => {
                    if (!connectionIdsToRemove.has(conn.id)) {
                        connectionIdsToRemove.add(conn.id);
                        connectionsToRemove.push(conn);
                    }
                });
                // 将清理工作统一交给底层的 _removeConnection 处理，避免破坏内部索引
            }

            // 处理作为终点的连接
            const toList = this.toNodeIndex.get(nodeId);
            if (toList) {
                toList.forEach((conn) => {
                    if (!connectionIdsToRemove.has(conn.id)) {
                        connectionIdsToRemove.add(conn.id);
                        connectionsToRemove.push(conn);
                    }
                });
            }
        });

        // 第二步：如果存在需要删除的连线，劫持(Monkey-patch)该事件的撤销/重做逻辑
        if (connectionsToRemove.length > 0) {
            const originalUndo = detail.undoFunction;
            const originalRedo = detail.redoFunction;

            detail.registerFunctions(
                (data) => {
                    // 1. 先执行原有的撤销逻辑（恢复节点模型和视图）
                    if (originalUndo) originalUndo(data);
                    // 2. 节点恢复后，重新把这些连线加回画布
                    connectionsToRemove.forEach((conn) => {
                        this._createConnection(conn);
                    });
                },
                (data) => {
                    // 1. 先执行原有的重做逻辑（再次删除节点）
                    if (originalRedo) originalRedo(data);
                    // 2. 节点删除后，再次将这些连线清理掉
                    this.deleteConnections(Array.from(connectionIdsToRemove));
                }
            );
        }

        // 第三步：统一删除所有涉及到的连接
        this.deleteConnections(Array.from(connectionIdsToRemove));
    }

    /**
     * @private
     * @param {string} connId
     */
    _removeConnection(connId) {
        const conn = this.connections.get(connId);
        if (conn) {
            conn.remove();

            let arr = this.fromNodeIndex.get(conn.fromNodeId);
            if (arr) {
                const index = arr.indexOf(conn);

                if (index !== -1) {
                    arr.splice(index, 1); // 删除模型
                    if (arr.length === 0) {
                        this.fromNodeIndex.delete(conn.fromNodeId); // 数组为空时可选删除该键
                    }
                }
            }

            arr = this.toNodeIndex.get(conn.toNodeId);
            if (arr) {
                const index = arr.indexOf(conn);

                if (index !== -1) {
                    arr.splice(index, 1); // 删除模型
                    if (arr.length === 0) {
                        this.toNodeIndex.delete(conn.toNodeId); // 数组为空时可选删除该键
                    }
                }
            }

            this.connections.delete(connId);
        }
    }

    /** @param {string} connId */
    deleteConnection(connId) {
        this.deleteConnections([connId]);
    }

    /** @param {string[]} connectionIds */
    deleteConnections(connectionIds) {
        connectionIds.forEach((connectionId) => {
            this._removeConnection(connectionId);
        });
    }

    /**
     * @private
     * @param {CustomEvent} e
     */
    _updateMovingConnections(e) {
        if (!this.coreSpace.setting.refreshMovingConnection) return;
        const ChangedConn = new Set();
        /** @type {string[]} */
        const ids = e.detail.nodeIds;
        if (!ids) return;
        ids.forEach((nodeId) => {
            let list = this.fromNodeIndex.get(nodeId);
            if (list) {
                list.forEach((conn) => {
                    conn.startFlag = true;
                    ChangedConn.add(conn);
                });
            }

            list = this.toNodeIndex.get(nodeId);
            if (list) {
                list.forEach((conn) => {
                    conn.endFlag = true;
                    ChangedConn.add(conn);
                });
            }
        });
        ChangedConn.forEach((conn) => {
            conn.update(e.detail.dx, e.detail.dy);
        });
    }

    /**
     * @private
     * @param {CustomEvent} e
     */
    _updateConnections(e) {
        // if (!this.coreSpace.setting.checkConnectionPos) return;

        for (const conn of this.connections.values()) {
            const startPortDotRect = conn.startPort.getBoundingClientRect();
            const startPos = this.coreSpace.viewportToWorld(startPortDotRect.x, startPortDotRect.y);

            const endPortDotRect = conn.targetPort.getBoundingClientRect();
            const endPos = this.coreSpace.viewportToWorld(endPortDotRect.x, endPortDotRect.y);
            conn.refresh(startPos, endPos);
        }
    }

    /** @param {PortModel} port */
    getPortDotPosition(port) {
        const portDotRect = port.getBoundingClientRect();

        return this.coreSpace.viewportToWorld(portDotRect.x, portDotRect.y);
    }

    setTargetPort(e) {
        this.targetPort = e.detail.port;
        this.targetNode = e.detail.node;
    }

    checkTarget(e) {
        if (this.startPort === e.detail.port) {
            return;
        }

        this.dragState.canConnectToTarget = true;
    }

    // === 连接线功能实现 ===

    /**
     * @private
     * @param {CustomEvent} e
     */
    _createTempLine(e) {
        if (!this.SVG_layer) {
            console.error('找不到连接线SVG容器');
            return;
        }

        const portDirect = e.detail.port.direction;

        // 创建SVG路径
        const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempLine.id = 'temp-connection-line';
        tempLine.classList.add('connection-path', 'temp-connection');

        // 初始路径

        const endPosition = this.coreSpace.viewportToWorld(e.detail.originalEvent.clientX, e.detail.originalEvent.clientY);

        const path = this.createCurvedPath(this.dragState.startPos.x, this.dragState.startPos.y, endPosition.x, endPosition.y, portDirect, null, true);
        tempLine.setAttribute('d', path);

        this.tempLine = tempLine;

        this.SVG_layer.appendChild(tempLine);
    }

    // 创建曲线路径
    createCurvedPath(startX, startY, endX, endY, startPortDirect = 'output', endDirect = 'input', tempFlag = false) {
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
            case 'input':
                cp1x = startX - Math.max(minBoundaryOffset, BoundaryOffset);
                cp1y = startY + verticalOffset * verticalDirect;
                break;
            case 'output':
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
                case 'input':
                    endPortDirect = 'output';
                    break;
                case 'output':
                    endPortDirect = 'input';
                    break;
                case 'bi':
                default:
                    endPortDirect = 'bi';
                    break;
            }
        }

        switch (endPortDirect) {
            case 'input':
                cp2x = endX - Math.max(minBoundaryOffset, BoundaryOffset);
                cp2y = endY - verticalOffset * verticalDirect;
                break;
            case 'output':
                cp2x = endX + Math.max(minBoundaryOffset, BoundaryOffset);
                cp2y = endY - verticalOffset * verticalDirect;
                break;
            case 'bi':
            default:
                cp2x = startX + Math.max(minBoundaryOffset, BoundaryOffset);
                cp2y = startY + verticalOffset * verticalDirect;
                break;
        }

        if (!this._checkPath(cp1x, cp1y, cp2x, cp2y, startX, startY, endX, endY)) return null;

        return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
    }

    /** @private */
    _checkPath(cp1x, cp1y, cp2x, cp2y, startX, startY, endX, endY) {
        if (!cp1x) return false;
        if (!cp1y) return false;
        if (!cp2x) return false;
        if (!cp2y) return false;
        if (!startX) return false;
        if (!startY) return false;
        if (!endX) return false;
        if (!endY) return false;
        if (Number.isNaN(cp1x)) return false;
        if (Number.isNaN(cp1y)) return false;
        if (Number.isNaN(cp2x)) return false;
        if (Number.isNaN(cp2y)) return false;
        if (Number.isNaN(startX)) return false;
        if (Number.isNaN(startY)) return false;
        if (Number.isNaN(endX)) return false;
        if (Number.isNaN(endY)) return false;

        return true;
    }

    // 处理拖拽移动
    /**
     * @private
     * @param {MouseEvent} event
     */
    _handlePortDragMove(event) {
        if (!this.dragState.isDragging || !this.tempLine) return;

        try {
            // 获取当前鼠标位置
            const endPosition = this.coreSpace.viewportToWorld(event.clientX, event.clientY);

            // 更新临时连接线
            const path = this.createCurvedPath(
                this.dragState.startPos.x,
                this.dragState.startPos.y,
                endPosition.x,
                endPosition.y,
                this.startPort.direction,
                null,
                true
            );
            this.tempLine.setAttribute('d', path);

            // 检查并高亮悬停的端口
        } catch (error) {
            if (error instanceof Error) {
                console.error('处理拖拽移动时出错：', error, error.cause);
            } else {
                console.error('处理拖拽移动时出错：', error);
            }
        }
    }

    // 处理拖拽结束
    /**
     * @private
     * @param {MouseEvent} event
     */
    _handlePortDragEnd(event) {
        if (!this.dragState.isDragging) return;

        const hasTargetPort = this.findTargetPort(event);

        if (hasTargetPort) {
            const { clientX, clientY, offsetX, offsetY } = event;
            const endPosition = this.coreSpace.viewportToWorld(clientX, clientY);
            if (this.targetPort) {
                this.dragState.endPos = this.getPortDotPosition(this.targetPort);
            } else {
                console.error('目标端口未正确登记');
                return;
            }

            // 尝试创建连接
            this.tryCreateConnection();
        }

        // 清理拖拽状态
        this.cleanupPortDrag();
    }

    // 查找目标端口
    findTargetPort(event) {
        const target = this.targetPort;

        if (target) {
            return true;
        } else {
            if (!this.dragState.canConnectToTarget) return false;

            // 获取鼠标坐标
            const x = event.clientX;
            const y = event.clientY;

            // 获取该坐标下的所有元素（考虑 z-index 层级）
            const elementsAtCursor = document.elementsFromPoint(x, y);

            // 查找第一个具有 'port' 类的元素（或自定义标识）
            const portElement = elementsAtCursor.find((el) => el.classList?.contains('port-dot'));

            if (!portElement) {
                console.warn('未找到端口 DOM 元素');
                return null;
            }

            console.warn('目标端口未正确更新');
        }
    }

    // 尝试创建连接
    tryCreateConnection() {
        if (!this.dragState.canConnectToTarget || !this.targetPort) return;

        try {
            if (this.startPort.canConnectTo(this.targetPort)) {
                if (this.startPort.direction === 'input') {
                    const tempNode = this.startNode;
                    const tempPort = this.startPort;
                    this.startNode = this.targetNode;
                    this.startPort = this.targetPort;
                    this.targetNode = tempNode;
                    this.targetPort = tempPort;
                }
                // 创建连接
                this.createConnection(this.startNode.id, this.startPort.id, this.targetNode.id, this.targetPort.id);
            }
        } catch (error) {
            console.error('尝试创建连接时出错：', error);
        }
    }

    /**
     * @private
     * @param {ConnectionModel} connModel
     */

    _createConnection(connModel) {
        const connection = connModel;
        const connectionId = connection.id;

        connection.startPort.ConnectTo(connection.targetPort);

        this.connections.set(connectionId, connection);

        let list = this.toNodeIndex.get(connection.toNodeId);
        if (list) {
            list.push(connection);
        } else {
            this.toNodeIndex.set(connection.toNodeId, [connection]);
        }

        list = this.fromNodeIndex.get(connection.fromNodeId);
        if (list) {
            list.push(connection);
        } else {
            this.fromNodeIndex.set(connection.fromNodeId, [connection]);
        }

        // 创建连接线
        this.createConnectionLine(connection);
    }

    // 创建永久连接
    /**
     * @param {string} fromNodeId
     * @param {string} fromPortId
     * @param {string} toNodeId
     * @param {string} toPortId
     */
    createConnection(fromNodeId, fromPortId, toNodeId, toPortId) {
        try {
            // 创建连接对象
            const connectionId = `conn-${fromNodeId}+${fromPortId}+${toNodeId}+${toPortId}`;

            // 检查连接是否已存在
            if (this.connections.has(connectionId)) {
                return;
            }

            const connection = new ConnectionModel(
                connectionId,
                fromNodeId,
                toNodeId,
                this.startPort,
                this.targetPort,
                this.dragState.startPos,
                this.dragState.endPos
            );

            this._createConnection(connection);

            this.bus.standardEmitDetail(
                'create',
                'connection',
                {},
                () => {
                    // connection.emit('delete:connection', {})
                    this.deleteConnection(connectionId);
                },
                () => {
                    this._createConnection(connection);
                }
            );
            // 更新端口样式
            // this.updatePortStyles();

            // 更新连接线高亮
            // this.updateSelectedNodesConnections();
        } catch (error) {
            console.error('创建连接时出错：', error);
            this.cleanupPortDrag();
        }
    }

    // 创建永久连接线
    createConnectionLine(connection) {
        if (!this.SVG_layer) {
            console.error('找不到连接线SVG容器');
            return;
        }

        // 创建SVG路径
        const svgLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        svgLine.id = connection.id;
        svgLine.classList.add('connection-path', 'permanent-connection');

        const path = this.createCurvedPath(
            connection.startPos.x,
            connection.startPos.y,
            connection.endPos.x,
            connection.endPos.y,
            connection.startPort.direction,
            connection.targetPort.direction,
            false
        );
        svgLine.setAttribute('d', path);

        // 添加悬停效果
        svgLine.addEventListener('mouseenter', () => {
            svgLine.classList.add('connection-hover');
        });

        svgLine.addEventListener('mouseleave', () => {
            svgLine.classList.remove('connection-hover');
        });

        // 双击断开连接
        svgLine.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.deleteConnection(connection.id);
        });

        connection.addEventListener('delete:connection', () => {
            svgLine.remove();
        });

        connection.addEventListener('change:connection', (/** @type {CustomEvent} */ e) => {
            const path = this.createCurvedPath(e.detail.startX, e.detail.startY, e.detail.endX, e.detail.endY);
            if (!path) {
                console.error('无法创建路径，参数不准确', e.detail.startX, e.detail.startY, e.detail.endX, e.detail.endY);
                return;
            }
            svgLine.setAttribute('d', path);
        });

        if (this.tempLine) {
            this.tempLine.remove();
            this.tempLine = null;
        }

        this.SVG_layer.appendChild(svgLine);
    }

    // 清理拖拽状态
    cleanupPortDrag() {
        // 移除临时连接线
        if (this.tempLine) {
            this.tempLine.remove();
            this.tempLine = null;
        }

        // 清除高亮
        // this.clearHighlights();

        // 重置状态
        this._resetDragState();
        this.startNode = null;
        this.targetNode = null;

        this.startPort = null;
        this.targetPort = null;
    }

    toggleConnections() {
        this.SVG_layer?.classList.toggle('hidden');
        this.bus.emit('toggle:connections');
    }

    clear() {
        this.connections.clear();
        this.fromNodeIndex.clear();
        this.toNodeIndex.clear();

        if (this.SVG_layer) {
            this.SVG_layer.innerHTML = '';
        }

        this._resetDragState();

        this.startNode = null;
        this.targetNode = null;

        /** @type {PortModel | null} */
        this.startPort = null;
        /** @type {PortModel | null} */
        this.targetPort = null;

        this.tempLine = null;
    }

    /** @private */
    _resetDragState() {
        this.dragState.listeners.forEach((listenerMap) => {
            listenerMap.target.removeEventListener(listenerMap.type, listenerMap.listener);
        });
        this.dragState = ConnectionManager.initDragState;
    }
}
