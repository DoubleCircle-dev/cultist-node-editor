import { BaseNodeModel } from "./baseNodeModel";

export class InlineNodeModel extends BaseNodeModel {
   
    constructor() {
        const config = {
            id: "inlineNode",
            type: "inlineNode",
            x: 0,
            y: 0,
            properties: {}
        }
        super(config);

        // 包含的子节点
        this.subNodes = new Map ();

        // 节点层级,根节点为0
        this.level = 0;
    }
}
