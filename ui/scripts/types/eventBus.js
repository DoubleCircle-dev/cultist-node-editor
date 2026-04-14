import { IEventTarget } from "./IEventTarget.js";

export class EventBus extends IEventTarget {
    constructor() {
        super();
    }

    /**
     * 订阅（监听）事件
     * @param {string} eventName - 事件名称
     * @param {(e: CustomEvent) => void} listener - 回调函数
     */
    on(eventName, listener) {
        // @ts-expect-error CustomEvent 回调与 EventListener 不兼容，但运行时安全
        this.addEventListener(eventName, listener);
    }

    /**
     * 取消订阅事件
     * @param {string} eventName - 事件名称
     * @param {(e: CustomEvent) => void} listener - 回调函数
     */
    off(eventName, listener) {
        // @ts-expect-error CustomEvent 回调与 EventListener 不兼容，但运行时安全
        this.removeEventListener(eventName, listener);
    }

    /**
     * 发布（触发）事件
     * @param {string} eventName - 事件名称
     * @param {any} detail - 需要传递的数据
     */
    emit(eventName, detail = {}) {
        const event = new CustomEvent(eventName, { detail });
        this.dispatchEvent(event);
    }
}
