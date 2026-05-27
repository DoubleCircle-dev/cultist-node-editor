import { NodeModel } from '../models/nodeModels/nodeModel.js';
import { EventBus } from '../types/eventBus.js';
import { NodeView } from '../views/nodeView.js';
import { ControllerCore } from './controllerCore.js';
import { IManager } from './manager.js';
import { BaseNodeModel } from '../models/nodeModels/baseNodeModel.js';
import { BaseProp } from '../models/propModels/baseProp.js';
import { NodeGenerator } from '../generators/nodeGenerator.js';

/**
 * 节点管理器类，用于管理画布上的节点 该类负责处理节点的创建、删除、更新等操作
 *
 * @class NodeManager
 * @extends IManager
 */
export class NodeManager extends IManager {
    /**
     * 创建节点管理器实例
     *
     * @param {EventBus} bus - 事件总线，用于管理器间的通信
     * @param {HTMLElement} viewport - 视口元素，用于容纳节点
     * @param {HTMLElement} world - 画布元素，用于渲染节点
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus, viewport, world, coreSpace);

        this.idGenerator = new BitmapIdGenerator();
        this.uidGenerator = new BitmapIdGenerator();

        // 节点列表
        /** @type {Map<NodeID, import('./nodeActionManager.js').BaseNodeModel>} */
        this.nodes = new Map();
        /** @type {Map<NodeID, NodeView>} */
        this.nodeViews = new Map();
        this.maxIndex = 0;

        this._initListeners();

