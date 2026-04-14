import { EventBus } from "../types/eventBus.js";
import { ControllerCore } from "./controllerCore.js";

export class IManager{

    /**
     * @param {HTMLElement} viewport - 视口元素，用于容纳节点
     * @param {HTMLElement} world - 画布元素，用于渲染节点
     * @param {EventBus} bus - 事件总线，用于管理器间的通信
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {

        this.id = this.constructor.name + Date.now() + '-' + Math.random().toString(36).substring(2, 15);

        this.viewport = viewport;
        this.world = world;
        this.bus = bus;
        this.coreSpace = coreSpace;
    }


}
