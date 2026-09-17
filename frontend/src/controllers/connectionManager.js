import { EventBus } from '../types/eventBus.js';
import { ControllerCore } from './controllerCore.js';
import { PortModel } from '../models/propModels/portModel.js';
import { IManager } from './manager.js';
import { ConnectionModel } from '../models/connectionModels/connectionModel.js';
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

        /** @type {Map<string, {svgLine: SVGElement, listeners: Array}>} */
        this.connectionLines = new Map();

        /** @type {Map<string, Function>} 变量同步：connectionId → cleanup */
        this.syncBindings = new Map();

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

            const lineData = this.connectionLines.get(connId);
            if (lineData) {
                const { svgLine, listeners } = lineData;
                listeners.forEach(({ element, target, event, handler }) => {
                    if (element) {
                        element.removeEventListener(event, handler);
                    } else if (target) {
                        target.removeEventListener(event, handler);
                    }
                });
                svgLine.remove();
                this.connectionLines.delete(connId);
            }

            let arr = this.fromNodeIndex.get(conn.fromNodeId);
            if (arr) {
                const index = arr.indexOf(conn);

                if (index !== -1) {
                    arr.splice(index, 1);
                    if (arr.length === 0) {
                        this.fromNodeIndex.delete(conn.fromNodeId);
                    }
                }
            }

            arr = this.toNodeIndex.get(conn.toNodeId);
            if (arr) {
                const index = arr.indexOf(conn);

                if (index !== -1) {
                    arr.splice(index, 1);
                    if (arr.length === 0) {
                        this.toNodeIndex.delete(conn.toNodeId);
                    }
                }
            }

            this.connections.delete(connId);

            // 连接被删除 → 解除文本同步监听
                        this._unbindValueSync(connId);
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
     * 重算全部连接线端点（拖拽之外的批量位移：整理布局、连线样式切换等）。
     * 端点取自端口圆点的真实 DOM 位置，因此调用前节点必须已挂载且位置已生效。
     */
    refreshAllConnections() {
        this._updateConnections(undefined);
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
        if (!tempFlag && this.coreSpace.setting.connectionStyle === 'straight') {
            return `M ${startX} ${startY} L ${endX} ${endY}`;
        }

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

        // 文本变量节点 ↔ 文本输入框：建立双向文本同步
        this._bindValueSync(connection);
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

    /**
     * 程序化创建连接（数据驱动连线，如 mod 引用展示；不走拖拽状态）。
     * 由 ConnectionModel + _createConnection 完成：模型连线 + 注册索引 + 生成 SVG 连接线。
     *
     * @param {import('../models/nodeModels/baseNodeModel.js').BaseNodeModel} fromModel
     * @param {import('../models/propModels/portModel.js').PortModel} fromPort
     * @param {import('../models/nodeModels/baseNodeModel.js').BaseNodeModel} toModel
     * @param {import('../models/propModels/portModel.js').PortModel} toPort
     * @returns {import('../models/connectionModels/connectionModel.js').ConnectionModel | null}
     */
    createProgrammaticConnection(fromModel, fromPort, toModel, toPort) {
        try {
            if (!fromModel || !toModel || !fromPort || !toPort || fromPort === toPort) return null;
            if (!fromPort.canConnectTo(toPort)) return null;
            const fromNodeId = String(fromModel.id);
            const toNodeId = String(toModel.id);
            const connectionId = `conn-${fromNodeId}+${fromPort.id}+${toNodeId}+${toPort.id}`;
            if (this.connections.has(connectionId)) return null;

            // 端点位置：端口 DOM 世界坐标（未挂载/异常时回退节点坐标）
            let startPos = { x: fromModel.x || 0, y: fromModel.y || 0 };
            let endPos = { x: toModel.x || 0, y: toModel.y || 0 };
            try {
                startPos = this.getPortDotPosition(fromPort);
            } catch { /* 端口未挂载，用节点坐标兜底 */ }
            try {
                endPos = this.getPortDotPosition(toPort);
            } catch { /* 同上 */ }

            const connection = new ConnectionModel(connectionId, fromNodeId, toNodeId, fromPort, toPort, startPos, endPos);
            this._createConnection(connection);
            return connection;
        } catch (error) {
            console.error('程序化创建连接失败:', error);
            return null;
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

        const listeners = [];

        const mouseenterHandler = () => {
            svgLine.classList.add('connection-hover');
        };
        const mouseleaveHandler = () => {
            svgLine.classList.remove('connection-hover');
        };
        const dblclickHandler = (e) => {
            e.stopPropagation();
            this.deleteConnection(connection.id);
        };

        svgLine.addEventListener('mouseenter', mouseenterHandler);
        svgLine.addEventListener('mouseleave', mouseleaveHandler);
        svgLine.addEventListener('dblclick', dblclickHandler);

        listeners.push(
            { element: svgLine, event: 'mouseenter', handler: mouseenterHandler },
            { element: svgLine, event: 'mouseleave', handler: mouseleaveHandler },
            { element: svgLine, event: 'dblclick', handler: dblclickHandler }
        );

        const deleteConnectionHandler = () => {
            svgLine.remove();
        };
        const changeConnectionHandler = (/** @type {CustomEvent} */ e) => {
            // 重建路径必须带上端口方向（与创建时一致），否则控制点方向错误、线从错误侧伸出
            const path = this.createCurvedPath(
                e.detail.startX,
                e.detail.startY,
                e.detail.endX,
                e.detail.endY,
                connection.startPort.direction,
                connection.targetPort.direction
            );
            if (!path) {
                console.error('无法创建路径，参数不准确', e.detail.startX, e.detail.startY, e.detail.endX, e.detail.endY);
                return;
            }
            svgLine.setAttribute('d', path);
        };

        connection.addEventListener('delete:connection', deleteConnectionHandler);
        connection.addEventListener('change:connection', changeConnectionHandler);

        listeners.push(
            { target: connection, event: 'delete:connection', handler: deleteConnectionHandler },
            { target: connection, event: 'change:connection', handler: changeConnectionHandler }
        );

        this.connectionLines.set(connection.id, { svgLine, listeners });

        if (this.tempLine) {
            this.tempLine.remove();
            this.tempLine = null;
        }

        this.SVG_layer.appendChild(svgLine);
    }

    // 重置端口拖拽状态
    // 修复：该方法此前被 cleanupPortDrag()/clear() 调用但从未定义，导致
    // 端口拖拽清理与 clear()/destroy() 直接抛 TypeError；同时 dragState.listeners
    // 里临时注册的监听器（document mousemove/mouseup、bus once）从不移除，
    // 每次端口拖拽都会泄漏 2 个 document 级监听器。此处一并修复。
    /** @private */
    _resetDragState() {
        this.dragState.listeners.forEach(({ target, type, listener }) => {
            target?.removeEventListener(type, listener);
        });
        this.dragState = ConnectionManager.initDragState;
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

    // ============ 文本变量节点 ↔ 文本输入框 双向同步 ============

    /** @private 端口所在节点（port → prop → node，经弱引用解析） */
    _portOwnerNode(port) {
        const prop = port && port.parentProp;
        if (!prop) return null;
        const node = prop.parentNode && prop.parentNode.deref ? prop.parentNode.deref() : null;
        return node || null;
    }

    /** @private 端口所在 prop */
    _portOwnerProp(port) {
        return port && port.parentProp ? port.parentProp : null;
    }

    /** @private 变量节点里保存实际值的 prop（非端口类） */
    _findSyncSourceProp(node) {
        if (!node) return null;
        const sourceTypes = new Set(['textarea-preview', 'text', 'text-preview', 'custom', 'number', 'image-preview', 'image-icon']);
        return (node.detailProperties || []).find((p) => p && sourceTypes.has(p.type)) || null;
    }

    /** @private 根据变量节点类型匹配同步配置 */
    _syncProfileByNodeType(nodeType) {
        const profiles = {
            text: {
                fieldTypes: new Set(['text', 'textarea-preview', 'text-preview']),
                liveEvents: new Set(['text:input']),
                stringify: true,
            },
            number: {
                fieldTypes: new Set(['number', 'integer', 'int', 'range', 'slider']),
                liveEvents: new Set(),
                stringify: false,
            },
            images: {
                fieldTypes: new Set(['image-preview', 'image-icon']),
                liveEvents: new Set(),
                stringify: true,
            },
        };
        return profiles[nodeType] || null;
    }

    /** @private 把同步值规范化成目标可接受的类型 */
    _normalizeSyncValue(value, stringify) {
        if (stringify) return String(value ?? '');
        if (value === '' || value == null) return '';
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : value;
    }

    /**
    * @private 判断连接是否为「变量节点输出 → 可写字段」，是则建立双向同步。
     *
     * 同步规则：
     *  - 任一方向值变化都会写回对方（updateValue，不产生额外历史）；
     *  - 连接建立时先让双方一致（优先采用非空一侧，避免覆盖正在编辑的内容）。
     *
     * @param {import('../models/connectionModels/connectionModel.js').ConnectionModel} connection
     */
    _bindValueSync(connection) {
        if (!connection || !connection.startPort || !connection.targetPort) return;
        if (this.syncBindings.has(connection.id)) return;

        const endpoints = [connection.startPort, connection.targetPort]
            .map((port) => ({ port, node: this._portOwnerNode(port) }))
            .filter((e) => e && e.node);

        // 变量节点输出端那一侧
        const variable = endpoints.find((e) => e.port.direction === 'output' && this._syncProfileByNodeType(e.node.type));
        if (!variable) return;
        const field = endpoints.find((e) => e !== variable);
        if (!field) return;

        const profile = this._syncProfileByNodeType(variable.node.type);
        if (!profile) return;

        // 对端必须是该变量类型对应的可写字段
        const fieldProp = this._portOwnerProp(field.port);
        if (!fieldProp || !profile.fieldTypes.has(fieldProp.type)) return;

        const contentProp = this._findSyncSourceProp(variable.node);
        if (!contentProp || contentProp === fieldProp) return;

        let syncing = false;
        /** 单向把 from 的值写进 to（同步期间不再反向触发，避免回环） */
        const push = (from, to) => {
            if (syncing) return;
            const v = this._normalizeSyncValue(from.value, profile.stringify);
            if (String(to.value ?? '') === String(v ?? '')) return;
            syncing = true;
            try {
                to.updateValue(v);
            } finally {
                syncing = false;
            }
        };

        const contentChanged = () => push(contentProp, fieldProp);
        const fieldChanged = () => push(fieldProp, contentProp);

        contentProp.addEventListener('update', contentChanged);
        contentProp.addEventListener('change:property', contentChanged);
        fieldProp.addEventListener('update', fieldChanged);
        fieldProp.addEventListener('change:property', fieldChanged);

        // 实时同步：仅文本类字段启用，保持现有“输入即刷新”体验
        const isRealtime = () =>
            !!(this.coreSpace && this.coreSpace.setting && this.coreSpace.setting.realtimeTextSync);
        const contentLive = (/** @type {Event} */ e) => {
            if (!isRealtime() || !profile.liveEvents.has('text:input') || syncing) return;
            const v = e instanceof CustomEvent ? String(e.detail?.value ?? '') : '';
            if (String(fieldProp.value ?? '') === v) return;
            syncing = true;
            try {
                fieldProp.updateValue(v);
            } finally {
                syncing = false;
            }
        };
        const fieldLive = (/** @type {Event} */ e) => {
            if (!isRealtime() || !profile.liveEvents.has('text:input') || syncing) return;
            const v = e instanceof CustomEvent ? String(e.detail?.value ?? '') : '';
            if (String(contentProp.value ?? '') === v) return;
            syncing = true;
            try {
                contentProp.updateValue(v);
            } finally {
                syncing = false;
            }
        };
        if (profile.liveEvents.has('text:input')) {
            contentProp.addEventListener('text:input', contentLive);
            fieldProp.addEventListener('text:input', fieldLive);
        }

        const cleanup = () => {
            contentProp.removeEventListener('update', contentChanged);
            contentProp.removeEventListener('change:property', contentChanged);
            fieldProp.removeEventListener('update', fieldChanged);
            fieldProp.removeEventListener('change:property', fieldChanged);
            if (profile.liveEvents.has('text:input')) {
                contentProp.removeEventListener('text:input', contentLive);
                fieldProp.removeEventListener('text:input', fieldLive);
            }
        };
        this.syncBindings.set(connection.id, cleanup);

        // 连接建立后让双方值一致：优先采用有内容的一侧，避免覆盖编辑中的内容
        const contentV = String(contentProp.value ?? '');
        const fieldV = String(fieldProp.value ?? '');
        if (contentV === fieldV) return;
        if (fieldV) {
            push(fieldProp, contentProp);
        } else if (contentV) {
            push(contentProp, fieldProp);
        }
    }

    /** @private 解除某连接建立的变量同步监听 */
    _unbindValueSync(connectionId) {
        const cleanup = this.syncBindings.get(connectionId);
        if (cleanup) {
            cleanup();
            this.syncBindings.delete(connectionId);
        }
    }

    clear() {
        this.connectionLines.forEach(({ listeners }) => {
            listeners.forEach(({ element, target, event, handler }) => {
                if (element) {
                    element.removeEventListener(event, handler);
                } else if (target) {
                    target.removeEventListener(event, handler);
                }
            });
        });

        this.connections.clear();
        this.fromNodeIndex.clear();
        this.toNodeIndex.clear();
        this.connectionLines.clear();

        // 清空文本变量同步监听
            this.syncBindings.forEach((cleanup) => cleanup());
            this.syncBindings.clear();

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

    destroy() {
        this.clear();
        super.destroy();
    }
}
