import { BaseProp } from "./baseProp.js";

export class HubProp extends BaseProp {
    constructor(id, label, properties, layout = 'single') {
        super(id, label, 'hub', null);
        this.layout = layout; // single, double, mix
        this.properties = properties;
    }

    destroy(){
        if (this.properties){
            this.properties.forEach((p) => {
                p.destroy();
            })
        }

        super.destroy();
    }
}
