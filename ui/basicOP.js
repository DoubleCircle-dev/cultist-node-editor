// 仅限Webview中使用，禁用检查
/* eslint-disable no-undef */
// @ts-nocheck

// /src/ui/basicOP.js

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
