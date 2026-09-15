import { BaseNodeModel } from "./baseNodeModel.js";

export class VariableModel extends BaseNodeModel {

    /**
     * @param {{ id?: string; type?: string; x?: number; y?: number; config?: object; properties?: any[] }} config
     */
    constructor(config = {}) {
        // BaseNodeModel 构造签名：(id, type, x, y, config, properties)
        super(config.id ?? 'variable', config.type ?? 'variable', config.x ?? 0, config.y ?? 0, config.config ?? {}, config.properties ?? []);
    }

}
