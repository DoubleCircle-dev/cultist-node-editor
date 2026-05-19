import { BaseProp } from '../propModels/baseProp.js';
import { HubProp } from '../propModels/hubProp.js';
import { PortProp } from '../propModels/portProp.js';
import { NumericProp } from '../propModels/numericProp.js';
import { BaseNodeModel } from './baseNodeModel.js';
import { OptionsProp } from '../propModels/optionsProp.js';

/** NodeModel.js 职责：存储节点数据、业务逻辑验证、序列化 */
export class NodeModel extends BaseNodeModel {
    /**
     * 构造函数，用于创建节点实例
     *
     * @param {number} uid - 节点的避免重复的标识符
     * @param {string | number} id - 节点的唯一标识符
     * @param {string} type - 节点的类型
     * @param {number} x - 节点在画布上的x坐标
     * @param {number} y - 节点在画布上的y坐标
     * @param {NodeConfig} config - 节点的配置信息
     * @param {BaseProp[]} properties - 节点的属性列表
     * @param {Record<string, HubProp>} exProperties - 节点的扩展属性列表
     */
    constructor(uid, id, type, x, y, config, properties = [], exProperties = {}) {
        super(id, type, x, y, config); // 调用父类的构造函数，传入配置参数
        this.uid = uid; // 设置节点的唯一标识符

        this.inputs = null;
        this.outputs = null;
        this.portHub = this._createPortHub();

        super.properties = properties;

        this.exProperties = exProperties;

        this.extendButton = new BaseProp(`${this.id}:extendButton`, '添加属性', 'button', '');
        this.extendProperties = new HubProp(`${this.id}:extendProperties`, '扩展属性', [this.extendButton], 'single');

        /** @type {OptionsProp | null} */
        this.modeSwitcher = null;

        if (this.properties.length !== 0) {
            this.initialize();
        }
        // this.currentMode = this._getInitialMode(); // 初始化节点的当前模式
    }

    /**
     * 获取节点的属性列表
     *
     * @returns {BaseProp[]}
     */
    get properties() {
        const result = [this.portHub, ...super.properties];
        const ex = this.exProperties;

        if (ex[this.currentMode]) {
            result.push(ex[this.currentMode]);
        }

        if (999 in ex) {
            result.push(this.extendProperties);
        }

        return result;
    }

    initialize() {
        this._createPortHub();
    }

    /** @private */
    _createPortHub() {
        const ports = [];
        if (this.inputs instanceof HubProp) {
            ports.push(this.inputs);
        }
        if (this.outputs instanceof HubProp) {
            ports.push(this.outputs);
        }
        const hub = new HubProp(`${this.id}:portHub`, '端口', ports, 'double');

        return hub;
    }

    /**
     * @param {string} propId 
     */
    appendExtendProp(propId) {
        const prop = this.exProperties[999].findPropToPop(propId);
        if (prop) {
            this.extendProperties.addProp(prop);
        }
    }

    /** @param {{ inputs: HubProp; outputs: HubProp }} ports */
    setPorts(ports) {
        if (!ports) return;

        this.inputs = ports.inputs;
        this.outputs = ports.outputs;
        this.portHub = this._createPortHub();
    }

    /** @param {Record<string, HubProp>} exProperties */
    setExProps(exProperties) {
        this.exProperties = exProperties;
    }

    // 模式切换逻辑（带连接检查）
    /** @param {any} newMode */
    switchMode(newMode) {
        if (!this.modeSwitcher) {
            console.error('没有找到模式切换器');
            return;
        }

        if (this.currentMode === newMode) return;

        const hasConnected = this.exProperties[this.currentMode].properties.some(
            (/** @type {BaseProp} */ prop) => prop instanceof PortProp && prop.isConnected
        );


        if (hasConnected) {
            // alert('存在连接，无法切换模式');
            console.warn('存在连接，无法切换模式');
            this.modeSwitcher.updateValue(this.currentMode);
            this.emit('change:property:failed', {propId: this.modeSwitcher.id, value: this.currentMode});
            return false;
        }

        const oldID = `${this.id}:exHub-${this.currentMode}`;

        if (this.exProperties ? this.exProperties[newMode] : false) {
            this.properties.forEach((prop) => {
                if (prop.id === oldID) {
                    this.properties.splice(this.properties.indexOf(prop), 1, this.exProperties[newMode]);
                }
            });
        } else {
            console.error('没有找到对应的模式', newMode);
            return;
        }

        this.currentMode = newMode;
        this.emit('change:mode', newMode);
        return true;
    }

    toJSON() {
        const base = super.toJSON();
        return {
            ...base,
            uid: this.uid,
            currentMode: this.currentMode,
        };
    }

    toModJSON() {
        console.log(this.properties.map((prop) => prop.toModJSON()));
        return {
            id: this.title + '#' + this.id,
            label: this.label,
        };
    }
}
