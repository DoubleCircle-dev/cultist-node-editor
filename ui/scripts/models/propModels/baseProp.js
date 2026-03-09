export class BaseProp {

    /**
     * @param {string} id - 用来识别属性 
     * @param {string} label - 属性的显示名称
     * @param {string} type - 属性的类型
     * @param {any} value - 属性的值
     *  
     *  */
    constructor(id, label, type, value) {
        this.id = id;
        this.label = label;
        this.type = type;
        this.value = value;

        this.config = {};

        this.parentNode = null;
    }

    toJSON() {
        return {
            id: this.id,
            value: this.value,
            config: this.config
        };
    }
}

