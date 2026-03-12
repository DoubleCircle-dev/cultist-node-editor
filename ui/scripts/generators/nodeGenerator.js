import { NodeView } from "../views/nodeView.js";
import { BaseNodeModel } from "../models/nodeModels/baseNodeModel.js";
import { NodeModel } from "../models/nodeModels/nodeModel.js";
import { VariableModel } from "../models/nodeModels/variableModel.js";
import { InlineNodeModel } from "../models/nodeModels/inlineNodeModel.js";
import { NodeTypeRegistry } from "../types/nodeTypes.js";

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

        const nodeModel = new NodeModel(uid, { id, type, x, y, config:nodeTypeConfig, properties: nodeTypeConfig.properties });

        const nodeView = new NodeView(nodeModel);

        return { nodeView, nodeModel };

    }

    static createModel(id, type, uid, x, y,config={}, properties = []) {
        switch (type) {
            case "Node":
                return new NodeModel(uid, { id, type, x, y,config, properties });
            case "Variable":
                return new VariableModel({ id, uid, type, x, y,config, properties });
            case "InlineNode":
                return new InlineNodeModel();
            default:
                console.error(`Unknown node type: ${type}`);
                return new BaseNodeModel({ id, type, x, y,config, properties});
        }
    }
}
