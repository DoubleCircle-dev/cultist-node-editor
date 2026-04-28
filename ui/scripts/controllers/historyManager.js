import { EventBus } from '../types/eventBus.js';
import { StandardDetail, StandardMessage } from '../types/standardDetail.js';
import { ControllerCore } from './controllerCore.js';
import { IManager } from './manager.js';

export class HistoryManager extends IManager {
    /**
     * 创建历史管理器实例
     *
     * @param {EventBus} bus - 事件总线，用于管理器间的通信
     * @param {HTMLElement} viewport - 视口元素，用于容纳节点
     * @param {HTMLElement} world - 画布元素，用于渲染节点
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus, viewport, world, coreSpace);

        /**
         * 历史记录
         *
         * @private
         * @type {HistoryItem[]}
         */
        this._history = [];

        /**
         * 撤销历史的记录
         *
         * @private
         * @type {HistoryItem[]}
         */
        this._undoHistory = [];

        this._onEvent();

        this._initListeners();
    }

    /** @private */
    _onEvent() {
        this.bus.on('log', (evt) => {
            const ce = /** @type {CustomEvent} */ (evt);
            this.registerHistory(ce.detail.eventName, ce.detail.data);
        });
    }

    /** @private */
    _initListeners() {
        this.viewport.addEventListener('keydown', (e)=>{

        })
    }

    /**
     * 注册历史记录
     *
     * @param {string} eventName
     * @param {Object} data
     */
    registerHistory(eventName, data) {
        if (this._filterEvent(eventName)) return;
        const historyItem = new HistoryItem(eventName, data, this.bus);
        this._history.push(historyItem);
        this._undoHistory = [];
        while (this._history.length > this.coreSpace.setting.historyMaxLength) {
            this._history.shift();
        }

        console.log(this._history, eventName);

        //定时5s执行
        setTimeout(() => {
            this.undo();
        }, 5000);

        setTimeout(() => {
            this.redo();
        }, 10000);
    }

    /**
     * @private
     * @param {string} eventName
     */
    _filterEvent(eventName) {
        const message = StandardMessage.resolveEventName(eventName);

        return !message.checkValid();
    }

    undo() {
        const history = this._history.pop();
        if (!history) return;
        this._undoHistory.push(history);

        while (this._undoHistory.length > this.coreSpace.setting.undoHistoryMaxLength) {
            this._undoHistory.shift();
        }

        history.undo();
    }

    redo() {
        const history = this._undoHistory.pop();
        if (!history) return;
        this._history.push(history);

        while (this._history.length > this.coreSpace.setting.historyMaxLength) {
            this._history.shift();
        }

        history.redo();
    }
}

class HistoryItem {
    /**
     * 历史记录项
     *
     * @param {string} type - 事件类型
     * @param {Object} detail - 事件数据
     * @param {EventBus} bus - 事件总线
     */
    constructor(type, detail, bus) {
        this.type = type;
        this.detail = detail;

        this.bus = bus;
    }

    undo() {
        if (this.detail instanceof StandardDetail && this.detail.undoFunction) {
            this.detail.undoFunction(this.detail.data);
        } else {
            this.bus.emit(`undo:${this.type}`, this.detail);
        }
    }

    redo() {
        if (this.detail instanceof StandardDetail && this.detail.redoFunction) {
            this.detail.redoFunction(this.detail.data);
        } else {
            this.bus.emit(`redo:${this.type}`, this.detail);
        }
    }
}
