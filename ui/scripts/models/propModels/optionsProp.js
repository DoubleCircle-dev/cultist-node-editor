import { BaseProp } from "./baseProp.js";

export class OptionsProp extends BaseProp {
    /**
     * @param {string} id
     * @param {string} label
     * @param {string} type
     * @param {any} value
     */
    constructor(id, label, type, value, options = []) {
        super(id, label, type, value);
        this.config.opts = options;
    }
}

