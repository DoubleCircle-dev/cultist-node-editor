import { IEventTarget } from '../../types/IEventTarget.js';
import { BaseProp } from '../propModels/baseProp.js';
import { HubProp } from '../propModels/hubProp.js';

export class BaseNodeModel extends IEventTarget {
    /**
     * @param {String | number} id
     * @param {String} type
     * @param {number} x
     * @param {number} y
     * @param {NodeConfig} config
     * @param {BaseProp[]} properties
     */

    constructor(id, type, x, y, config, properties = []) {
        super();

        // 基础属性
        /** @private */
        this._id = id;
        this.type = type;

        /** @private */
        this._properties = properties;

        this.color = config.color || '#ffffff';
        this.title = config.title || 'Base Node';
        this.label = '';
        this.icon = config.icon || '⚡';

        // UI状态
        this.selected = false;
        this.collapsed = false;
        this.x = x;
        this.y = y;
        this.width = config.width || 300;
        this.height = config.height || 0;
    }

    /**
     * 获取对象的ID属性 将内部ID转换为字符串形式返回
     *
     * @returns {string} 返回转换后的字符串ID
     */
    get id() {
        return String(this._id); // 将内部_id属性转换为字符串并返回
    }

    /**
     * 设置ID的setter方法
     *
     * @param {any} id - 要设置的ID值，可以是任何类型，但会被转换为字符串类型
     */
    set id(id) {
        if (!id) {
            return;
        }

        // 检查传入的id是否为String类型
        if (typeof id === 'string' || typeof id === 'number') {
            // 如果是String类型，直接赋值给_id属性
            /** @private */
            this._id = id;
        } else {
            console.error('Invalid id type:', typeof id);
        }
    }

    /** @returns {BaseProp[]} Properties */
    get properties() {
        return this._properties;
    }

    /** @param {BaseProp[]} properties */
    set properties(properties) {
        /** @private */
        this._properties = properties;
    }

    get detailProperties() {
        return this.properties.flatMap((prop) => (prop instanceof HubProp ? prop.detailProperties : prop));
    }

    /**
     * 直接设置属性值，不触发finished事件
     *
     * @param {string} propId
     * @param {any} value
     */
    setPropValue(propId, value) {
        const prop = this.detailProperties.find((prop) => prop.id === propId);
        if (!prop) {
            console.error('未找到对应属性', propId);
            return;
        }

        prop.setValue(value);
    }

    /** @param {BaseProp} prop */
    addProperty(prop) {
        this._properties.push(prop);
    }

    /** @param {BaseProp[]} props */
    appendProps(props) {
        this._properties.push(...props);
    }

    /**
     * 更新位置并通知监听者
     *
     * @param {number} x
     * @param {number} y
     */
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.emit('change:position', { x, y });
    }

    /**
     * 通过差值更新位置并通知监听者
     *
     * @param {number} dx
     * @param {number} dy
     */
    moveBy(dx, dy) {
        this.x += dx;
        this.y += dy;
        this.emit('change:position', { x: this.x, y: this.y });
    }

    /**
     * 重设大小并通知监听者
     *
     * @param {number} width
     * @param {number} height
     */
    setRect(width, height) {
        this.width = width;
        this.height = height;
        this.emit('change:rect', { width, height });
    }

    /**
     * 设置选中状态并触发变更事件
     *
     * @param {boolean} isSelected - 要设置的选中状态值
     */
    setSelected(isSelected) {
        this.selected = isSelected; // 更新当前选中状态
        this.emit('change:select', { isSelected }); // 触发选中状态变更事件，传递新的选中状态
    }

    /** @param {number} index */
    setZIndex(index) {
        this.emit('change:zIndex', { index });
    }

    /** @param {boolean} isCollapsed */
    setCollapsed(isCollapsed) {
        this.collapsed = isCollapsed;
        this.emit('change:collapsed', { isCollapsed });
    }

    /** 序列化：用于保存到 JSON 或发送给 VSCode 后端 */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            position: { x: this.x, y: this.y },
            properties: { ...this.properties },
            ui: { collapsed: this.collapsed },
        };
    }

    /**
     * 反序列化：从保存的数据恢复
     *
     * @param {Object} json - JSON 格式的节点数据
     */
    static fromJSON(json) {}

    toModJSON() {}
}
