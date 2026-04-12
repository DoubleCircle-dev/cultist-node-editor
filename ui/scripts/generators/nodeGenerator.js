import { NodeView } from "../views/nodeView.js";
import { BaseNodeModel } from "../models/nodeModels/baseNodeModel.js";
import { NodeModel } from "../models/nodeModels/nodeModel.js";
import { VariableModel } from "../models/nodeModels/variableModel.js";
import { InlineNodeModel } from "../models/nodeModels/inlineNodeModel.js";
import { NodeTypeRegistry } from "../types/nodeTypes.js";
import { PropGenerator } from "./propGenerator.js";
import { BaseProp } from "../models/propModels/baseProp.js";
import { PortProp } from "../models/propModels/portProp.js";
import { HubProp } from "../models/propModels/hubProp.js";

export class NodeGenerator {

    /**
     * @param {NodeID} id
     * @param {number} uid
     * @param {string} type
     * @param {number} x
     * @param {number} y
     * @returns {{nodeView: NodeView, nodeModel: BaseNodeModel}}
    */
    static createNode(id, uid, type, x, y) {
        const nodeTypeConfig = NodeTypeRegistry.getType(type);

        const nodeModel = new NodeModel(uid, id, type, x, y, nodeTypeConfig);


        nodeModel.setProperties(this.createProps(id, nodeTypeConfig.properties, nodeModel));

        nodeModel.setExProps(this.createRecordProps(id, nodeTypeConfig.exProperties, nodeModel));

        nodeModel.initialize();

        const nodeView = new NodeView(nodeModel);

        return { nodeView, nodeModel };
    }

    /**
     * @param {NodeID} nodeID
     * @param {PropConfig[]} properties
     * @returns {BaseProp[]}
    */
    static createProps(nodeID, properties, node = null) {
        const result = [];

        properties.forEach((prop, index) => {
            const id = `${nodeID}_${prop.type}-${index}`;
            const propInstance = PropGenerator.createProp(id, prop.type, prop, node);
            result.push(propInstance);
        })

        return result;
    }

    /**
     * @param {NodeID} nodeID
     * @param {Record<string, PropConfig[]>} properties
     * @returns {Record<string, HubProp>}
     */
    static createRecordProps(nodeID, properties, node = null) {
        /**
         * @type {Record<string, HubProp>}
         */
        const exProps = {};
        for (let key in properties) {
            const hub = PropGenerator.createProp(`${nodeID}:exHub-${key}`, 'hub',
                { type: 'hub', label: key, properties: properties[key], layout: 'single' }, node);
            if (hub instanceof HubProp) {
                exProps[key] = hub;
            }
        }
        return exProps;
    }
}
