import { PortProp } from "./portProp.js";
export class NumericProp extends PortProp {
    /**
     * @param {string} id
     * @param {string} label
     * @param {string} type
     * @param {any} value
     * @param {any} min
     * @param {any} max
     */
    constructor(id, label, type, value, min, max) {
        const inputPortConfig  = {
            id: `${id}-input`,
            direction: 'input',
            dataType: 'number'
        }
        super(id, label, type, value, { inputPort: inputPortConfig});
        this.config.min = min;
        this.config.max = max;

    }
    /**
     * 设置值的方法，确保值在最小值和最大值之间
     * @param {number} v - 要设置的值
     */
    setValue(v) {
        // 如果v小于this.min，则取this.min；如果v大于this.max，则取this.max；否则取v本身
        const value = Math.max(this.config.min, Math.min(this.config.max, v));
        super.setValue(value);
    }

    updateValue(v) {
        const value = Math.max(this.config.min, Math.min(this.config.max, v));
        super.updateValue(value);        
    }
}
