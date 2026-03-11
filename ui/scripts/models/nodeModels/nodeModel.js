import { HubProp } from '../propModels/hubProp.js';
import { PropGenerator } from '../../generators/propGenerator.js';
import { BaseNodeModel } from './baseNodeModel.js';

/**
 * NodeModel.js
 * 职责：存储节点数据、业务逻辑验证、序列化
 */
export class NodeModel extends BaseNodeModel {
    /**
     * 构造函数，用于创建节点实例
     * @param {number} uid - 节点的避免重复的标识符
     * @param {object} config - 节点的配置对象
     */
    constructor(uid, config) {
        super(config); // 调用父类的构造函数，传入配置参数

        this.inputs = config.config.inputs;
        this.inputs.forEach(input => {
            input.direction = 'input';
        })
        this.outputs = config.config.outputs;
        this.outputs.forEach(output => {
            output.direction = 'output';
        })

        this.uid = uid; // 设置节点的唯一标识符

        this._createPortHub();

        // this.currentMode = this._getInitialMode(); // 初始化节点的当前模式
    }

    _createPortHub() {
        const inputHub = PropGenerator.createProp(`${this.id}:inputHub`, 'hub',
            {
                label: '输入端口',
                properties: this.inputs
            }
        );

        const outputHub = PropGenerator.createProp(`${this.id}:outputHub`, 'hub',
            {
                label: '输出端口',
                properties: this.outputs
            }
        )
        const hub = new HubProp(`${this.id}:portHub`,'端口', [inputHub, outputHub], 'double');

        this.properties.push(hub);
    }

    _getInitialMode() {
        // 根据 fixedProperties 中的模式切换器确定
    }

    // 模式切换逻辑（带连接检查）
    /**
     * @param {any} newMode
     */
    switchMode(newMode) {
        if (this.connections.inputs.length > 0 || this.connections.outputs.length > 0) {
            throw new Error('节点有连接，无法切换模式');
        }
        this.currentMode = newMode;
        this.emit('modeChange', newMode);
    }

    toJSON() {
        const base = super.toJSON();
        return {
            ...base,
            uid: this.uid,
            currentMode: this.currentMode
        };
    }

    /**
     * 从JSON对象中解析数据并设置到当前对象
     * @param {Object} json - 包含对象数据的JSON对象
     */
    static fromJSON(json) {
        const model = new NodeModel(json.uid,
            {
                id: json.id,
                type: json.type,
                x: json.position.x,
                y: json.position.y,
                properties: json.properties
            }
        );

        model.currentMode = json.currentMode;
        model.connections = json.connections;

        return model;
    }
}