        this._onEvent();
    }

    /** @private */
    _initListeners() {}

    /** @private */
    _onEvent() {
        this.bus.on('canvas:click', this.clearNodeSelected.bind(this));
        this.bus.on('addNode', this._addNode.bind(this));
    }

    get SelectedNodes() {
        const result = [];

        this.nodes.forEach((node) => {
            if (node.selected) {
                result.push(node);
            }
        });

        return result;
    }

    /**
     * @param {NodeID} id
     * @returns {import('./nodeActionManager.js').BaseNodeModel | undefined}
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

    /** @private */
    _addNode(e) {
        this.addNode(e.detail.type, null, null);
    }

    /**
     * @private
     * @param {BaseNodeModel} nodeModel
     */
    _createNode(nodeModel) {
        if (nodeModel instanceof NodeModel) {
            this.idGenerator.occupy(nodeModel.id);

            this.uidGenerator.occupy(nodeModel.uid);

            const nodeView = new NodeView(nodeModel);

            this.world.appendChild(nodeView.element);
            nodeView.onMounted();

            this._bindModelListeners(nodeModel);

            this.nodes.set(String(nodeModel.id), nodeModel);

            this.nodeViews.set(String(nodeModel.id), nodeView);
        }
    }

    /**
     * @param {string} type
     * @param {number | null} Px
     * @param {number | null} Py
     */
    addNode(type, Px, Py) {
        /** @type {number | null} */
        let id = null;
        let uid = null;

        let x = Px || 0;
        let y = Py || 0;
        if (!Px || !Py) {
            ({ x, y } = this.coreSpace.ViewCenter);
            x = x + Math.random() * 300 - 150;
            y = y + Math.random() * 100 - 100;
        }
        try {
            // 分配id
            id = this.idGenerator.generate();
            uid = this.uidGenerator.generate() || 0;
            if (!id) {
                throw new Error('节点数量已达到最大值');
            }

            // 创建节点视图
            const nodeModel = NodeGenerator.createNode(String(id), uid, type, x, y);

            this._createNode(nodeModel);

            this.bus.standardEmitDetail(
                'create',
                'node',
                { nodes: [nodeModel] },
                () => {
                    this._removeNode(String(id));
                },
                () => {
                    this._createNode(nodeModel);
                }
            );
        } catch (error) {
            console.error('添加节点失败:', error);
            if (id) {
                this.idGenerator.release(id);
            }
            if (uid) {
                this.uidGenerator.release(uid);
            }
            this.bus.emit('create:node:failed', error);
        }
    }

    /**
     * @private
     * @param {Event} e
     */
    _deleteNode(e) {
        /** @type {string[]} */
        const ids = [];
        /** @type {import('./nodeActionManager.js').BaseNodeModel[]} */
        const models = [];

        switch (this.coreSpace.mode) {
            case 'select':
                this.deleteNodes(this.SelectedNodes.map((node) => node.id));
                break;
            case 'drag':
                break;
            case 'focus':
                break;
            default:
                break;
        }
    }

    /**
     * @private
     * @param {import('./nodeActionManager.js').BaseNodeModel} nodeModel
     */
    _bindModelListeners(nodeModel) {
        nodeModel.addEventListener('delete', this._deleteNode.bind(this));
        nodeModel.addEventListener('mousedown', (e) => {
            const ce = /** @type {CustomEvent} */ (e);
            const originalEvent = ce.detail.originalEvent;

            if (originalEvent.ctrlKey || originalEvent.metaKey) {
                this._handleNodeClick(ce, nodeModel);
                return;
            }

            let onFailed = () => {};
            let onSuccess = () => {};

            switch (this.coreSpace.mode) {
                case 'select':
                    onFailed = () => {
                        this.setNodeSelected(nodeModel, true);
                    };
                    if (!nodeModel.selected) {
                        onSuccess = () => {
                            this.setNodeSelected(nodeModel, true);
                        };
                    }
                    break;
                case 'drag':
                    this.clearNodeSelected();
                    return;
                // break;
                case 'focus':
                    break;
                default:
                    break;
            }

            this.bus.onceExclusive('drag:node:success', 'drag:node:failed', onFailed, onSuccess);

            nodeModel.setSelected(true);

            this.bus.emit('drag:node:start', {
                originalEvent,
                selectedNodes: this.coreSpace.selectedNodes,
            });
        });

        nodeModel.addEventListener('mousedown:port', (e) => {
            const ce = /** @type {CustomEvent} */ (e);
            this.setNodeSelected(nodeModel, true);
            this.bus.emit('drag:port:start', { ...ce.detail, node: nodeModel });
        });

        nodeModel.addEventListener('mouseup:port', (e) => {
            const ce = /** @type {CustomEvent} */ (e);
            this.bus.emit('drag:port:end', { ...ce.detail, node: nodeModel });
        });

        nodeModel.addEventListener('change:property:success', (e) => {
            const ce = /** @type {CustomEvent} */ (e);
            this.bus.standardEmitDetail(
                'change',
                'property',
                ce.detail,
                (/** @type {any} */ data) => {
                    nodeModel.setPropValue(data.propId, data.oldValue);
                },
                (/** @type {any} */ data) => {
                    nodeModel.setPropValue(data.propId, data.newValue);
                }
            );
        });

        nodeModel.addEventListener('append:property', (e) => {
            const ce = /** @type {CustomEvent} */ (e);

            const props = ce.detail.props;

            if (!props || props.length === 0) {
                return;
            }

            if (nodeModel instanceof NodeModel) {
                const panel = this._createNodePropertyPanel(nodeModel, props);

                this.bus.emit('toggleMenu', {
                    menu: panel,
                    menuId: panel.id,
                    position: ce.detail.position,
                });
            }
        });

        nodeModel.addEventListener('delete:property', (e) => {});
    }

    /**
     * @private
     * @param {NodeModel} nodeModel
     * @param {BaseProp[]} props
     */
    _createNodePropertyPanel(nodeModel, props) {
        const panel = document.createElement('div');
        panel.classList.add('node-extend-property-panel');
        panel.id = `${nodeModel.id}-extend-property-panel`;

        props.forEach((prop) => {
            const optEl = document.createElement('div');
            optEl.className = 'extend-prop-option';
            optEl.textContent = prop.label || prop.name;
            optEl.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                if (nodeModel.appendExtendProp(prop.id)) {
                    this.bus.standardEmitDetail(
                        'append',
                        'property',
                        { propId: prop.id },
                        (data) => {
                            nodeModel.removeExtendProp(data.propId);
                            nodeModel.emit('redraw', {});
                            panel.appendChild(optEl);
                        },
                        (data) => {
                            nodeModel.appendExtendProp(data.propId);
                            nodeModel.emit('redraw', {});
                            optEl.remove();
                        }
                    );
                    nodeModel.emit('redraw', {});
                    optEl.remove();
                } else {
                    nodeModel.emit('append:property:failed', { propId: prop.id });
                }

                this.bus.emit('toggleMenu', { menuId: panel.id });
            });
            panel.appendChild(optEl);
        });

        return panel;
    }

    /**
     * @private
     * @param {CustomEvent} evt
     * @param {import('./nodeActionManager.js').BaseNodeModel} model
     */

    _handleNodeClick(evt, model) {
        const e = /** @type {MouseEvent} */ (evt.detail.originalEvent);
        // 监听鼠标选中事件
        if (e.ctrlKey || e.metaKey) {
            // 多选模式：切换当前节点的选中状态，不改变其他
            this.toggleNodeSelected(model);
        } else {
            // 单选模式：选中当前节点
            this.setNodeSelected(model, true);
        }
    }

    clearNodeSelected() {
        Array.from(this.nodes.values()).forEach((node) => {
            if (node.selected) node.setSelected(false);
        });
    }

    /**
     * 设置节点选中状态
     *
     * @param {import('./nodeActionManager.js').BaseNodeModel} node - 要选中的节点
     * @param {boolean} [clearOthers=true] - 是否清除其他节点的选中状态. Default is `true`
     */
    setNodeSelected(node, clearOthers = true) {
        if (clearOthers) {
            this.clearNodeSelected();
        }

        if (!node.selected) {
            node.setSelected(true);
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
     * @private
     * @param {NodeID} nodeId
     */
    _removeNode(nodeId) {
        if (typeof nodeId === 'number') {
            nodeId = String(nodeId);
        }

        const node = this.nodes.get(nodeId);
        if (!node) {
            console.error(`无法找到删除目标${nodeId}`);
            return;
        }

        node.setSelected(false);
        node.removeAllEventListeners();

        if (node instanceof NodeModel) {
            this.uidGenerator.release(node.uid);
        }

        this.idGenerator.release(nodeId);

        const view = this.nodeViews.get(nodeId);
        if (view) {
            view.removeListeners();
            view.element.remove();
            this.nodeViews.delete(nodeId);
        }

        this.nodes.delete(nodeId);
    }

    /** @param {NodeID} nodeId */
    deleteNode(nodeId) {
        this.deleteNodes([nodeId]);
    }

    deleteNodes(nodeIds) {
        const models = nodeIds.map((nodeId) => this.nodes.get(nodeId));

        nodeIds.forEach((nodeId) => {
            this._removeNode(nodeId);
        });

        this.bus.standardEmitDetail(
            'delete',
            'node',
            { nodeIds, models },
            (/** @type {any} */ data) => {
                data.models.forEach((model) => {
                    this._createNode(model);
                });
            },
            (/** @type {any} */ data) => {
                data.nodeIds.forEach((nodeId) => {
                    this._removeNode(nodeId);
                });
            }
        );

        if (this.nodes.size === 0) {
            this.bus.emit('delete:all_node:success');
        }
    }

    hiddenNode(nodeId) {
        let node = this.nodes.get(nodeId);
        if (!node) {
            console.error(`无法找到隐藏目标${nodeId}`);
            return;
        }
    }

    // 删除所有节点
    clear() {
        if (this.coreSpace.setting.quickClear) {
            const test_nodes = this.world.querySelectorAll('.test-node');
            test_nodes.forEach((node) => node.remove());
            const nodes = this.world.querySelectorAll('.node');
            nodes.forEach((node) => node.remove());

            this.bus.emit('delete:all_node:success');
        } else {
            this.nodes.forEach((node) => {
                this.deleteNode(node.id);
            });
        }

        this.nodes.clear();
        this.nodeViews.clear();
        this.idGenerator.reset();
        this.uidGenerator.reset();
        this.highlightCache = {
            highlightedNodes: new Set(),
            dimmedConnections: new Set(),
        };

        this.bus.emit('ClearOver:nodeManager', {});
    }
}

/** BitmapIdGenerator 类 - 基于位图的高效ID生成器 使用位图来跟踪ID的使用状态，提供高效的ID分配和释放操作 */
class BitmapIdGenerator {
    /**
     * 构造函数
     *
     * @param {number} maxSize - 最大ID值，默认为999999
     */
    constructor(maxSize = 999999) {
        this.maxSize = maxSize;
        this.bitmap = new Uint32Array(Math.ceil(maxSize / 32)); // 使用位图存储使用状态
        this.nextId = 1;
    }

    // 设置位
    /** @private */
    _setBit(index) {
        const wordIndex = Math.floor(index / 32);
        const bitIndex = index % 32;
        this.bitmap[wordIndex] |= 1 << bitIndex;
    }

    // 清除位
    /** @private */
    _clearBit(index) {
        const wordIndex = Math.floor(index / 32);
        const bitIndex = index % 32;
        this.bitmap[wordIndex] &= ~(1 << bitIndex);
    }

    // 检查位
    /** @private */
    _checkBit(index) {
        const wordIndex = Math.floor(index / 32);
        const bitIndex = index % 32;
        return (this.bitmap[wordIndex] & (1 << bitIndex)) !== 0;
    }

    // 生成ID（更高效的算法）
    generate() {
        // 尝试从nextId开始查找
        for (let i = this.nextId; i <= this.maxSize; i++) {
            if (!this._checkBit(i - 1)) {
                // 位图索引从0开始
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
     *
     * @param {number | string} id - 要释放的ID
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
