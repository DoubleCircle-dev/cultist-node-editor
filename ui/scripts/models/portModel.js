import { IEventTarget } from "../types/IEventTarget.js";
import { PortProp } from "./propModels/portProp.js";

export class PortModel extends IEventTarget {
    /**
     * 检查当前端口是否可以连接到目标端口
     * @param {string} id - 目标端口对象
     * @param {'input'|'output'|'bi'} direction -连接方向
     * @param {object} options - 端口配置
     */
    constructor(id, direction, options = {}) {
        super();
        this.id = id;
        this.direction = direction;

        this.width = null;
        this.height = null;

        //记录的中心点的绝对坐标
        this.x = null;
        this.y = null;

        // 核心设置
        this.portType = options.portType || 'explicit'; // explicit, implicit
        // input时当作requiredType, output时当作returnType
        this.dataType = options.dataType || 'any'; // 对应 --node-number, --node-text 等
        // 位置管理
        this.pos = options.pos || 'mid'; // mid, top, attached, attached-top, attached-bottom

        // 连接管理
        this.maxLinks = options.maxLinks || Infinity;
        this.links = options.links || [];

        // 归属引用
        /**@type {PortProp}  parentProp */
        this.parentProp = options.parentProp || null;

        this.isConnected = options.isConnected || false;
    }

    canConnected() {
        if (this.isConnected) {
            if (this.links.length >= this.maxLinks) {
                return false;
            }
        }

        return true;
    }

    /**
     * 检查当前端口是否可以连接到目标端口
     * @param {PortModel} targetPort - 目标端口对象
     * @returns {boolean} - 是否可以连接
     */
    canConnectTo(targetPort) {
        if (!targetPort || targetPort === this) return false;
        if (this.direction === targetPort.direction) return false; // 不能同向连接
        if (this.dataType !== 'any' && targetPort.dataType !== 'any' && this.dataType !== targetPort.dataType) {
            return false; // 数据类型不匹配
        }
        if (this.links.length >= this.maxLinks) return false; // 达到连接上限
        if (targetPort.links.length >= targetPort.maxLinks) return false; // 目标端口达到连接上限
        if (this.links.includes(targetPort)) return false; // 已经连接
        return true;
    }

    /**
     * 连接到目标端口的方法
     * @param {PortModel} targetPort - 要连接的目标端口对象
     */
    ConnectTo(targetPort) {
        // 将目标端口添加到当前对象的链接数组中，建立从当前对象到目标端口的连接
        this.links.push(targetPort);
        // 同时将当前对象添加到目标端口的链接数组中，实现双向连接，确保两个端口互相连接
        targetPort.links.push(this);

        this.isConnected = true;
        targetPort.isConnected = true;

        this.emit('connected', null);
        targetPort.emit('connected', null);
    }

    remove(targetPort){
        this.remove_(targetPort);
        targetPort.remove_(this);
    }

    remove_(targetPort) {

        const index = this.links.indexOf(targetPort);
        // const index = this.links..findIndex(m => m.id === targetPort.id);

        if (index !== -1) {
            this.links.splice(index, 1);
        }

        if (this.links.length === 0) {
            this.isConnected = false;
            this.emit('disconnected', null);
        }

    }

    getLinks() {
        return this.links;
    }

    triggerEvent(eventName, originalEvent) {

        const detail = {
            portId: this.id,
            port: this,
            originalEvent: originalEvent
        };

        // 1. 触发自身事件，方便直接监听 Port
        this.emit(eventName, detail)
        // 2. 向上传递给父 Prop
        if (!this.parentProp) {
            console.error('无法传递事件给父对象prop，父对象不存在');
            return;
        }
        if (!(typeof this.parentProp.onPortEvent === 'function')) {
            console.error('无法传递事件给父对象prop，父对象无法处理事件');
            return;
        }

        if (!this.canConnected()) {
            this.parentProp.onPortEvent('canNotConnected:port', detail);
            return;
        }

        this.parentProp.onPortEvent(eventName, detail);

    }

    getBoundingClientRect() {
        if (this.dispatchEvent(new CustomEvent('getRect', {}))) {
            return { width: this.width, height: this.height, x:this.x, y:this.y };
        } else {
            console.error('无法发送获取位置的请求');
            return { width: 0, height: 0, x: 0, y: 0 }
        }

    }


    toJson() {
        return {
            id: this.id,
            direction: this.direction,
            dataType: this.dataType,
            portType: this.portType,
            maxLinks: this.maxLinks,
            links: this.links,
            parentProp: this.parentProp
        }
    }

    /**
     * 从JSON对象创建PortModel实例的静态方法
     * @param {Object} json - 包含端口信息的JSON对象，应包含id、direction等属性
     * @returns {PortModel} 返回一个新的PortModel实例
     */
    static fromJson(json) {
        // 使用传入的json对象创建一个新的PortModel实例
        // 传入json对象作为第三个参数，可能用于保留完整的原始数据
        return new PortModel(json.id, json.direction, json);
    }

}
