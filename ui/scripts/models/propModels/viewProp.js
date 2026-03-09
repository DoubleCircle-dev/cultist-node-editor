import { PortProp } from "./portProp.js";
import { PortModel } from "../portModel.js";
export class ViewProp extends PortProp {
    /**
     * @param {string} id
     * @param {string} label
     * @param {string} type
     * @param {any} value
     */
    constructor(id, label, type, value) {
        const inputPortConfig ={
            id: `${id}-input`,
            dataType: type,
            pos: 'top-left'
        }
        super(id, label, type, value, { inputPort: inputPortConfig });
    }
}

