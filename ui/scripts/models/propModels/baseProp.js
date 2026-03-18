export class BaseProp extends EventTarget {

    /**
     * @param {string} id - 用来识别属性 
     * @param {string} label - 属性的显示名称
     * @param {string} type - 属性的类型
     * @param {any} value - 属性的值
     *  
     *  */
    constructor(id, label, type, value, description = null) {
        super();
        this.id = id;
        this.label = label;
        this.type = type;
        this._value = value;

        this.config = {};

        this.description = description;

        this.parentNode = null;
    }

    /**
     * @returns {any}
     */
    get value() {
        return this._value;
    }

    set value(newVal) {

        const oldVal = this._value;
        if (oldVal !== newVal) {
            this._value = newVal;
            this.dispatchEvent(new CustomEvent('change', {
                detail: { value: newVal, oldValue: oldVal }
            }));
        }
    }

    /**
     * @param {any} newVal
     */
    setValue(newVal) {
        this.value = newVal;
    }

    toJSON() {
        return {
            id: this.id,
            value: this._value,
            config: this.config
        };
    }
}

