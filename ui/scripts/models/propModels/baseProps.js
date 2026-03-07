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

        this.port = null;
        this.extra = {};
    }


    toJSON() { return { id: this.id, value: this.value }; }
}

export class PortProp extends BaseProp {
    /**
     * @param {string} id - 用来识别属性 
     * @param {string} label - 属性的显示名称
     * @param {string} type - 属性的类型
     * @param {any} value - 属性的值
     * @param {object} portConfig - 端口配置
     * 
     *  */
    constructor(id, label, type, value, portConfig = {}) {
        super(id, label, type, value);
        this.port = {
            visible: portConfig.type || 'implicit',
            pos: portConfig.pos || 'left',
            multiConnect: portConfig.multiConnect ?? true,
            isConnected: false
        };
    }

    toJSON() {
        const result = super.toJSON();

        return result;
    }
}

export class NumericProp extends PortProp {
    constructor(id, label, type, value, min, max) {
        super(id, label, type, value);
        this.min = min;
        this.max = max;
    }
    setValue(v) {
        this.value = Math.max(this.min, Math.min(this.max, v));
    }
}

export class OptionsProp extends PortProp {
    constructor(id, label, type, value, options = []) {
        super(id, label, type, value);
        this.options = options;
    }
}

export class ViewProp extends PortProp {
    constructor(id, label, type, value) {
        super(id, label, type, value, { pos: 'top-left' });
    }
}
