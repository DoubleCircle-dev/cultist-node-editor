import { BaseProp } from './baseProp.js';
import { PortModel } from './portModel.js';

export class PortProp extends BaseProp {
    static layoutTypes = {
        normal: 'normal',
        noLeft: 'no-left',
        noRight: 'no-right',
        ignorePort: 'ignore-port',
    };

    /**
     * @param {string} id - 用来识别属性
     * @param {string} label - 属性的显示名称
     * @param {string} type - 属性的类型
     * @param {any} value - 属性的值
     * @param {any} config - 端口配置
     */
    constructor(id, label, type, value, config = {}) {
        const defaultConfig = {
            placeholder: '',
            name: 'undefined',
            layout: 'normal',
            inputPort: null,
            outputPort: null,
            valueType: '',
        };

        const portConfig = { ...defaultConfig, ...config };

        if (!Object.values(PortProp.layoutTypes).includes(portConfig.layout)) {
            portConfig.layout = PortProp.layoutTypes.normal;
            console.warn(`layout ${portConfig.layout} 不在PortProp定义中`);
        }

        super(id, label, type, value, null, portConfig);

        /**
         * 端口属性的值类型（如 `'text'` / `'number'`）
         *
         * 有值时：端口旁多一个可编辑输入框 —— 未连线时值由用户手填（直接写回该字段），
         * 连线后值以连线为准（只读显示目标节点 id）。空字符串 = 纯端口（只有连接按钮）。
         *
         * @type {string}
         */
        this.valueType = portConfig.valueType || '';

        /**
         * 是否为「转发端口」（复合节点对外暴露的内部端口）
         *
         * 由 `ControllerCore.addForwardPort` 动态加在宿主节点上；折叠态下属性区只留它
         * （CSS 用 `.prop-forward` 选择）。
         */
        this.forward = Boolean(portConfig.forward);

        /**
         * 是不是「**反向记录**」端口（契约 `links[].reverse`）
         *
         * ⚠️ 语义：**书写位置与判定主体不在同一端** —— 分支列表写在**源**条目上（所以它是源条目的 output
         * 端口，画布上就是输出），但「是否跳转 / 以什么条件生效」由**对端 recipe 自己的定义**决定。
         * 消费方据此知道这条线的**语义主体在对端**：
         *   - 写回 / 受保护来源判定要找对端，而不是本端；
         *   - 不能因为「列表在本端」就当成「本端说了算」。
         *
         * 当前标它的字段：`recipes.alt` / `linked` / `alternativerecipes` / `inductions`、`elements.induces`。
         * 判定一律**按端口**（同名字段可能还有不带 reverse 的 link，如 `alt.expulsion`）。
         *
         * @type {boolean}
         */
        this.reverse = Boolean(portConfig.reverse);

        /** @type {PortModel | null} */
        this.inputPort = null;

        if (portConfig.inputPort && portConfig.inputPort.id) {
            this.inputPort = new PortModel(portConfig.inputPort.id, 'input', portConfig.inputPort);
            if (this.inputPort) {
                this.inputPort.parentProp = this;
            }else {
                console.error(`端口 ${portConfig.inputPort.id} 创建失败`, portConfig.inputPort);
            }
        }

        /** @type {PortModel | null} */
        this.outputPort = null;
        if (portConfig.outputPort && portConfig.outputPort.id) {
            this.outputPort = new PortModel(portConfig.outputPort.id, 'output', portConfig.outputPort);
            if (this.outputPort) {
                this.outputPort.parentProp = this;
            }
        }

    }

    onPortEvent(eventName, detail) {
        this.onEvent(eventName, detail);
    }

    get isConnected() {
        return (this.inputPort && this.inputPort.isConnected) || (this.outputPort && this.outputPort.isConnected);
    }

    /**
     * 释放端口属性监听器（保留数据，供 undo 复用）
     */
    releaseListeners() {
        this.inputPort?.releaseListeners();
        this.outputPort?.releaseListeners();
        super.releaseListeners();
    }

    /**
     * 释放端口属性：先释放两侧 PortModel，再释放自身监听器
     */
    dispose() {
        this.inputPort?.dispose();
        this.inputPort = null;
        this.outputPort?.dispose();
        this.outputPort = null;
        super.dispose();
    }

    toJSON() {
        const result = super.toJSON();

        return result;
    }
}
