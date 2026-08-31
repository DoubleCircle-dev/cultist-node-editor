import { BaseProp } from './baseProp.js';
import { PortProp } from './portProp.js';

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

    extractProp(id) {
        const index = this.findPropIndex(id);
        return index >= 0 ? this._properties.splice(index, 1)[0] : null;
    }

    get isConnected() {
        return this.properties.some((/** @type {BaseProp} */ prop) => prop instanceof PortProp && prop.isConnected);
    }

    /** @returns {BaseProp[]} */
    get detailProperties() {
        return this.properties.flatMap((prop) => (prop instanceof HubProp ? prop.detailProperties : prop));
    }

    /**
     * 递归释放子属性监听器（保留数据，供 undo 复用）
     */
    releaseListeners() {
        this._properties.forEach((prop) => prop.releaseListeners());
        super.releaseListeners();
    }

    /**
     * 递归释放：先释放全部子属性，再清空自身监听器与子引用
     */
    dispose() {
        this._properties.forEach((prop) => prop.dispose());
        this._properties = [];
        super.dispose();
    }

    toModJSON() {
        return {
            ...this.properties.map((p) => p.toModJSON()),
        };
    }
}
