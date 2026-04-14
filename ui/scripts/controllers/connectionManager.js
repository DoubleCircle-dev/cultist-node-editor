
import { EventBus } from "../types/eventBus.js";
import { ControllerCore } from "./controllerCore.js";
import { PortModel } from "../models/portModel.js";
import { IManager } from "./manager.js";
import { ConnectionModel } from "../models/connectionModel.js";
export class ConnectionManager extends IManager {

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

        /**@type {Map<string, ConnectionModel>} */
        this.connections = new Map();

        /**@type {Map<string, ConnectionModel[]>} */
        this.fromNodeIndex = new Map();

        /**@type {Map<string, ConnectionModel[]>} */
        this.toNodeIndex = new Map();

        this.dragState = {
            isDragging: false,
            canConnectToTarget: true,
            initialX: 0,
            initialY: 0,
            startPos: { x: 0, y: 0 },
            endPos: { x: 0, y: 0 }
        };

        this.startNode = null;
        this.targetNode = null;

        /**@type {PortModel|null} */
        this.startPort = null;
        /**@type {PortModel|null} */
        this.targetPort = null;

        this.tempLine = null;

        this.setTargetPortF = this.setTargetPort.bind(this);
        this.checkTargetF = this.checkTarget.bind(this);
        this.handlePortDragMoveF = this.handlePortDragMove.bind(this);
        this.handlePortDragEndF = this.handlePortDragEnd.bind(this);

