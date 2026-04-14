import { NodeGenerator } from "../generators/nodeGenerator.js";
import { NodeModel } from "../models/nodeModels/nodeModel.js";
import { BaseNodeModel } from "../models/nodeModels/baseNodeModel.js";
import { ControllerCore } from "./controllerCore.js";
import { EventBus } from "../types/eventBus.js";
import { NodeView } from "../views/nodeView.js";
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
        super(bus, viewport, world, coreSpace);

        this.idGenerator = new BitmapIdGenerator();
        this.uidGenerator = new BitmapIdGenerator();

        // 节点列表
        /**@type {Map<NodeID, BaseNodeModel>} */
        this.nodes = new Map();
        /**@type {Map<NodeID, NodeView>} */
        this.nodeViews = new Map();
        this.maxIndex = 0;

        this._initListeners();

        this._onEvent();
    }

    _initListeners() {
        // document.addEventListener('mousedown', this.handleClick.bind(this));
    }

    _onEvent() {
        this.bus.on('canvas:click', this.clearNodeSelected.bind(this))
        this.bus.on('addNode', this._addNode.bind(this))
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

    _addNode(e) {
        this.addNode(e.detail.type, null, null);
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
            uid = this.uidGenerator.generate();
            if (!id) {
                throw new Error('节点数量已达到最大值');
            }

            // 创建节点视图
            const { nodeView, nodeModel } = NodeGenerator.createNode(String(id), uid, type, x, y);

            this.world.appendChild(nodeView.element);
            nodeView.onMounted();

            this._bindModelListeners(nodeModel);

            this.nodes.set(String(id), nodeModel);


            this.nodeViews.set(String(id), nodeView);

            this.bus.emit('nodeAdded', nodeModel);

        } catch (error) {
            console.error('添加节点失败:', error);
            if (id) {
                this.idGenerator.release(id);
            }
            if (uid) {
                this.uidGenerator.release(uid);
            }
            this.bus.emit('nodeAddFailed', error);
        }
    }

    _deleteNode(e) {
        this.bus.emit('delete:node', { nodeId: e.detail.target });
        this.deleteNode(e.detail.target);
    }

    /**
     * @param {BaseNodeModel} nodeModel
     */
    _bindModelListeners(nodeModel) {

        nodeModel.addEventListener('delete', this._deleteNode.bind(this));
        nodeModel.addEventListener('mousedown', (/**@type {CustomEvent}*/e) => {
            switch(this.coreSpace.mode){
                case 'select':
                    nodeModel.setSelected(true);
                    break;
                case 'drag':
                    this._handleNodeClick(e, nodeModel);
                    break;
                case 'focus':
                    break;
                default:
                    break;

            }
            const originalEvent = e.detail.originalEvent;

            this.bus.emit('drag-start:node', { originalEvent, selectedNodes: this.coreSpace.selectedNodes });


        });

        nodeModel.addEventListener('mousedown:port', (/**@type {CustomEvent} */e) => {
            this.setNodeSelected(nodeModel, true);
            this.bus.emit('drag-start:port', { ...e.detail, node: nodeModel });
        });

        nodeModel.addEventListener('mouseup:port', (/**@type {CustomEvent} */e) => {
            this.bus.emit('drag-end:port', { ...e.detail, node: nodeModel });
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

    /**
     * @param {NodeID} nodeId
     */
    deleteNode(nodeId) {

        if (typeof nodeId === 'number') {
            nodeId = String(nodeId);
        }

        let node = this.nodes.get(nodeId);
        // console.log(node?.toJSON());
        console.log(node?.toModJSON());
        if (!node) {
            console.error(`无法找到删除目标${nodeId}`)
            return;
        }
        this.idGenerator.release(nodeId);

        if (node instanceof NodeModel) {
            this.uidGenerator.release(node.uid);
        }

        this.nodes.delete(nodeId);

        if (this.nodes.size === 0) {
            this.bus.emit('nodeRemoved:All')
        }

        if (this.coreSpace.setting.quickDelete){
            this.nodeViews.get(nodeId).element.remove();
            this.nodeViews.delete(nodeId);
            return;
        }

        node.destroy();

        let nodeView = this.nodeViews.get(nodeId);

        if (nodeView) {
            nodeView.destroy()
        }

        this.nodeViews.delete(nodeId);


        node = null;
        nodeView = null;
    }

    hiddenNode(nodeId) {
        let node = this.nodes.get(nodeId);
        if (!node) {
            console.error(`无法找到隐藏目标${nodeId}`)
            return;
        }
    }

    // 删除所有节点
    clear() {

        if (this.coreSpace.setting.quickClear) {
            const test_nodes = this.world.querySelectorAll(".test-node");
            test_nodes.forEach((node) => node.remove());
            const nodes = this.world.querySelectorAll(".node");
            nodes.forEach((node) => node.remove());

            this.bus.emit('nodeRemoved:All')
        } else {
            this.nodes.forEach((node) => {
                this.deleteNode(node.id);
            })
        }

        this.nodes.clear();
        this.nodeViews.clear();
        this.idGenerator.reset();
        this.uidGenerator.reset();
        this.highlightCache = {
            highlightedNodes: new Set(),
            dimmedConnections: new Set()
        };

        this.bus.emit('ClearOver:nodeManager', {});
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

    /** 
     * 释放ID
     * @param {number|string} id - 要释放的ID
     */
    release(id) {

        if (typeof id != 'number') {
            if (typeof id == 'string') {
                id = parseInt(id);
            } else {
                throw new Error('无效的ID类型');
            }
        }

        if (id < 1 || id > this.maxSize) {
            throw new Error(`id ${id} 超出范围 (1-${this.maxSize})`);
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

