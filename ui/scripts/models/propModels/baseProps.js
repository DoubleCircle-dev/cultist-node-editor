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
        this.config = {};
    }

    toJSON() {
        return {
            id: this.id,
            value: this.value,
            config: this.config
        };
    }
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

            hasLeftPort: false,
            leftPortDirect: portConfig.leftPortDirect || 'input',
            leftRequiredType: portConfig.leftRequiredType || null,
            leftExportType: portConfig.leftExportType || null,

            hasRightPort: false,
            rightPortDirect: portConfig.rightPortDirect || 'output',
            rightRequiredType: portConfig.rightRequiredType || null,
            rightExportType: portConfig.rightExportType || null,

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
    /**
     * @param {string} id
     * @param {string} label
     * @param {string} type
     * @param {any} value
     * @param {any} min
     * @param {any} max
     */
    constructor(id, label, type, value, min, max) {
        super(id, label, type, value);
        this.config.min = min;
        this.config.max = max;
    }
    /**
     * 设置值的方法，确保值在最小值和最大值之间
     * @param {number} v - 要设置的值
     */
    setValue(v) {
        // 使用Math.max和Math.min确保值在this.min和this.max之间
        // 如果v小于this.min，则取this.min；如果v大于this.max，则取this.max；否则取v本身
        this.value = Math.max(this.config.min, Math.min(this.config.max, v));
    }
}

export class OptionsProp extends BaseProp {
    /**
     * @param {string} id
     * @param {string} label
     * @param {string} type
     * @param {any} value
     */
    constructor(id, label, type, value, options = []) {
        super(id, label, type, value);
        this.config.opts = options;
    }
}

export class ViewProp extends PortProp {
    /**
     * @param {string} id
     * @param {string} label
     * @param {string} type
     * @param {any} value
     */
    constructor(id, label, type, value) {
        super(id, label, type, value, { pos: 'top-left' });
    }
}
