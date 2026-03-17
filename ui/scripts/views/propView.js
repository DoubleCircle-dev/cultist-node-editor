import { BaseProp } from "../models/propModels/baseProp.js";
import { PortProp } from "../models/propModels/portProp.js";
import { PortModel } from "../models/portModel.js";
import { PropRenderer } from "../generators/propGenerator.js";
import { NodeTypeRegistry } from "../types/nodeTypes.js";
import { HubProp } from "../models/propModels/hubProp.js";
import { ViewProp } from "../models/propModels/viewProp.js";

export class PropView {
    /**
     * @param {PropType} prop
     * @returns {HTMLElement}
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

        if (prop instanceof HubProp) {
            return this.createHub(prop);
        }

        if(prop instanceof ViewProp) {
            return this.createView(prop);
        }

        return this.createRow(prop);
    }

    /**
     * @param {HubPropType| HubProp} propModel
     */
    static createHub(propModel) {
        const hub = PropRenderer.createHub('hub', propModel.layout);

        propModel.properties.forEach((/** @type {PropType} */ prop) => {
            hub.appendChild(this.renderProp(prop));
        })

        return hub;
    }

    /**
     * 创建视图的方法
     * @param {PropType} propModel - 属性模型对象，包含要渲染的属性信息
     */
    static createView(propModel) {
        const view = PropRenderer.RenderMap[propModel.type](propModel);
        view.addEventListener('mousedown', (e) => e.stopPropagation());
        return view;
    }

    /**
     * @param {PropType} propModel
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
        // content.style.border = '1px solid white';
        content.addEventListener('mousedown', (e) => e.stopPropagation());

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

    /**
     * @param {string} type
     * @param {PropType} param
     */
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

        dom.addEventListener('mousedown', (e) => {e.stopPropagation();});
        return dom;
    }
}


