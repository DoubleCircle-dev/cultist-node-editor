export class EventBus extends EventTarget {
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
        // 原生的 EventTarget 必须派发 Event 对象
        // 使用 CustomEvent 可以将自定义数据挂载到 detail 属性上
        if (eventName === 'NODE_DRAG_START') {
            console.log('NODE_DRAG_START', detail);
        }
        const event = new CustomEvent(eventName, { detail });
        this.dispatchEvent(event);
    }
}
