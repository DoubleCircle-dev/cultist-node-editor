import { PortProp } from "./portProp.js";
export class ViewProp extends PortProp {
    /**
     * @param {string} id
     * @param {string} label
     * @param {string} type
     * @param {any} value
     */
    constructor(id, label, type, value, columns = [], rows = [], inputDataType = null, inputPortPos = 'top-left') {
        const inputPortConfig ={
            id: `${id}-input`,
            portType: 'implicit',
            dataType: inputDataType || type,
            pos: inputPortPos
        }
        super(id, label, type, value, { inputPort: inputPortConfig });
        this.columns = columns;
        this.rows = rows;
    }
}

