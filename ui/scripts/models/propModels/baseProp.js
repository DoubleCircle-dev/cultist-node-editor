import { IEventTarget } from '../../types/IEventTarget.js';

/** @typedef {import('../nodeModels/baseNodeModel.js').BaseNodeModel} BaseNodeModel */

export class BaseProp extends IEventTarget {
    /**
     * @param {string} id - 用来识别属性
     * @param {string} label - 属性的显示名称
     * @param {string} type - 属性的类型
     * @param {any} value - 属性的值
     */
    constructor(id, label, type, value, description = null, config = { placeholder: '', name: 'undefined', layout: 'normal' }) {
        super();
        this.id = id;
        this.label = label;
        this.type = type;
        /** @private */
        this._value = value;

        this.layout = config.layout;
        this.config = {};

        this.name = config.name || label;
        this.placeholder = config.placeholder || '';
        this.description = description;

        /**
         * @private
         * @type {WeakRef<BaseNodeModel> | null} parentNode
         */
        this._parentNode = null;
    }

    /** @returns {any} */
    get value() {
        return this._value;
    }

    set value(newVal) {
        const oldVal = this._value;
        if (oldVal !== newVal) {
            this._value = newVal;
        }
    }

    get parentNode() {
        return this._parentNode;
    }

    set parentNode(newVal) {
        this._parentNode = newVal;
    }

    get isConnected() {
        return false
    }

    /** @param {any} newVal */
    changeValue(newVal) {
        const oldVal = this._value;
        this.value = newVal;
        this.onEvent('change:property', { value: this._value, oldValue: oldVal, newValue: newVal, propId: this.id });
    }

    /** @param {any} newVal */
    updateValue(newVal) {
        const oldVal = this._value;
        this._value = newVal;
        this.emit('update', { value: this._value, newValue: newVal, oldValue: oldVal, propId: this.id });
    }

    /**
     * 向父对象传递事件
     * 
     * @param {string} event - 事件名称
     * @param {any} detail - 事件详情
     */
    onEvent(event, detail) {

        this.emit(event, detail);

        if (!this.parentNode) {
            console.error('无法传递给父对象node，因为父对象不存在');
            return;
        }

        if (!this.parentNode.deref()) {
            console.error('无法传递给父对象node，因为父对象已经被释放');
            return;
        }

        this.parentNode.deref()?.emit(event, detail);
    }

    /**
     * 释放全部监听器（保留数据）。
     * 节点删除且可被 undo 恢复时调用 —— 模型对象会被 `_createNode` 复用，
     * 因此只清监听器、不清数据。
     */
    releaseListeners() {
        this.removeAllEventListeners();
    }

    /**
     * 释放属性资源：清空自身全部监听器、切断父节点弱引用。
     * 由节点销毁流程调用（见 NodeModel.dispose），数据不再被复用。
     */
    dispose() {
        this.releaseListeners();
        this._parentNode = null;
    }

    toJSON() {
        return {
            id: this.id,
            value: this._value,
            config: this.config,
        };
    }

    toModJSON() {
        const obj = {};
        obj[this.type] = this._value;
        return obj;
    }
}
