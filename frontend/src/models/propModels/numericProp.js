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
        // 仅当配置了 min/max 时做边界钳制（未配置则直接取值，避免 NaN）
        let value = v;
        if (this.config.min != null) value = Math.max(this.config.min, value);
        if (this.config.max != null) value = Math.min(this.config.max, value);
        super.setValue(value);
    }

    updateValue(v) {
        let value = v;
        if (this.config.min != null) value = Math.max(this.config.min, value);
        if (this.config.max != null) value = Math.min(this.config.max, value);
        super.updateValue(value);
    }
}
