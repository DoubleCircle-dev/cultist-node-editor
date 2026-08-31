import { BaseNodeModel } from "./baseNodeModel.js";

export class InlineNodeModel extends BaseNodeModel {

    constructor() {
        // BaseNodeModel 构造签名：(id, type, x, y, config, properties)
        super('inlineNode', 'inlineNode', 0, 0, /** @type {NodeConfig} */ ({}));

        // 包含的子节点
        this.subNodes = new Map();

        // 节点层级,根节点为0
        this.level = 0;
    }
}
