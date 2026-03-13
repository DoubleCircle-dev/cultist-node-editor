import { NodeView } from "../views/nodeView.js";
import { BaseNodeModel } from "../models/nodeModels/baseNodeModel.js";
import { NodeModel } from "../models/nodeModels/nodeModel.js";
import { VariableModel } from "../models/nodeModels/variableModel.js";
import { InlineNodeModel } from "../models/nodeModels/inlineNodeModel.js";
import { NodeTypeRegistry } from "../types/nodeTypes.js";
import { PropGenerator } from "./propGenerator.js";
import { BaseProp } from "../models/propModels/baseProp.js";

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

        const nodeModel = new NodeModel(uid, id, type, x, y, nodeTypeConfig, this.createProps(id, nodeTypeConfig.properties));

        const nodeView = new NodeView(nodeModel);

        return { nodeView, nodeModel };
    }

    /**
     * @param {NodeID} nodeID
     * @param {PropConfig[]} properties
     * @returns {BaseProp[]}
    */
    static createProps(nodeID, properties) {
        const result = [];

        properties.forEach((prop,index) => {
            const id = `${nodeID}_${prop.type}-${index}`
            result.push(PropGenerator.createProp(id, prop.type, prop));
        })

        return result;
    }


}
