import { BaseProp } from "./baseProp.js";

export class HubProp extends BaseProp{
    constructor(id, label,properties) {
        super(id, label, 'hub', null);
        this.properties = properties;
    }
}
