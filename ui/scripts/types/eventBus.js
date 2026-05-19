import { IEventTarget } from './IEventTarget.js';
import { StandardDetail, StandardMessage } from './standardDetail.js';

export class EventBus extends IEventTarget {
    constructor() {
        super();
    }

    /**
     * 订阅（监听）事件
     *
     * @param {string} eventName - 事件名称
     * @param {(e: CustomEvent) => void} listener - 回调函数
     */
    on(eventName, listener) {
        // @ts-expect-error CustomEvent 回调与 EventListener 不兼容，但运行时安全
        this.addEventListener(eventName, listener);
    }

    /**
     * 订阅（监听）事件，只触发一次
     *
     * @param {string} eventName - 事件名称
     * @param {(e: Event) => void} listener - 回调函数
     */
    once(eventName, listener) {
        const onceListener = (/** @type {Event} */ e) => {
            listener(e);
            this.removeEventListener(eventName, onceListener);
        };
        this.addEventListener(eventName, onceListener);
    }

    /**
     * 取消订阅事件
     *
     * @param {string} eventName - 事件名称
     * @param {(e: CustomEvent) => void} listener - 回调函数
     */
    off(eventName, listener) {
        // @ts-expect-error CustomEvent 回调与 EventListener 不兼容，但运行时安全
        this.removeEventListener(eventName, listener);
    }

    /**
     * 订阅两个互斥事件，当其中一个事件触发时，另一个事件将不再触发
     *
     * @param {string} eventA - 事件A名称
     * @param {string} eventB - 事件B名称
     * @param {(e: CustomEvent) => void} handlerA - 事件A的回调函数
     * @param {(e: CustomEvent) => void} handlerB - 事件B的回调函数
     */
    onceExclusive(eventA, eventB, handlerA, handlerB) {
        let cleaned = false;

        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            this.off(eventA, wrapperA);
            this.off(eventB, wrapperB);
        };

        const wrapperA = (/** @type {CustomEvent} */ e) => {
            cleanup();
            handlerA(e);
        };

        const wrapperB = (/** @type {CustomEvent} */ e) => {
            cleanup();
            handlerB(e);
        };

        this.on(eventA, wrapperA);
        this.on(eventB, wrapperB);

        return cleanup;
    }

    /**
     * 发布（触发）事件,增加日志记录功能
     *
     * @param {string} eventName - 事件名称
     * @param {any} detail - 需要传递的数据
     * @param {boolean} log - 是否记录日志
     */
    emit(eventName, detail = {}, log = false) {
        super.emit(eventName, detail);
        if (log) {
            this.logEvent(eventName, detail);
        }
    }

    /**
     * 通过发布消息通知记录事件
     *
     * @param {string} eventName - 事件名称
     * @param {any} detail - 需要传递的数据
     */
    logEvent(eventName, detail) {
        const log = new CustomEvent('log', { detail: { eventName, data: detail } });
        this.dispatchEvent(log);
    }

    /**
     * 分发带有标准detail的事件
     *
     * @param {string} type
     * @param {string} targetType
     * @param {string} status
     * @param {any} data
     * @param {Function | null} undoFunction
     * @param {Function | null} redoFunction
     */
    standardEmitDetail(type, targetType, data, undoFunction = null, redoFunction = null, status = 'finished') {
        const detail = new StandardDetail(type, targetType, data, status);

        if (!detail.checkValid()) {
            console.error('错误的使用标准detail，请检查参数', type, targetType);
            return;
        }

        if (undoFunction && redoFunction) {
            detail.registerFunctions(undoFunction, redoFunction);
        }

        this.emit(detail.eventName, detail, true);
    }

    /**
     * 分发标准message
     *
     * @param {string} type
     * @param {string} targetType
     * @param {string} status
     */
    standardEmitMessage(type, targetType, status) {
        const message = new StandardMessage(type, targetType, status);
        if (!message.checkValid()) {
            console.error('错误的使用标准message，请检查参数', type, targetType, status);
            return;
        }
        this.emit(message.eventName);
    }

    /**
     * 处理标准message的事件
     *
     * @param {string} type
     * @param {string} targetType
     * @param {string} status
     * @param {Function | null} execFunction
     */
    standardOn(type, targetType, status, execFunction = null) {
        const message = new StandardMessage(type, targetType, status);
        if (!message.checkValid()) {
            console.error('错误的使用标准message，请检查参数', type, targetType, status);
        }
        this.on(message.eventName, (e) => {
            if (execFunction) {
                execFunction(e.detail);
            }
        });
    }
}