        this._onEvents();

    }

    _createSVGLayer() {
        if (this.SVG_layer) return;
        const svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgLayer.id = 'connections-svg-layer';

        this.world.appendChild(svgLayer);

        this.SVG_layer = svgLayer;
    }

    _onEvents() {
        this.bus.on('drag-start:port', this._onPortDragStart.bind(this));
        this.bus.on('drag-moving:node', this._updateMovingConnections.bind(this));
        this.bus.on('drag-end:node', this._updateConnections.bind(this));
        this.bus.on('delete:node', this._deleteNodeConnections.bind(this));
    }

    _deleteNodeConnections(e) {
        const nodeId = e.detail.nodeId;
        let list = this.fromNodeIndex.get(nodeId);
        if (list) {
            list.forEach((conn) => {
                conn.remove();
                this.connections.delete(conn.id);
            })
            this.fromNodeIndex.delete(nodeId);
        }

        list = this.toNodeIndex.get(nodeId);
        if (list) {
            list.forEach((conn) => {
                conn.remove();
                this.connections.delete(conn.id);
            })
            this.toNodeIndex.delete(nodeId);
        }

    }

    removeConnection(connId){
        const conn = this.connections.get(connId);
        if (conn){
            conn.remove();

            let arr = this.fromNodeIndex.get(conn.formNodeId);
            if (arr) {
                const index = arr.indexOf(conn);

                if (index !== -1) {
                    arr.splice(index, 1);       // 删除模型
                    if (arr.length === 0) {
                        this.fromNodeIndex.delete(conn.formNodeId); // 数组为空时可选删除该键
                    }
                }
            }


            arr = this.toNodeIndex.get(conn.toNodeId);
            if (arr) {
                const index = arr.indexOf(conn);

                if (index !== -1) {
                    arr.splice(index, 1);       // 删除模型
                    if (arr.length === 0) {
                        this.toNodeIndex.delete(conn.toNodeId); // 数组为空时可选删除该键
                    }
                }
            }

            this.connections.delete(connId);
        }

    }

    _updateMovingConnections(e) {
        if (!this.coreSpace.setting.refreshMovingConnection) return;
        const ChangedConn = new Set();
        e.detail.nodesId.forEach((nodeId) => {
            let list = this.fromNodeIndex.get(nodeId);
            if (list) {
                list.forEach((conn) => {
                    conn.startFlag = true;
                    ChangedConn.add(conn);
                })
            }

            list = this.toNodeIndex.get(nodeId);
            if (list) {
                list.forEach((conn) => {
                    conn.endFlag = true;
                    ChangedConn.add(conn);
                })
            }
        })
        ChangedConn.forEach((conn) => {
            conn.update(e.detail.dx, e.detail.dy);
        })
    }

    _updateConnections(e) {
        if (!this.coreSpace.setting.checkConnectionPos) return;

        for (const conn of this.connections.values()) {
            const startPortDotRect = conn.startPort.getBoundingClientRect();
            const startPos = this.coreSpace.viewportToWorld(startPortDotRect.x, startPortDotRect.y);

            const endPortDotRect = conn.targetPort.getBoundingClientRect();
            const endPos = this.coreSpace.viewportToWorld(endPortDotRect.x, endPortDotRect.y);
            conn.refresh(startPos, endPos);
        }

    }

    /**
     * @param {PortModel} port 
     */
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

    _onPortDragStart(e) {

        if (this.dragState.isDragging) return;

        const { clientX, clientY, offsetX, offsetY } = e.detail.originalEvent;

        ({ x: this.dragState.initialX, y: this.dragState.initialY } = this.coreSpace.viewportToWorld(clientX, clientY));

        this.dragState.isDragging = true;
        this.dragState.startPos = this.getPortDotPosition(e.detail.port);

        this.startNode = e.detail.node;
        this.startPort = e.detail.port;



        this.bus.addEventListener('drag-end:port', this.setTargetPortF);
        this.bus.addEventListener('canNotConnected:port', this.checkTargetF);

        try {
            this.startPort.dispatchEvent(new CustomEvent('dragging', {}));

            this.createTempLine(e);

            document.addEventListener('mousemove', this.handlePortDragMoveF);
            document.addEventListener('mouseup', this.handlePortDragEndF);

        } catch (error) {
            console.error('端口拖动错误', error);
            this.cleanupPortDrag();

        }

    }


    createTempLine(e) {
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

        return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

    }

    // 处理拖拽移动
    handlePortDragMove(event) {
        if (!this.dragState.isDragging || !this.tempLine) return;

        try {

            // 获取当前鼠标位置 
            const endPosition = this.coreSpace.viewportToWorld(event.clientX, event.clientY);

            // 更新临时连接线
            const path = this.createCurvedPath(this.dragState.startPos.x, this.dragState.startPos.y, endPosition.x, endPosition.y, this.startPort.direction, null, true);
            this.tempLine.setAttribute('d', path);

            // 检查并高亮悬停的端口
        } catch (error) {
            console.error('处理拖拽移动时出错：', error, error.cause);
        }

    }

    // 处理拖拽结束
    handlePortDragEnd(event) {
        if (!this.dragState.isDragging) return;

        const hasTargetPort = this.findTargetPort(event);

        if (hasTargetPort) {
            const { clientX, clientY, offsetX, offsetY } = event;
            const endPosition = this.coreSpace.viewportToWorld(clientX, clientY);
            this.dragState.endPos = this.getPortDotPosition(this.targetPort);

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
            const portElement = elementsAtCursor.find(el => el.classList?.contains('port-dot'));

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
                this.startPort.ConnectTo(this.targetPort);

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

    // 创建永久连接
    createConnection(fromNodeId, fromPortId, toNodeId, toPortId) {

        try {
            // 创建连接对象
            const connectionId = `conn-${fromNodeId}+${fromPortId}+${toNodeId}+${toPortId}`;

            // 检查连接是否已存在
            if (this.connections.has(connectionId)) {
                return;
            }

            const connection = new ConnectionModel(connectionId,fromNodeId, toNodeId, this.startPort, this.targetPort, this.dragState.startPos, this.dragState.endPos);

            this.connections.set(connectionId, connection);

            let list = this.toNodeIndex.get(toNodeId);
            if (list) {
                list.push(connection)
            } else {
                this.toNodeIndex.set(toNodeId, [connection]);
            }

            list = this.fromNodeIndex.get(fromNodeId);
            if (list) {
                list.push(connection)
            } else {
                this.fromNodeIndex.set(fromNodeId, [connection]);
            }

            // 创建连接线
            this.createConnectionLine(connection);

            // 更新端口样式
            // this.updatePortStyles();

            // 更新连接线高亮
            // this.updateSelectedNodesConnections();

        } catch (error) {
            console.error('创建连接时出错：', error);
            this.cleanupPortDrag()
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

        const path = this.createCurvedPath(this.dragState.startPos.x, this.dragState.startPos.y, this.dragState.endPos.x, this.dragState.endPos.y, this.startPort.direction, this.targetPort.direction, false);
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
            this.removeConnection(connection.id);
            svgLine.remove();
        });

        connection.addEventListener('delete:conn', () => {
            svgLine.remove();
        })

        connection.addEventListener('change:conn', (/**@type {CustomEvent}*/e) => {
            const path = this.createCurvedPath(e.detail.startX, e.detail.startY, e.detail.endX, e.detail.endY);
            svgLine.setAttribute('d', path);
        })




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

        // 移除全局事件监听
        document.removeEventListener('mousemove', this.handlePortDragMoveF);
        document.removeEventListener('mouseup', this.handlePortDragEndF);
        this.bus.removeEventListener('drag-end:port', this.setTargetPortF);
        this.bus.removeEventListener('canNotConnected:port', this.checkTargetF);

        // 重置状态
        this.dragState = {
            isDragging: false,
            canConnectToTarget: true,
            initialX: 0,
            initialY: 0,
            startPos: { x: 0, y: 0 },
            endPos: { x: 0, y: 0 },
        };


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

        this.dragState = {
            isDragging: false,
            canConnectToTarget: true,
            initialX: 0,
            initialY: 0,
            startPos: { x: 0, y: 0 },
            endPos: { x: 0, y: 0 }
        };

        this.startNode = null;
        this.targetNode = null;

        /**@type {PortModel|null} */
        this.startPort = null;
        /**@type {PortModel|null} */
        this.targetPort = null;

        this.tempLine = null;

    }

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
