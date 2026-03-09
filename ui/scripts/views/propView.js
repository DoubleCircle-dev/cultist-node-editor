import { BaseProp } from "../models/propModels/baseProp.js";
import { PortProp } from "../models/propModels/portProp.js";
import { PortModel } from "../models/portModel.js";
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
        if (propModel instanceof PortProp && propModel.inputPort) {
            leftSlot.appendChild(this.createPortDom(propModel.inputPort));
        }
        row.appendChild(leftSlot);

        // 2. 中间内容区 (Label + Control)
        const content = document.createElement('div');
        content.className = 'prop-content';

        content.appendChild(this.createContent(propModel.type, propModel));

        row.appendChild(content);

        // 3. 右槽位 (处理所有输出端点)
        const rightSlot = document.createElement('div');
        rightSlot.className = 'port-slot';
        if (propModel instanceof PortProp && propModel.outputPort) {
            rightSlot.appendChild(this.createPortDom(propModel.outputPort));
        }
        row.appendChild(rightSlot);

        return row;
    }

    static createContent(type, param) {
        return PropRenderMap[type](param);
    }

    /**
     * @param {PortModel} portModel
     */
    static createPortDom(portModel) {
        const dom = document.createElement('div');
        dom.className = `port-dot ${portModel.portType} ${portModel.pos}`;
        return dom;
    }
}


