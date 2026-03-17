import { BaseProp } from '../propModels/baseProp.js';
import { HubProp } from '../propModels/hubProp.js';
import { PortProp } from '../propModels/portProp.js';
import { BaseNodeModel } from './baseNodeModel.js';
import { OptionsProp } from '../propModels/optionsProp.js';

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
     * @param {Record<string, HubProp>} exProperties - 节点的扩展属性列表
    */
    constructor(uid, id, type, x, y, config, properties = [], exProperties = {}) {
        super(id, type, x, y, config, properties); // 调用父类的构造函数，传入配置参数
        this.uid = uid; // 设置节点的唯一标识符


        const inputs = [];
        const outputs = [];

        config.inputs.forEach((input, index) => {
            inputs.push(
                new PortProp(`${this.id}:input-${index}`, input.label, 'port', input.default, {
                    inputPort:{
                        id: `${this.id}:input_port-${index}`,
                        dataType: input.requireType
                    }
                })
            );
        })

        config.outputs.forEach((output, index) => {
            outputs.push(
                new PortProp(`${this.id}:output-${index}`, output.label, 'port', output.default, {
                    outputPort:{
                        id: `${this.id}:output_port-${index}`,
                        dataType: output.returnType
                    }
                })
            )
        })


        this.inputs = new HubProp(`${this.id}:inputHub`, '输入端口', inputs, 'single');

        this.outputs = new HubProp(`${this.id}:outputHub`, '输出端口', outputs, 'single');

        this.exProperties = exProperties;

        this._onModeSwitcher();

        // this.currentMode = this._getInitialMode(); // 初始化节点的当前模式

        this._createPortHub();

    }

    _createPortHub() {
        const hub = new HubProp(`${this.id}:portHub`, '端口', [this.inputs, this.outputs], 'double');

        this.properties.push(hub);
    }

    _onModeSwitcher() {
        for (let prop of this.properties) {
            if (prop instanceof OptionsProp) {
                if (prop.isModeSwitcher) {
                    this.modeSwitcher = prop
                    this.currentMode = prop.value;
                    prop.addEventListener('changeMode:prop', (/**@type {CustomEvent} */e) => {
                        this.switchMode(e.detail.value);
                    });
                    this.properties.push(this.exProperties[prop.value]);
                    break;
                }
            }
        }
    }

    // 模式切换逻辑（带连接检查）
    /**
     * @param {any} newMode
     */
    switchMode(newMode) {
        if (this.connections.inputs.length > 0 || this.connections.outputs.length > 0) {
            throw new Error('节点有连接，无法切换模式');
        }

        const oldID = `${this.id}:exHub-${this.currentMode}`;

        if (this.exProperties[newMode]) {
            this.properties.forEach((prop) => {
                if (prop.id === oldID) {

                    this.properties.splice(this.properties.indexOf(prop), 1,
                        this.exProperties[newMode]
                    );
                }
            });
        } else {
            console.error('没有找到对应的模式', newMode);
            return;
        }



        this.currentMode = newMode;
        this.emit('changeMode:node', newMode);
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



