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
import { Profiler } from 'weigh-js';

export class NodeGenerator {
    /**
     * @param {NodeID} id
     * @param {number} uid
     * @param {string} type
     * @param {number} x
     * @param {number} y
     * @returns {BaseNodeModel}
     */
    static createNode(id, uid, type, x, y) {
        const nodeTypeConfig = NodeTypeRegistry.getType(type);

        const nodeModel = new NodeModel(uid, id, type, x, y, nodeTypeConfig);

        const nodeRef = new WeakRef(nodeModel);

        nodeModel.appendProps(this.createProps(id, nodeTypeConfig.properties, nodeRef));

        nodeModel.setExProps(this.createRecordProps(id, nodeTypeConfig.exProperties, nodeRef));

        nodeModel.setPorts(this.createPortProps(id, nodeTypeConfig.inputs, nodeTypeConfig.outputs, nodeRef));

        nodeModel.initialize();

        return nodeModel;
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
            inputPorts.forEach((/** @type {{ label: string; default: any; name: any; requireType: any }} */ port, /** @type {any} */ index) => {
                const portProp = new PortProp(`${nodeID}:input-${index}`, port.label, 'port', port.default, {
                    name: port.name,
                    layout: 'no-right',
                    inputPort: {
                        id: `${nodeID}:input_port-${index}`,
                        dataType: port.requireType,
                    },
                });
                portProp.parentNode = node;
                inputHub.addProp(portProp);
            });
        }

        const outputHub = new HubProp(`${nodeID}:outputHub`, '输出端口', [], 'single');
        if (outputPorts) {
            outputPorts.forEach((/** @type {{ label: string; default: any; name: any; returnType: any }} */ port, /** @type {any} */ index) => {
                const portProp = new PortProp(`${nodeID}:output-${index}`, port.label, 'port', port.default, {
                    name: port.name,
                    layout: 'no-left',
                    outputPort: {
                        id: `${nodeID}:output_port-${index}`,
                        dataType: port.returnType,
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
     * @param {Record<string, PropConfig[]> | undefined} properties
     * @param {WeakRef<BaseNodeModel>} node
     * @returns {Record<string, HubProp>}
     */
    static createRecordProps(nodeID, properties, node) {
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
