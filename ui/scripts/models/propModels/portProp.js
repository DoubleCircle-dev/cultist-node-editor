import { BaseProp } from './baseProp.js';
import { PortModel } from '../portModel.js';

export class PortProp extends BaseProp {
    static layoutTypes = {
        normal: 'normal',
        noLeft: 'no-left',
        noRight: 'no-right',
        ignorePort: 'ignore-port',
    };

    /**
     * @param {string} id - 用来识别属性
     * @param {string} label - 属性的显示名称
     * @param {string} type - 属性的类型
     * @param {any} value - 属性的值
     * @param {any} config - 端口配置
     */
    constructor(id, label, type, value, config = {}) {
        const defaultConfig = {
            placeholder: '',
            name: 'undefined',
            layout: 'normal',
            inputPort: null,
            outputPort: null,
        };

        const portConfig = { ...defaultConfig, ...config };

        if (!Object.values(PortProp.layoutTypes).includes(portConfig.layout)) {
            portConfig.layout = PortProp.layoutTypes.normal;
            console.warn(`layout ${portConfig.layout} 不在PortProp定义中`);
        }

        super(id, label, type, value, null, portConfig);

        /** @type {PortModel | null} */
        this.inputPort = null;

        if (portConfig.inputPort && portConfig.inputPort.id) {
            this.inputPort = new PortModel(portConfig.inputPort.id, 'input', portConfig.inputPort);
            if (this.inputPort) {
                this.inputPort.parentProp = this;
            }else {
                console.error(`端口 ${portConfig.inputPort.id} 创建失败`, portConfig.inputPort);
            }
        }

        /** @type {PortModel | null} */
        this.outputPort = null;
        if (portConfig.outputPort && portConfig.outputPort.id) {
            this.outputPort = new PortModel(portConfig.outputPort.id, 'output', portConfig.outputPort);
            if (this.outputPort) {
                this.outputPort.parentProp = this;
            }
        }

    }

    onPortEvent(eventName, detail) {
        this.onEvent(eventName, detail);
    }

    get isConnected() {
        return (this.inputPort && this.inputPort.isConnected) || (this.outputPort && this.outputPort.isConnected);
    }

    toJSON() {
        const result = super.toJSON();

        return result;
    }
}
