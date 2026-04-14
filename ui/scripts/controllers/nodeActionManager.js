import { EventBus } from "../types/eventBus.js";
import { ControllerCore } from "./controllerCore.js";
import { IManager } from "./manager.js";
import { BaseNodeModel } from "../models/nodeModels/baseNodeModel.js";

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
            /**@type {BaseNodeModel[]} */
            draggedNodes: [],
            startPositions: [],
        };

        this._onEvents();
    }

    _onEvents() {
        this.bus.on('drag-start:node', this._onNodeDragStart.bind(this));
    }

    _onNodeDragStart(e) {
        // if(this._shouldIgnore(e.detail.originalEvent)) return;

        if (this.coreSpace.selectedNodes.length === 0) {
            this.bus.emit('drag-failed:node', { nodesId: [] });
            return;
        };

        const { clientX, clientY, offsetX, offsetY } = e.detail.originalEvent;

        if (this.dragState.isDragging) return;
        this.dragState.isDragging = true;
        ({ x: this.dragState.initialX, y: this.dragState.initialY } =
            this.coreSpace.viewportToWorld(clientX, clientY));
        this.dragState.startX = this.dragState.initialX;
        this.dragState.startY = this.dragState.initialY;
        this.dragState.draggedNodes = e.detail.selectedNodes;

        window.addEventListener('mousemove', this._onDragMove);
        window.addEventListener('mouseup', this._onDragEnd);
    }

    _onDragMove = (e) => {
        if (!this.dragState.isDragging) return;

        // 计算鼠标移动后的世界坐标
        const worldNew = this.coreSpace.viewportToWorld(e.clientX, e.clientY);

        const dx = worldNew.x - this.dragState.startX;
        const dy = worldNew.y - this.dragState.startY;

        // 更新每个节点的位置
        this.dragState.draggedNodes.forEach((node) => {
            node.moveBy(dx, dy);
        });

        const nodesId = this.dragState.draggedNodes.map(node => node.id);

        this.dragState.startX = worldNew.x;
        this.dragState.startY = worldNew.y;

        this.bus.emit('drag-moving:node', { nodesId, dx, dy });
    }

    _onDragEnd = (e) => {
        if (!this.dragState.isDragging) return;
        const dx = this.dragState.startX - this.dragState.initialX;
        const dy = this.dragState.startY - this.dragState.initialY;

        const nodesId = this.dragState.draggedNodes.map(node => node.id);

        if (dx <= 0.1 && dy <= 0.1) {
            this.bus.emit('drag-failed:node', { nodesId });
        }

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


        // 发布拖拽结束事件
        this.bus.emit('drag-end:node', { nodesId });

        this.dragState.isDragging = false;
    };

}
