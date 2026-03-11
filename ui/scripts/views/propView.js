import { BaseProp } from "../models/propModels/baseProp.js";
import { PortProp } from "../models/propModels/portProp.js";
import { PortModel } from "../models/portModel.js";
import { PropRenderer } from "../generators/propGenerator.js";
import { NodeTypeRegistry } from "../generators/nodeTypes.js";

export class PropView {
    /**
     * @param {BaseProp | PortProp} prop
     */
    static renderProp(prop) {
        if (!prop) {
            console.error('属性不存在', prop);
            return PropRenderer.createErrorDom();
        }

        if (!prop.type) {
            console.error('属性类型未定义', prop);
            return PropRenderer.createErrorDom();
        }

        if (prop.type === 'hub') {
            return this.createHub(prop);
        }

        return this.createRow(prop);
    }

    static createHub(propModel) {
        const hub = PropRenderer.createHub('hub');

        propModel.properties.forEach(prop => {
            hub.appendChild(this.renderProp(prop));
        })


        return hub;
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
        try {
            return PropRenderer.RenderMap[type](param);
        } catch (e) {
            console.error(e, type, param);
            return PropRenderer.createErrorDom();

        }
    }

    /**
     * @param {PortModel} portModel
     */
    static createPortDom(portModel) {
        const dom = document.createElement('div');
        dom.className = `port-dot ${portModel.portType} ${portModel.pos}`;
        dom.style.backgroundColor = NodeTypeRegistry.getColor(portModel.dataType);
        return dom;
    }
}


