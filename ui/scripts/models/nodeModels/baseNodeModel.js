import { PropGenerator } from '../../generators/propGenerator.js'
import { BaseProp } from '../propModels/baseProp.js';

export class BaseNodeModel extends EventTarget {


    /**
     * 
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
        this.id = id;
        this.type = type;

        // 显示属性
        this.properties = properties;

        this.color = config.color || '#ffffff';
        this.title = config.title || 'Base Node';
        this.icon = config.icon || '⚡';

        // 连接管理
        this.connections = { inputs: [], outputs: [] };

        // UI状态
        this.selected = false;
        this.collapsed = false;
        this.x = x;
        this.y = y;
        this.width = config.width || 300;
        this.height = config.height || 0;

    }

    /**
     * 更新位置并通知监听者
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
     * @param {number} width
     * @param {number} height
     */
    setRect(width, height) {
        this.width = width;
        this.height = height;
        this.emit('change:rect', { width, height });
    }

    /**
     * 更新属性值
     * @param {string} key 属性名
     * @param {any} value 属性值
     */
    setProperty(key, value) {
        this.properties[key] = value;
        this.emit('change:property', { key, value });
    }

    /**
     * 设置选中状态并触发变更事件
     * @param {boolean} isSelected - 要设置的选中状态值
     */
    setSelected(isSelected) {
        this.selected = isSelected;  // 更新当前选中状态
        this.emit('change:select', { isSelected });  // 触发选中状态变更事件，传递新的选中状态
    }

    /**
     * 简单的事件分发辅助函数
     * @param {string} type - 事件类型
     * @param {any} detail - 事件详细信息
     */
    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
    
    handleMouseDown(originalEvent) {
        this.dispatchEvent(new CustomEvent('mousedown', {
            detail: { originalEvent, node: this }
        }));
    }

    /**
     * 序列化：用于保存到 JSON 或发送给 VSCode 后端
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            position: { x: this.x, y: this.y },
            properties: { ...this.properties },
            connections: { inputs: this.connections.inputs, outputs: this.connections.outputs },
            ui: { collapsed: this.collapsed }
        };
    }

    /**
     * 反序列化：从保存的数据恢复
     */
    static fromJSON(json) {

    }

}

