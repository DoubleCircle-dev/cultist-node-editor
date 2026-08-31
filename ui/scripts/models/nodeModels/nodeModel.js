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
     * @param {Record<string, HubProp>} modeProperties - 节点的可变属性列表
     * @param {{ active: HubProp | null; pool: HubProp | null }} extendedProperties - 节点的扩展属性列表
     */
    constructor(uid, id, type, x, y, config, properties = [], modeProperties = {}, extendedProperties = { active: null, pool: null }) {
        super(id, type, x, y, config); // 调用父类的构造函数，传入配置参数
        this.uid = uid; // 设置节点的唯一标识符

        this.inputs = null;
        this.outputs = null;
        this.portHub = this._createPortHub();

        super.properties = properties;

        this.modeProperties = modeProperties;

        this.extendedProperties = extendedProperties;

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
        const ex = this.modeProperties;

        if (ex[this.currentMode]) {
            result.push(ex[this.currentMode]);
        }

        if (this.extendedProperties.active) {
            result.push(this.extendedProperties.active);
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

    /** @param {string} propId */
    appendExtendProp(propId) {

        if (!this.extendedProperties.active) return false;

        if (!this.extendedProperties.pool) return false;

        const prop = this.extendedProperties.pool.extractProp(propId);
        if (prop) {
            this.extendedProperties.active.addProp(prop);
            return true;
        }
    }

    /** @param {string} propId */
    removeExtendProp(propId) {
        if (!this.extendedProperties.active) return false

        if (!this.extendedProperties.pool) return false;

        const prop = this.extendedProperties.active.extractProp(propId);
        if (prop) {
            this.extendedProperties.pool.addProp(prop);
            return true;
        }
    }

    /** @param {{ inputs: HubProp; outputs: HubProp }} ports */
    setPorts(ports) {
        if (!ports) return;

        this.inputs = ports.inputs;
        this.outputs = ports.outputs;
        this.portHub = this._createPortHub();
    }

    /** @param {Record<string, HubProp>} modeProperties */
    setModeProps(modeProperties) {
        this.modeProperties = modeProperties;
    }

    // 模式切换逻辑（带连接检查）
    /** @param {any} newMode */
    switchMode(newMode) {
        if (this.currentMode === newMode) return;

        if (this.modeProperties[this.currentMode].isConnected) {
            // alert('存在连接，无法切换模式');
            console.warn('存在连接，无法切换模式');
            return false;
        }

        if (this.modeProperties && this.modeProperties[newMode]) {
            this.currentMode = newMode;
            return true;
        } else {
            console.error('没有找到对应的模式', newMode);
            return false;
        }
    }

    get hasConnected() {
        return this.properties.some((prop) => prop.isConnected);
    }

    /**
     * 设置节点的扩展属性
     *
     * @param {HubProp} active
     * @param {HubProp} pool
     */
    setExtendProps(active, pool) {
        this.extendedProperties.active = active;
        this.extendedProperties.pool = pool;
    }

    /**
     * 释放节点模型监听器（保留数据，供 undo/redo 复用模型）。
     * portHub 内部已包含 inputs/outputs 两个 Hub，释放 portHub 即释放端口监听器。
     */
    releaseListeners() {
        this.portHub?.releaseListeners();
        Object.values(this.modeProperties).forEach((hub) => hub?.releaseListeners());
        this.extendedProperties?.active?.releaseListeners();
        this.extendedProperties?.pool?.releaseListeners();
        super.releaseListeners();
    }

    /**
     * 永久释放节点模型：端口、普通属性、模式属性、扩展属性 + 自身监听器。
     * 注意：
     * - portHub 内部已包含 inputs/outputs 两个 Hub，释放 portHub 即释放端口，
     *   因此这里先断开 inputs/outputs 引用避免重复释放。
     * - 连接拆除由 ConnectionManager 负责，这里不处理 port.links。
     */
    dispose() {
        this.portHub?.dispose();
        this.inputs = null;
        this.outputs = null;
        this.portHub = null;

        Object.values(this.modeProperties).forEach((hub) => hub?.dispose());
        this.modeProperties = {};

        this.extendedProperties?.active?.dispose();
        this.extendedProperties?.pool?.dispose();
        this.extendedProperties = { active: null, pool: null };

        // 释放普通属性 + 节点自身监听器
        super.dispose();
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
