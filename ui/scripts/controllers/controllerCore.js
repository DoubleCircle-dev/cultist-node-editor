import { EditorConfig } from "./constant.js";
import { NodeManager } from "./nodeManager.js";
import { CanvasManager } from "./canvasManager.js";
import { UIManager } from "./uiManager.js";
import { NodeActionManager } from "./nodeActionManager.js";
import { ConnectionManager } from "./connectionManager.js";
import { EventBus } from "./eventBus.js";

export class ControllerCore {

    /**
     * @param {HTMLElement} world
     * @param {HTMLElement} viewport
     */
    constructor(world, viewport) {
        this.world = world;
        this.viewport = viewport;
        this.bus = new EventBus();

        this.nodeManager = new NodeManager(this.bus, this.viewport, this.world, this);

        this.canvasManager = new CanvasManager(this.bus, this.viewport, this.world, this);

        this.uiManager = new UIManager(this.bus, this.viewport, this.world, this);

        this.nodeActionManager = new NodeActionManager(this.bus, this.viewport, this.world, this);

        this.connectionManager = new ConnectionManager(this.bus, this.viewport, this.world, this);

    }

    viewportToWorld(x, y) {
        if (!this.canvasManager) {
            console.error("无法转化坐标，canvasManager未初始化");
            return { x, y };
        }
        return this.canvasManager.viewportToWorld(x, y);
    }

    worldToViewport(x, y) {
        if (!this.canvasManager) {
            console.error("无法转化坐标，canvasManager未初始化");
        }
        return this.canvasManager.worldToViewport(x, y);
    }

    get Nodes() {
        const nodes = this.nodeManager.nodes;
        return Array.from(nodes.values());
    }

    get SelectedNodes() {
        return this.nodeManager.SelectedNodes;
    }

    get ViewCenter() {
        return this.canvasManager.ViewCenter;
    }

    clearCanvas() {
        // this.historyManager.clear();

        this.nodeManager.clear();
        // this.connectionManager.clear();
        // this.nodeActionManager.clear();

        this.canvasManager.reset();
        // this.uiManager.reset();
    }
}
