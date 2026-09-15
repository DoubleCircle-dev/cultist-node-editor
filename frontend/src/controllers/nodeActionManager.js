import { EventBus } from '../types/eventBus.js';
import { ControllerCore } from './controllerCore.js';
import { IManager } from './manager.js';

/** @typedef {import('../models/nodeModels/baseNodeModel.js').BaseNodeModel} BaseNodeModel */

export class NodeActionManager extends IManager {
    /**
     * @param {EventBus} bus
     * @param {HTMLElement} viewport
     * @param {HTMLElement} world
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus, viewport, world, coreSpace);

        // 拖拽相关变量
        this.dragState = {
            isDragging: false,
            startX: 0,
            startY: 0,
            initialX: 0,
            initialY: 0,
            /** @type {BaseNodeModel[]} */
            draggedNodes: [],
            startPositions: [],
        };

        this._onEvents();
    }

    /** @private */
    _onEvents() {
        this.listenerMaps.push(this.autoBind(this.bus, 'drag:node:start', this._onNodeDragStart));
    }

    /**
     * @private
     * @param {CustomEvent<any>} evt
     */
    _onNodeDragStart(evt) {
        // if(this._shouldIgnore(e.detail.originalEvent)) return;
        const e = /** @type {CustomEvent} */ (evt);

        if (this.coreSpace.selectedNodes.length === 0) {
            this.bus.standardEmitMessage('drag', 'node', 'failed');
            return;
        }

        const { clientX, clientY, offsetX, offsetY } = e.detail.originalEvent;

        if (this.dragState.isDragging) return;
        this.dragState.isDragging = true;
        ({ x: this.dragState.initialX, y: this.dragState.initialY } = this.coreSpace.viewportToWorld(clientX, clientY));
        this.dragState.startX = this.dragState.initialX;
        this.dragState.startY = this.dragState.initialY;
        this.dragState.draggedNodes = e.detail.selectedNodes;

        window.addEventListener('mousemove', this._onDragMove);
        window.addEventListener('mouseup', this._onDragEnd);
    }

    /** @private */
    _checkMoveValid = (/** @type {number} */ dx, /** @type {number} */ dy) => {
        return Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
    };

    /** @private */
    _onDragMove = (/** @type {{ clientX: number; clientY: number }} */ e) => {
        if (!this.dragState.isDragging) return;

        // 计算鼠标移动后的世界坐标
        const worldNew = this.coreSpace.viewportToWorld(e.clientX, e.clientY);

        const dx = worldNew.x - this.dragState.startX;
        const dy = worldNew.y - this.dragState.startY;

        if (this._checkMoveValid(worldNew.x - this.dragState.initialX, worldNew.y - this.dragState.initialY)) {
            this.bus.standardEmitMessage('drag', 'node', 'success');
            this.dragState.draggedNodes = this.coreSpace.selectedNodes;
        }

        // 更新每个节点的位置
        this.dragState.draggedNodes.forEach((node) => {
            node.moveBy(dx, dy);
        });

        const nodeIds = this.dragState.draggedNodes.map((node) => node.id);

        this.dragState.startX = worldNew.x;
        this.dragState.startY = worldNew.y;

        this.bus.emit('drag:node:running', { nodeIds, dx, dy });
    };

    /** @private */
    _onDragEnd = (/** @type {any} */ e) => {
        if (!this.dragState.isDragging) return;
        const dx = this.dragState.startX - this.dragState.initialX;
        const dy = this.dragState.startY - this.dragState.initialY;

        const nodeIds = this.dragState.draggedNodes.map((node) => node.id);

        if (Math.abs(dx) <= 0.01 && Math.abs(dy) <= 0.01) {
            this.bus.standardEmitMessage('drag', 'node', 'failed');
            this._cleanDragState();
            return;
        }

        // 发布拖拽结束事件
        this.bus.standardEmitDetail(
            'drag',
            'node',
            { nodeIds, nodes: this.dragState.draggedNodes },
            (/** @type {any} */ data) => {
                data.nodes.forEach((/** @type {BaseNodeModel} */ node) => {
                    node.moveBy(-dx, -dy);
                });
                this.bus.emit('drag:node:end', { nodeIds, dx: -dx, dy: -dy });
            },
            (/** @type {any} */ data) => {
                data.nodes.forEach((/** @type {BaseNodeModel} */ node) => {
                    node.moveBy(dx, dy);
                });
                this.bus.emit('drag:node:end', { nodeIds, dx, dy });
            }
        );

        this._cleanDragState();
    };

    /** @private */
    _cleanDragState() {
        this.dragState = {
            isDragging: false,
            startX: 0,
            startY: 0,
            initialX: 0,
            initialY: 0,
            draggedNodes: [],
            startPositions: [],
        };
        // 移除全局监听
        window.removeEventListener('mousemove', this._onDragMove);
        window.removeEventListener('mouseup', this._onDragEnd);
    }
}
