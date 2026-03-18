import { EventBus } from "./eventBus.js";
import { ControllerCore } from "./controllerCore.js";

export class UIManager {

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

        this.updateStatus = null;
        this.mousePosition = null;
        this.viewControlPanel = null;
        this._initComponents();

        this._initListeners();
    }

    _initComponents() {
        this.updateStatus = document.getElementById("status");
        this.mousePosition = document.getElementById("mouse-coords");
        this.viewControlPanel = document.getElementsByClassName("view-controls").item(0);
        this.tooltip = document.getElementsByClassName(".tooltip-trigger").item(0) || document.createElement("div");
        this.tooltip.classList.add("tooltip-trigger");
        this.tooltip.setAttribute("id", "tooltip");
        console.log(this.tooltip);
        this.viewport.appendChild(this.tooltip);
    }

    _initListeners() {
        this.bus.on("mousePosition", this.updateMousePosition.bind(this));
    }

    /**
     * @param {CustomEvent} e
     */
    updateMousePosition(e) {
        if (this.mousePosition){
            this.mousePosition.textContent = `视口:(${Math.round(e.detail.viewportX)}, ${Math.round(e.detail.viewportY)}) 世界:(${e.detail.worldX.toFixed(1)}, ${e.detail.worldY.toFixed(1)})`;
        }else {
            console.warn("鼠标位置更新显示失败");
        }
    }
}
