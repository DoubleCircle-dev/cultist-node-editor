import { BaseProp } from "../models/propModels/baseProp.js";
import { PortProp } from "../models/propModels/portProp.js";
import { PortModel } from "../models/portModel.js";
import { PropRenderer } from "../generators/propGenerator.js";
import { NodeTypeRegistry } from "../types/nodeTypes.js";
import { HubProp } from "../models/propModels/hubProp.js";
import { ViewProp } from "../models/propModels/viewProp.js";

export class PropView {
    /**
     * @param {BaseProp} prop
     * @returns {{ 
     * element: HTMLElement, 
     * listeners: { listener: Function, target: HTMLElement, type: string }[] 
     * }}
     */
    static renderProp(prop) {
        try {
            var result;
            var listeners = [];

            if (!prop) {
                throw new Error('属性不存在');
            }

            if (!prop.type) {
                throw new Error('属性类型未定义');
            }

            if (prop instanceof HubProp) {
                const { element: hub, listeners: hubListeners } = this.createHub(prop);
                listeners = hubListeners;
                if (!hub) {
                    throw new Error('hub属性无法创建');
                }
                result = hub;
            } else if (prop instanceof ViewProp) {
                const{ element: view, listeners: viewListeners } = this.createView(prop);
                listeners = viewListeners;
                if (!view) {
                    throw new Error('view属性无法创建');
                }

                result = view;
            } else {
                const {element:row, listeners: rowListeners} = this.createRow(prop);
                listeners = rowListeners;
                if (!row) {
                    throw new Error('属性无法创建');
                }
                result = row;
            }

            return { element: result, listeners: listeners };
        } catch (error) {
            console.error('属性渲染失败', error, prop);
            return { element: PropRenderer.createErrorDom(error), listeners: listeners };
        }


    }

    static createHint(prop, target) {
        if (prop.description) {
            target.setAttribute('data-description', prop.description);
            target.classList.add('tooltip-trigger');
            // result.title = prop.description;
        }
    }

    /**
     * @param {HubPropType| HubProp} propModel
     * @returns {{ 
     * element: HTMLElement, 
     * listeners: { listener: Function, target: HTMLElement, type: string }[] 
     * }}
     */
    static createHub(propModel) {
        const hub = PropRenderer.createHub('hub', propModel.layout);

        const listeners = [];

        propModel.properties.forEach((/** @type {BaseProp} */ prop) => {
            const renderResult = this.renderProp(prop);
            hub.appendChild(renderResult.element);
            listeners.push(...renderResult.listeners);
        })

        return { element: hub, listeners: [] };
    }

    /**
     * 创建视图的方法
     * @param {BaseProp} propModel - 属性模型对象，包含要渲染的属性信息
     * @returns {{ 
     * element: HTMLElement, 
     * listeners: { listener: Function, target: HTMLElement, type: string }[] 
     * }}
     */
    static createView(propModel) {
        const renderResult = PropRenderer.render(propModel);
        const view = renderResult.element;
        const listeners = renderResult.listeners;

        const mousedownListener = (e) => e.stopPropagation();
        view.addEventListener('mousedown', mousedownListener);
        listeners.push({ listener: mousedownListener, target: view, type: 'mousedown' });
        this.createHint(propModel, view);

        return { element: view, listeners: listeners };
    }

    /**
     * @param {BaseProp} propModel
     * @returns {{ 
     * element: HTMLElement, 
     * listeners: { listener: Function, target: HTMLElement, type: string }[] 
     * }}
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

        const {element: contentElement, listeners: listeners} = this.createContent(propModel.type, propModel);
        content.appendChild(contentElement);

        this.createHint(propModel, content);

        row.appendChild(content);

        // 3. 右槽位 (处理所有输出端点)
        const rightSlot = document.createElement('div');
        rightSlot.className = 'port-slot';
        if (propModel instanceof PortProp && propModel.outputPort) {
            rightSlot.appendChild(this.createPortDom(propModel.outputPort));
        }
        row.appendChild(rightSlot);

        return {element:row, listeners:listeners};
    }

    /**
     * @param {string} type
     * @param {BaseProp} param
     * @returns {{ 
     * element: HTMLElement, 
     * listeners: { listener: Function, target: HTMLElement, type: string }[] 
     * }}
     */
    static createContent(type, param) {
        if (PropRenderer.RenderMap[type]) {
            const result = PropRenderer.RenderMap[type](param);
            const dom = result.element;
            return {element:dom, listeners:result.listeners};
        } else {
            return {element:PropRenderer.createErrorDom(`{ ${type} }渲染器未定义`),listeners:[]};
        }
    }

    /**
     * @param {PortModel} portModel
     */
    static createPortDom(portModel) {
        const dom = document.createElement('div');
        dom.className = `port-dot ${portModel.portType} ${portModel.pos}`;
        dom.style.backgroundColor = NodeTypeRegistry.getColor(portModel.dataType);

        // 测量port元素
        portModel.addEventListener('getRect', (e) => {
            portModel.width = dom.offsetWidth;
            portModel.height = dom.offsetHeight;

            const rect = dom.getBoundingClientRect();

            portModel.x = rect.x + rect.width / 2;
            portModel.y = rect.y + rect.height / 2;

        })

        portModel.addEventListener('dragging', (e) => {
            dom.classList.add('dragging');
        })

        portModel.addEventListener('connected', (e) => {
            dom.classList.add('connected');
        })

        portModel.addEventListener('disconnected', (e) => {
            dom.classList.remove('connected');
        })

        dom.addEventListener('mouseenter', () => {
            dom.classList.add('hover');
        });


        dom.addEventListener('mousedown', (e) => {
            e.stopPropagation();

            if (!portModel.parentProp) {
                console.error('未找到端口对应属性');
                return;
            }

            portModel.triggerEvent('mousedown:port', e);
        });

        dom.addEventListener('mouseup', (e) => {
            // e.stopPropagation();

            if (!portModel.parentProp) {
                console.error('未找到端口对应属性');
                return;
            }

            portModel.triggerEvent('mouseup:port', e);
        })


        return dom;
    }


}


