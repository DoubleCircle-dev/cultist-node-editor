import { BaseProp } from './baseProp.js';

export class HubProp extends BaseProp {

    /**
     * @param {string} id
     * @param {string} label
     * @param {BaseProp[]} properties
     * @param {'single' | 'double' | 'mix'} layout
     */
    constructor(id, label, properties, layout = 'single') {
        super(id, label, 'hub', null);
        this.layout = layout; // single, double, mix
        /**
         * @private
         * @type {BaseProp[]}
         */
        this._properties = properties;
    }

    /** @param {BaseProp} prop */
    addProp(prop) {
        this._properties.push(prop);
    }

    get properties() {
        return this._properties;
    }

    popProp() {
        return this._properties.pop();
    }

    findProp(id) {
        return this._properties.find((p) => p.id === id);
    }

    findPropIndex(id) {
        return this._properties.findIndex((p) => p.id === id);
    }

    findPropToPop(id) {
        const index = this.findPropIndex(id);
        return index >= 0 ? this._properties.splice(index, 1)[0] : null;
    }


    /**
     * @returns {BaseProp[]}
     */
    get detailProperties() {
        return this.properties.flatMap((prop) => (prop instanceof HubProp ? prop.detailProperties : prop));
    }

    toModJSON() {
        return {
            ...this.properties.map((p) => p.toModJSON()),
        };
    }
}
