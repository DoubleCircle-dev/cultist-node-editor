import { BaseProp } from "../models/propModels/baseProps.js";
import { PortProp } from "../models/propModels/baseProps.js";
import { PropRenderMap } from "../generators/propGenerator.js";

export class PropView {
    /**
     * @param {BaseProp | PortProp} prop
     */
    static renderRow(prop) {
        const row = document.createElement('div');
        row.className = `prop-row type-${prop.type}`;

        return row;
    }

    /**
     * @param {BaseProp | PortProp} propModel
     */
    static createRow(propModel) {
        const row = document.createElement('div');
        row.className = `prop-row type-${propModel.type}`;

        // 1. 左槽位 (处理所有输入端点)
        const leftSlot = document.createElement('div');
        leftSlot.className = 'port-slot';
        if (propModel.port && propModel.port.direction === 'input') {
            leftSlot.appendChild(this.createPortDom(propModel.port));
        }
        row.appendChild(leftSlot);

        // 2. 中间内容区 (Label + Control)
        const content = document.createElement('div');
        content.className = 'prop-content';

        content.appendChild(this.createContent(propModel.type, this.createParam(propModel)));

        row.appendChild(content);

        // 3. 右槽位 (处理所有输出端点)
        const rightSlot = document.createElement('div');
        rightSlot.className = 'port-slot';
        if (propModel.port && propModel.port.direction === 'output') {
            rightSlot.appendChild(this.createPortDom(propModel.port));
        }
        row.appendChild(rightSlot);

        return row;
    }

    // 创建content所需要的参数格式
    static createParam(propModel) {
        const p = {
            id: propModel.id,
            value: propModel.value,
            extra: propModel.extra,
        }
        return p;
    }

    static createContent(type, param) {
        return PropRenderMap[type](param);
    }

    /**
     * @param {{type:string; visible: string; pos: string;  isConnected: boolean; }} config
     */
    static createPortDom(config) {
        if (config.type === 'none') return null;
        const dom = document.createElement('div');
        dom.className = `port-dot ${config.visible} ${config.pos}`;
        return dom;
    }
}


