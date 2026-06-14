import { EventBus } from '../types/eventBus.js';
import { ControllerCore } from './controllerCore.js';

export class IManager {
    /**
     * @param {EventBus} bus - 事件总线，用于管理器间的通信
     * @param {HTMLElement} viewport - 视口元素，用于容纳节点
     * @param {HTMLElement} world - 画布元素，用于渲染节点
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        this.id = this.constructor.name + Date.now() + '-' + Math.random().toString(36).substring(2, 15);

        this.viewport = viewport;
        this.world = world;
        this.bus = bus;
        this.coreSpace = coreSpace;

        /** @type {listenerMap[]} */
        this.listenerMaps = [];

        this.checkValid();
    }

    /**
     * 自动绑定this
     *
     * @param {EventTarget} target - 绑定目标
     * @param {string} event
     * @param {Function} listener - 绑定函数
     * @returns {listenerMap} - 返回绑定函数
     */
    autoBind(target, event, listener) {
        const listenerBind = listener.bind(this);
        target.addEventListener(event, listenerBind);

        return { target, type: event, listener: listenerBind };
    }

    /**
     * @param {EventTarget} target - 绑定目标
     * @param {string} event
     * @param {Function} listener - 绑定函数
     */
    registerListener(target, event, listener) {
        this.listenerMaps.push(this.autoBind(target, event, listener));
    }

    /**
     * @param {EventTarget} target - 绑定目标
     * @param {string} event
     * @param {Function} listener - 绑定函数
     */
    removeListener(target, event, listener) {
        const index = this.listenerMaps.findIndex((m) => m.target === target && m.type === event && m.listener === listener);
        if (index === -1) return false;

        const item = this.listenerMaps[index];
        item.target?.removeEventListener(item.type, item.listener);
        this.listenerMaps.splice(index, 1);
        return true;
    }

    removeListeners() {
        this.listenerMaps.forEach((listenerMap) => {
            listenerMap.target.removeEventListener(listenerMap.type, listenerMap.listener);
        });
        this.listenerMaps = [];
    }

    checkValid() {
        if (this.viewport == null || this.world == null || this.bus == null || this.coreSpace == null) {
            throw new Error(`创建管理器失败，id: ${this.id}`);
        }
    }

    destroy() {
        this.removeListeners();
    }
}
