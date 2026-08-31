import { NodeView } from '../views/nodeView.js';
import { BaseNodeModel } from '../models/nodeModels/baseNodeModel.js';
import { NodeModel } from '../models/nodeModels/nodeModel.js';
import { VariableModel } from '../models/nodeModels/variableModel.js';
import { InlineNodeModel } from '../models/nodeModels/inlineNodeModel.js';
import { NodeTypeRegistry } from '../types/nodeTypes.js';
import { PropGenerator } from './propGenerator.js';
import { BaseProp } from '../models/propModels/baseProp.js';
import { PortProp } from '../models/propModels/portProp.js';
import { HubProp } from '../models/propModels/hubProp.js';
import { OptionsProp } from '../models/propModels/optionsProp.js';

export class NodeGenerator {
    /**
     * @param {NodeID} id
     * @param {number} uid
     * @param {string} type
     * @param {number} x
     * @param {number} y
     * @returns {NodeModel}
     */
    static createNode(id, uid, type, x, y) {
        const nodeTypeConfig = NodeTypeRegistry.getType(type);

        const nodeModel = new NodeModel(uid, id, type, x, y, nodeTypeConfig);

        const nodeRef = new WeakRef(nodeModel);

        nodeModel.setPorts(this.createPortProps(id, nodeTypeConfig.inputs, nodeTypeConfig.outputs, nodeRef));

        nodeModel.appendProps(this.createProps(id, nodeTypeConfig.properties, nodeRef));

        nodeModel.setModeProps(this.createModeProps(id, nodeTypeConfig.modeProperties, nodeRef));

        if (nodeTypeConfig.exProperties) {
            if (nodeTypeConfig.exProperties.length > 0) {
                const { active: activeHub, pool: poolHub } = this.createExtendProps(id, nodeTypeConfig.exProperties, nodeRef);
                nodeModel.setExtendProps(activeHub, poolHub);
            }
        }

        nodeModel.initialize();

         this._bindNodeListeners(nodeModel);

        return nodeModel;
    }

    /**
     * @private
     * @param {NodeModel} nodeModel
     */
    static _bindNodeListeners(nodeModel) {
        if (nodeModel instanceof NodeModel) {
            this._onPropertyChange(nodeModel);
            this._onModeSwitcher(nodeModel);
        }
    }

    /**
     * @private
     * @param {NodeModel} nodeModel
     */
    /**
     * 处理属性更新的静态方法
     *
     * @private
     * @param {NodeModel} nodeModel - 节点模型对象
     */
    static _onPropertyChange(nodeModel) {
        // 监听节点模型的属性外部更改事件
        nodeModel.addEventListener('change:property', (/** @type {Event} */ e) => {
            const ce = /** @type {CustomEvent} */ e;
            // 检查更新属性是否为模式切换器
            if (ce.detail.propId === nodeModel.modeSwitcher?.id) {
                return; // 如果是模式切换器则直接返回，不执行后续操作
            }
            nodeModel.emit('change:property:success', ce.detail);
        });
    }

    /**
     * @private
     * @param {NodeModel} nodeModel
     */
    static _onModeSwitcher(nodeModel) {
        for (let prop of nodeModel.properties) {
            if (prop instanceof OptionsProp && prop.isModeSwitcher) {
                nodeModel.currentMode = prop.value;

                prop.addEventListener('change:property', (e) => {
                    const ce = /** @type {CustomEvent} */ e;
                    if (nodeModel.switchMode(ce.detail.value)) {
                        nodeModel.emit('change:property:success', ce.detail);
                        nodeModel.emit('update:mode', { mode: nodeModel.currentMode });
                    } else {
                        nodeModel.emit('change:property:failed', { propId: prop.id, value: ce.detail.value });
                    }
                });

                prop.addEventListener('update', (/** @type {Event} */ e) => {
                    const ce = /** @type {CustomEvent} */ e;
                    if (nodeModel.switchMode(ce.detail.value)) {
                        nodeModel.emit('update:property:success', ce.detail);
                        nodeModel.emit('update:mode', { mode: nodeModel.currentMode });
                    } else {
                        nodeModel.emit('update:property:failed', { propId: prop.id, value: ce.detail.value });
                    }
                });

                break;
            }
        }
    }

