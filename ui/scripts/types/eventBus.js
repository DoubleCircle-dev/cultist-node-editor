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
     * @param {EventListenerOrEventListenerObject | null} listener - 回调函数
     */
    on(eventName, listener) {
        this.addEventListener(eventName, listener);
        return listener;
    }

    /**
     * 订阅（监听）事件
     *
     * @param {string} eventName - 事件名称 (例如 "click:node:success")
     * @param {EventListenerOrEventListenerObject | null} listener - 回调函数
     */
    addEventListener(eventName, listener) {
        const nameList = eventName.split(':');
        const [action, target, status] = nameList;
        const message = new StandardMessage(action, target, status);

        let finalListener = listener;

        if (message.checkValid()) {
            console.log(`EventBus: 监听事件 ${eventName} 为标准事件`);
            finalListener = (e) => {
                /** @type {EventListener} */ (listener)(/** @type {CustomEvent} */ (e));
            };
        } else {
            console.log(`EventBus: 监听事件 ${eventName} 为非标准事件`);
        }

        super.addEventListener(eventName, /** @type {EventListener} */ (finalListener));
    }

    /**
     * 取消订阅事件
     * 
     * @param {string} eventName - 事件名称 (例如 "click:node:success")
     * @param {EventListenerOrEventListenerObject | null} listener - 回调函数
     */
    removeEventListener(eventName, listener) {
        console.log(`EventBus: 取消监听事件 ${eventName}`)
        super.removeEventListener(eventName, listener);
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
            console.log(`EventBus: 一次性事件 ${eventName} 触发`)
            this.removeEventListener(eventName, onceListener);
        };
        this.addEventListener(eventName, onceListener);

        // 返回函数
        return onceListener;
    }

    /**
     * 取消订阅事件
     *
     * @param {string} eventName - 事件名称
     * @param {EventListenerOrEventListenerObject | null} listener - 回调函数
     */
    off(eventName, listener) {
        this.removeEventListener(eventName, listener);
    }


    /**
     * 订阅两个互斥事件，当其中一个事件触发时，另一个事件将不再触发
     *
     * @param {string} eventA - 事件A名称
     * @param {string} eventB - 事件B名称
     * @param {EventListenerOrEventListenerObject | null} handlerA - 事件A的回调函数
     * @param {EventListenerOrEventListenerObject | null} handlerB - 事件B的回调函数
     */
    onceExclusive(eventA, eventB, handlerA, handlerB) {
        let cleaned = false;

        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            this.off(eventA, wrapperA);
            this.off(eventB, wrapperB);
        };

        const wrapperA = (/** @type {Event} */ e) => {
            cleanup();
            /** @type {EventListener} */
            (handlerA)(e);
        };

        const wrapperB = (/** @type {Event} */ e) => {
            cleanup();
            /** @type {EventListener} */
            (handlerB)(e);
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
     * @param {any} data
     * @param {Function | null} undoFunction
     * @param {Function | null} redoFunction
     * @param {string} status
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
