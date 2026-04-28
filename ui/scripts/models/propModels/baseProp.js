import { IEventTarget } from '../../types/IEventTarget.js';
import { BaseNodeModel } from '../nodeModels/baseNodeModel.js';

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

    /** @param {any} newVal */
    setValue(newVal) {
        const oldVal = this._value;
        this.value = newVal;
        this.emit('change', { value: newVal, oldValue: oldVal });
    }

    /** @param {any} newVal */
    updateValue(newVal) {
        const oldVal = this._value;
        this._value = newVal;
        this.onEvent('update:property:finished', { value: this._value, newValue: newVal, oldValue: oldVal, propId: this.id });
    }

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
