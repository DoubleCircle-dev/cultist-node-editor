import { EventBus } from "./eventBus.js";
import { ControllerCore } from "./controllerCore.js";

export class NodeActionManager {

    /**
     * @param {EventBus} bus
     * @param {HTMLElement} viewport
     * @param {HTMLElement} world
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        this.bus = bus;
        this.viewport = viewport;
        this.world = world;
        this.coreSpace = coreSpace;

        // 拖拽相关变量
        this.dragState = {
            isDragging: false,
            offsetX: 0,
            offsetY: 0,
            initialX: 0,
            initialY: 0,
            draggedNodes: [],
            startPositions: [],
        };

        this._onEvents();
    }

    _onEvents() {
        this.bus.on('drag-start:node', this._onNodeDragStart.bind(this));
    }

    _shouldIgnore(e) {
        const target = e.target;
        return NodeActionManager.ignoreItem.some(item => target.matches(item));
    }

    _onNodeDragStart(e) {
        // if(this._shouldIgnore(e.detail.originalEvent)) return;

        const { clientX, clientY, offsetX, offsetY } = e.detail.originalEvent;
        if (this.coreSpace.SelectedNodes.length === 0) return;

        if (this.dragState.isDragging) return;
        this.dragState.isDragging = true;
        this.dragState.offsetX = offsetX;
        this.dragState.offsetY = offsetY;
        ({ x: this.dragState.initialX, y: this.dragState.initialY } = this.coreSpace.canvasManager.viewportToWorld(clientX, clientY));
        this.dragState.dragNodes = [];
        this.coreSpace.nodeManager.nodes.forEach(node => {
            if (node.selected) {
                this.dragState.draggedNodes.push(node);
            }
        })


        window.addEventListener('mousemove', this._onDragMove);
        window.addEventListener('mouseup', this._onDragEnd);
    }

    _onDragMove = (e) => {
        if (!this.dragState.isDragging) return;

        // 计算鼠标移动后的世界坐标
        const worldNew = this.coreSpace.canvasManager.viewportToWorld(e.clientX, e.clientY );

        const dx = worldNew.x - this.dragState.initialX;
        const dy = worldNew.y - this.dragState.initialY;

        // 更新每个节点的位置
        this.dragState.draggedNodes.forEach((node, index) => {
            node.moveBy(dx, dy);
        });

        this.dragState.initialX = worldNew.x;
        this.dragState.initialY = worldNew.y;

        this.bus.emit('drag-moving:node', { nodes: this.dragState.draggedNodes });
    }

    _onDragEnd = (e) => {
        if (!this.dragState.isDragging) return;

        this.dragState = {
            isDragging: false,
            offsetX: 0,
            offsetY: 0,
            initialX: 0,
            initialY: 0,
            draggedNodes: [],
            startPositions: [],
        };

        // 移除全局监听
        window.removeEventListener('mousemove', this._onDragMove);
        window.removeEventListener('mouseup', this._onDragEnd);

        // 发布拖拽结束事件
        this.bus.emit('drag-end:node', { nodeIds: this.dragState.nodeIds });

        this.dragState.isDragging = false;
    };

    /**
     * @param {NodeID} nodeId
     * @param {number} x
     * @param {number} y
     */

    handleDrag(nodeId, x, y) {

    }
}
