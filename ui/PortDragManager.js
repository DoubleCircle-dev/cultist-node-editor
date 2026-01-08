// 仅限Webview中使用，禁用检查
/* eslint-disable no-undef */
// @ts-nocheck

// /src/ui/PortDragManager.js

class PortDragManager {
    constructor(nodes, connections, canvas, updateStatus) {
        this.nodes = nodes;
        this.connections = connections;
        this.canvas = canvas;
        this.updateStatus = updateStatus;

        this.isDragging = false;
        this.startInfo = null;
        this.tempLine = null;
        this.currentPortElement = null;
        this.highlightedPorts = new Set();
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
            if (!this.isDragging) {
                element.classList.add('port-hover');
            }
        });

        element.addEventListener('mouseleave', () => {
            if (!this.isDragging) {
                element.classList.remove('port-hover');
            }
        });
    }

    // 开始端口拖拽
    startPortDrag(event, portElement, nodeId, portType, portIndex) {
        event.preventDefault();
        event.stopPropagation();

        const node = this.nodes.get(nodeId);
        if (!node) return;

        // 检查端口是否已连接
        if (this.isPortConnected(nodeId, portType, portIndex)) {
            this.handleConnectedPortClick(event, nodeId, portType, portIndex);
            return;
        }

        // 设置拖拽状态
        this.isDragging = true;
        this.startInfo = { nodeId, portType, portIndex };
        this.currentPortElement = portElement;

        // 添加拖拽样式
        portElement.classList.add('port-dragging');

        // 创建临时连接线
        this.createTempLine(event);

        // 绑定全局事件
        document.addEventListener('mousemove', this.handleDragMove.bind(this));
        document.addEventListener('mouseup', this.handleDragEnd.bind(this));

        this.updateStatus(`开始连接 ${portType === 'input' ? '输入' : '输出'}端口`);
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
        const startPos = this.getPortPosition(this.startInfo);

        // 创建SVG路径
        const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempLine.id = 'temp-connection-line';
        tempLine.classList.add('connection-path', 'temp-connection');

        // 初始路径
        const canvasRect = this.canvas.getBoundingClientRect();
        const endX = event.clientX - canvasRect.left;
        const endY = event.clientY - canvasRect.top;

        const path = this.createCurvedPath(startPos.x, startPos.y, endX, endY);
        tempLine.setAttribute('d', path);

        connectionsSvg.appendChild(tempLine);
        this.tempLine = tempLine;
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
            svg.id = 'connections-svg';
            this.canvas.appendChild(svg);
        }
        return svg;
    }

    // 处理拖拽移动
    handleDragMove(event) {
        if (!this.isDragging || !this.tempLine) return;

        const canvasRect = this.canvas.getBoundingClientRect();

        // 获取起始端口位置
        const startPos = this.getPortPosition(this.startInfo);

        // 获取当前鼠标位置
        const endX = event.clientX - canvasRect.left;
        const endY = event.clientY - canvasRect.top;

        // 更新临时连接线
        const path = this.createCurvedPath(startPos.x, startPos.y, endX, endY);
        this.tempLine.setAttribute('d', path);

        // 检查并高亮悬停的端口
        this.checkHoveredPorts(event);
    }

    // 处理拖拽结束
    handleDragEnd(event) {
        if (!this.isDragging) return;

        const targetPort = this.findTargetPort(event);

        if (targetPort) {
            // 尝试创建连接
            this.tryCreateConnection(targetPort);
        }

        // 清理拖拽状态
        this.cleanupDrag();
    }

    // 查找目标端口
    findTargetPort(event) {
        const elements = document.elementsFromPoint(event.clientX, event.clientY);

        for (const element of elements) {
            const portHubItem = element.closest('.port-hub-item');
            if (!portHubItem) continue;

            const portId = portHubItem.dataset.portId;
            if (!portId) continue;

            const [nodeId, portType, portIndex] = this.parsePortId(portId);

            // 不能连接到同一节点
            if (nodeId === this.startInfo.nodeId) continue;

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

            const portId = portHubItem.dataset.portId;
            if (!portId) continue;

            const [nodeId, portType, portIndex] = this.parsePortId(portId);

            // 检查是否可以连接
            if (this.isValidConnectionTarget(nodeId, portType, parseInt(portIndex))) {
                portHubItem.classList.add('port-highlight');
                this.highlightedPorts.add(portHubItem);
                break; // 只高亮最上面的一个
            }
        }
    }

    // 清除高亮
    clearHighlights() {
        this.highlightedPorts.forEach(port => {
            port.classList.remove('port-highlight');
        });
        this.highlightedPorts.clear();
    }

    // 尝试创建连接
    tryCreateConnection(targetPort) {
        const { nodeId: targetNodeId, portType: targetPortType, portIndex: targetPortIndex } = targetPort;
        const { nodeId: startNodeId, portType: startPortType, portIndex: startPortIndex } = this.startInfo;

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
            id: connectionId,
            from: { nodeId: fromNodeId, portIndex: fromPortIndex },
            to: { nodeId: toNodeId, portIndex: toPortIndex },
            line: null
        };

        // 添加操作到历史记录
        if (window.vscodeAPI && window.vscodeAPI.addActionToHistory) {
            window.vscodeAPI.addActionToHistory({
                type: 'addConnection',
                connectionId: connectionId,
                connection: JSON.parse(JSON.stringify(connection))
            });
        }

        // 添加到connections数组
        this.connections.push(connection);

        // 更新节点连接状态
        const fromNode = this.nodes.get(fromNodeId);
        const toNode = this.nodes.get(toNodeId);

        if (fromNode) {
            if (!fromNode.connections.outputs[fromPortIndex]) {
                fromNode.connections.outputs[fromPortIndex] = [];
            }
            fromNode.connections.outputs[fromPortIndex].push(connectionId);
        }

        if (toNode) {
            if (!toNode.connections.inputs[toPortIndex]) {
                toNode.connections.inputs[toPortIndex] = [];
            }
            toNode.connections.inputs[toPortIndex].push(connectionId);
        }

        // 创建连接线
        this.createConnectionLine(connection);

        // 更新端口样式
        this.updatePortStyles();

        this.updateStatus(`已连接: ${fromNode.config.title} → ${toNode.config.title}`);
    }

    // 创建连接线SVG
    createConnectionLine(connection) {
        const svg = this.canvas.querySelector('#connections-svg') || this.createConnectionsSvg();

        // 获取节点和端口位置
        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

        if (!fromNode || !toNode) return;

        const fromPos = this.getPortPosition({
            nodeId: connection.from.nodeId,
            portType: 'output',
            portIndex: connection.from.portIndex
        });

        const toPos = this.getPortPosition({
            nodeId: connection.to.nodeId,
            portType: 'input',
            portIndex: connection.to.portIndex
        });

        // 创建SVG路径
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('connection-path', 'permanent-connection');
        path.setAttribute('data-connection-id', connection.id);
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
            this.removeConnection(connection.id);
        });

        svg.appendChild(path);
        connection.line = path;
    }

    // 清理拖拽状态
    cleanupDrag() {
        // 移除临时连接线
        if (this.tempLine) {
            this.tempLine.remove();
            this.tempLine = null;
        }

        // 移除拖拽样式
        if (this.currentPortElement) {
            this.currentPortElement.classList.remove('port-dragging');
        }

        // 清除高亮
        this.clearHighlights();

        // 移除全局事件监听
        document.removeEventListener('mousemove', this.handleDragMove.bind(this));
        document.removeEventListener('mouseup', this.handleDragEnd.bind(this));

        // 重置状态
        this.isDragging = false;
        this.startInfo = null;
        this.currentPortElement = null;
    }

    // 检查端口是否已连接
    isPortConnected(nodeId, portType, portIndex) {
        const node = this.nodes.get(nodeId);
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
        const { nodeId: startNodeId, portType: startPortType } = this.startInfo;

        // 基本验证
        if (nodeId === startNodeId) return false;
        if (this.isPortConnected(nodeId, portType, portIndex)) return false;
        if (startPortType === portType) return false;

        // 输入必须连输出，输出必须连输入
        if (startPortType === 'input' && portType !== 'output') return false;
        if (startPortType === 'output' && portType !== 'input') return false;

        return true;
    }

    // 获取端口位置
    getPortPosition(portInfo) {
        const { nodeId, portType, portIndex } = portInfo;
        const node = this.nodes.get(nodeId);
        if (!node || !node.element) return { x: 0, y: 0 };

        const portElement = node.element.querySelector(
            `.port-hub-item[data-port-id="${nodeId}-${portType}-${portIndex}"] .port-dot`
        );

        if (!portElement) {
            // 返回节点的中心位置作为备用
            return {
                x: node.x + node.element.offsetWidth / 2,
                y: node.y + node.element.offsetHeight / 2
            };
        }

        const canvasRect = this.canvas.getBoundingClientRect();
        const portRect = portElement.getBoundingClientRect();

        return {
            x: portRect.left + portRect.width / 2 - canvasRect.left,
            y: portRect.top + portRect.height / 2 - canvasRect.top
        };
    }

    // 创建曲线路径
    createCurvedPath(startX, startY, endX, endY) {
        const dx = endX - startX;
        const dy = endY - startY;

    // 计算控制点距离，根据水平距离动态调整
    const minControlDistance = 50;
    const maxControlDistance = 200;
    let controlDistance = Math.abs(dx) * 0.5;
    controlDistance = Math.max(minControlDistance, Math.min(controlDistance, maxControlDistance));

    // 计算控制点
        let cp1x, cp1y, cp2x, cp2y;

        if (dx >= 0) {
            // 向右连接
            cp1x = startX + controlDistance;
            cp1y = startY;
            cp2x = endX - controlDistance;
            cp2y = endY;
        } else {
            // 向左连接
            cp1x = startX - controlDistance;
            cp1y = startY;
            cp2x = endX + controlDistance;
            cp2y = endY;
        }

        return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
    }

    // 解析端口ID
    parsePortId(portId) {
        const parts = portId.split('-');
        const nodeId = `${parts[0]}-${parts[1]}`;
        const portType = parts[2];
        const portIndex = parts[3];

        return [nodeId, portType, parseInt(portIndex)];
    }

    // 移除端口连接
    removePortConnection(nodeId, portType, portIndex) {
        const node = this.nodes.get(nodeId);
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

        this.updateStatus(`已断开连接`);
    }

    // 移除连接
    removeConnection(connectionId) {
        // 从connections数组中查找并移除
        const connectionIndex = this.connections.findIndex(conn => conn.id === connectionId);
        if (connectionIndex === -1) return;

        const connection = this.connections[connectionIndex];

        // 从节点连接中移除
        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

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

        this.updateStatus(`已断开连接`);
    }

    // 显示连接信息
    showConnectionInfo(nodeId, portType, portIndex) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        const connectionIds = portType === 'input'
            ? node.connections.inputs[portIndex] || []
            : node.connections.outputs[portIndex] || [];

        if (connectionIds.length > 0) {
            let info = `连接信息: `;
            connectionIds.forEach((connId, index) => {
                const connection = this.connections.find(conn => conn.id === connId);
                if (connection) {
                    const fromNode = this.nodes.get(connection.from.nodeId);
                    const toNode = this.nodes.get(connection.to.nodeId);
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
            `.port-hub-item[data-port-id="${nodeId}-${portType}-${portIndex}"] .port-dot`
        );
    }
}

// 直接导出为全局对象，供webview使用
window.PortDragManager = PortDragManager;