    /**
     * @param {NodeID} nodeID
     * @param {PropConfig[] | undefined} properties
     * @param {WeakRef<BaseNodeModel>} node
     * @returns {BaseProp[]}
     */
    static createProps(nodeID, properties, node) {
        /** @type {BaseProp[]} */
        const result = [];

        if (!properties) {
            return result;
        }

        properties.forEach((prop, index) => {
            const id = `${nodeID}_${prop.type}-${index}`;
            const propInstance = PropGenerator.createProp(id, prop.type, prop, node);
            result.push(propInstance);
        });

        return result;
    }

    /**
     * @param {NodeID} nodeID
     * @param {any[] | undefined} inputPorts
     * @param {any[] | undefined} outputPorts
     * @param {WeakRef<BaseNodeModel> | WeakRef<NodeModel> | null} node
     */
    static createPortProps(nodeID, inputPorts, outputPorts, node) {
        const inputHub = new HubProp(`${nodeID}:inputHub`, '输入端口', [], 'single');
        if (inputPorts) {
            inputPorts.forEach((/** @type {{ label: string; default: any; name: any; requireType: any; multiConnect: boolean; connectNum: number }} */ port, /** @type {any} */ index) => {
                const maxLinks = port.multiConnect ? port.connectNum || Infinity : 1;
                const portProp = new PortProp(`${nodeID}:input-${index}`, port.label, 'port', port.default, {
                    name: port.name,
                    layout: 'no-right',
                    inputPort: {
                        id: `${nodeID}:input_port-${index}`,
                        dataType: port.requireType,
                        maxLinks: maxLinks,
                    },
                });
                portProp.parentNode = node;
                inputHub.addProp(portProp);
            });
        }

        const outputHub = new HubProp(`${nodeID}:outputHub`, '输出端口', [], 'single');
        if (outputPorts) {
            outputPorts.forEach((/** @type {{ label: string; default: any; name: any; returnType: any; multiConnect: boolean; connectNum: number }} */ port, /** @type {any} */ index) => {
                const maxLinks = port.multiConnect ? port.connectNum || Infinity : 1;
                const portProp = new PortProp(`${nodeID}:output-${index}`, port.label, 'port', port.default, {
                    name: port.name,
                    layout: 'no-left',
                    outputPort: {
                        id: `${nodeID}:output_port-${index}`,
                        dataType: port.returnType,
                        maxLinks: maxLinks,
                    },
                });
                portProp.parentNode = node;
                outputHub.addProp(portProp);
            });
        }

        return { inputs: inputHub, outputs: outputHub };
    }

    /**
     * @param {NodeID} nodeID
     * @param {PropConfig[] | undefined} properties
     * @param {WeakRef<NodeModel>} node
     */
    static createExtendProps(nodeID, properties, node) {
        const extendButton = new BaseProp(`${nodeID}:extendButton`, '修改可选属性', 'button', '');

        this._onExtendButtonClick(extendButton, node);

        const activeHub = new HubProp(`${nodeID}:activeHub`, '当前属性', [extendButton], 'single');

        const pool = NodeGenerator.createProps(nodeID, properties, node);

        const poolHub = new HubProp(`${nodeID}:poolHub`, '属性池', pool, 'single');

        return {
            active: activeHub,
            pool: poolHub,
        };
    }

    /**
     * @private
     * @param {BaseProp} prop
     * @param {WeakRef<NodeModel>} node
     */
    static _onExtendButtonClick(prop, node) {
        prop.addEventListener('mousedown', (e) => {
            const ce = /** @type {CustomEvent} */ (e);
            const oe = ce.detail.originalEvent;
            // 使用弱引用获取真实的 nodeModel
            const nodeModel = node.deref();
            if (nodeModel && nodeModel.extendedProperties?.pool) {
                // 将 Prop 级别的物理事件，翻译为 Node 级别的意图事件向外抛出
                nodeModel.emit('append:property', {
                    props: nodeModel.extendedProperties.pool.properties,
                    position: { x: oe.clientX, y: oe.clientY },
                });
            }
        });
    }

    /**
     * @param {NodeID} nodeID
     * @param {Record<string, PropConfig[]> | undefined} properties
     * @param {WeakRef<BaseNodeModel>} node
     * @returns {Record<string, HubProp>}
     */
    static createModeProps(nodeID, properties, node) {
        /** @type {Record<string, HubProp>} */
        const exProps = {};

        for (let key in properties) {
            const hub = PropGenerator.createProp(
                `${nodeID}:exHub-${key}`,
                'hub',
                { type: 'hub', label: key, properties: properties[key], layout: 'single' },
                node
            );
            if (hub instanceof HubProp) {
                exProps[key] = hub;
            }
        }

        return exProps;
    }
}
