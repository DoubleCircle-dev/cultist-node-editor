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
        return [...super.properties, this.exProperties[this.currentMode], this.portHub];
    }

    initialize() {
        this._onModeSwitcher();

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

    /** @private */
    _onModeSwitcher() {
        for (let prop of this.properties) {
            if (prop instanceof OptionsProp) {
                if (prop.isModeSwitcher) {
                    this.modeSwitcher = prop;
                    this.currentMode = prop.value;

                    prop.addEventListener('change', (/** @type {Event} */ e) => {
                        const ce = /** @type {CustomEvent} */ e;
                        this.switchMode(ce.detail.value);
                    })

                    prop.addEventListener('update:property:finished', (/** @type {Event} */ e) => {
                        const ce = /** @type {CustomEvent} */ e;
                        this.switchMode(ce.detail.value);
                    });

                    if (this.exProperties) {
                        this.properties.push(this.exProperties[prop.value]);
                    } else {
                        console.error('未加载额外属性，无法正常切换', this.id, this.type);
                    }

                    break;
                }
            }
        }
    }

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
        const hasConnected = this.exProperties[this.currentMode].properties.some(
            (/** @type {BaseProp} */ prop) => prop instanceof PortProp && prop.isConnected
        );
        if (hasConnected) {
            console.warn('存在连接，无法切换模式');
            this.modeSwitcher.value = this.currentMode;
            return;
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
