import { BaseProp } from '../propModels/baseProp.js';
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
     * @param {string | number} id - 节点的唯一标识符
     * @param {string} type - 节点的类型
     * @param {number} x - 节点在画布上的x坐标
     * @param {number} y - 节点在画布上的y坐标
     * @param {NodeConfig} config - 节点的配置信息
     * @param {BaseProp[]} properties - 节点的属性列表
    */
    constructor(uid, id, type, x, y, config, properties = []) {
        super(id, type, x, y, config, properties); // 调用父类的构造函数，传入配置参数
        this.uid = uid; // 设置节点的唯一标识符

        config.inputs.forEach((input) => {
            input.direction = 'input';
        })

        config.outputs.forEach((output) => {
            output.direction = 'output';
        })

        this.inputs = PropGenerator.createProp(`${this.id}:inputHub`, 'hub',
            {
                label: '输入端口',
                properties: config.inputs
            }
        );

        this.outputs = PropGenerator.createProp(`${this.id}:outputHub`, 'hub',
            {
                label: '输出端口',
                properties: config.outputs
            }
        );

        this._createPortHub();

        // this.currentMode = this._getInitialMode(); // 初始化节点的当前模式
    }

    _createPortHub() {

        const hub = new HubProp(`${this.id}:portHub`, '端口', [this.inputs, this.outputs], 'double');

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

}



