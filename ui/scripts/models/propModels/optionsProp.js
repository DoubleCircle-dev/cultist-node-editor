import { BaseProp } from "./baseProp.js";

export class OptionsProp extends BaseProp {
    /**
     * @param {string} id
     * @param {string} label
     * @param {string} type
     * @param {any} value
     */
    constructor(id, label, type, value, options = [], isModeSwitcher=false) {
        super(id, label, type, value);
        this.config = {
            opts:options,
            default: String(value | options[0])
        }
        this.config.opts = options;
        this.isModeSwitcher = isModeSwitcher;
    }

    changeValue(value) {
        super.changeValue(value);

        if (this.isModeSwitcher) {
            this.emit('changeMode:prop', { value: value });
        }
    }
}

