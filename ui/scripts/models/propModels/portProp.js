import { BaseProp } from "./baseProp.js";
import { PortModel } from "../portModel.js";


export class PortProp extends BaseProp {
    /**
     * @param {string} id - 用来识别属性 
     * @param {string} label - 属性的显示名称
     * @param {string} type - 属性的类型
     * @param {any} value - 属性的值
     * @param {object} portConfig - 端口配置
     * 
     *  */
    constructor(id, label, type, value, portConfig = {}) {
        super(id, label, type, value);
        this.inputPort = portConfig.inputPort ? new PortModel(portConfig.inputPort.id, 'input', portConfig.inputPort) : null;
        this.outputPort = portConfig.outputPort ? new PortModel(portConfig.outputPort.id, 'input', portConfig.outputPort) : null;
    }

    toJSON() {
        const result = super.toJSON();

        return result;
    }
}
