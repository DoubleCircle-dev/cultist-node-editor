import { BaseProp } from "./baseProp.js";

export class HubProp extends BaseProp {
    constructor(id, label, properties, layout = 'single') {
        super(id, label, 'hub', null);
        this.layout = layout; // single, double, mix
        this.properties = properties;
    }

    addProp(prop) {
        this.properties.push(prop);
    }


    toModJSON() {
        return {
            ...this.properties.map((p) => p.toModJSON()),
        }
    }
}
