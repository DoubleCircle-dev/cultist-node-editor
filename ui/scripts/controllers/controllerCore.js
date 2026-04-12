import { EditorConfig } from "./constant.js";
import { BaseNodeModel } from "../models/nodeModels/baseNodeModel.js";
import { NodeManager } from "./nodeManager.js";
import { CanvasManager } from "./canvasManager.js";
import { UIManager } from "./uiManager.js";
import { NodeActionManager } from "./nodeActionManager.js";
import { ConnectionManager } from "./connectionManager.js";
import { EventBus } from "./eventBus.js";
import { PanelManager } from "./panelManager.js";

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

        this.panelManager = new PanelManager(this.bus, this.viewport, this.world, this);

        this.setting = {
            refreshMovingConnection: true,
            checkConnectionPos: false,
            quickClear: true,
            quickDelete: true,
        }
    }

    /**
     * @param {number} x
     * @param {number} y 
     */
    viewportToWorld(x, y) {
        if (!this.canvasManager) {
            console.error("无法转化坐标，canvasManager未初始化");
            return { x, y };
        }
        return this.canvasManager.viewportToWorld(x, y);
    }
    /**
     * @param {number} x
     * @param {number} y 
     */
    worldToViewport(x, y) {
        if (!this.canvasManager) {
            console.error("无法转化坐标，canvasManager未初始化");
        }
        return this.canvasManager.worldToViewport(x, y);
    }

    get nodes() {
        const nodes = this.nodeManager.nodes;
        return Array.from(nodes.values());
    }

    get mode(){
        if (!this.canvasManager) {
            console.error("无法获取模式，canvasManager未初始化");
            return null;
        }
        return this.canvasManager.mode;
    }

    get selectedNodes() {
        /**
         * @type {BaseNodeModel[]}
         */
        const selectedNodes = [];
        this.nodes.forEach(node => {
            if (node.selected) selectedNodes.push(node);
        });

        return selectedNodes;
    }

    get ViewCenter() {
        return this.canvasManager.ViewCenter;
    }

    clearCanvas() {
        // this.historyManager.clear();

        this.nodeManager.clear();
        this.connectionManager.clear();
        // this.nodeActionManager.clear();



        this.canvasManager.reset();
        // this.uiManager.reset();

        if (this.canvasManager) {
            this.forceRepaint();
            // console.log('刷新页面')
        }


    }

    forceRepaint() {
        this.canvasManager.refresh();

    }
}
