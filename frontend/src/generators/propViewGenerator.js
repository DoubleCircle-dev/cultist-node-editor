import { BaseProp } from "../models/propModels/baseProp.js";
import { PortProp } from "../models/propModels/portProp.js";
import { PortModel } from "../models/propModels/portModel.js";
import { PropGenerator, PropRenderer } from "./propGenerator.js";
import { NodeTypeRegistry } from "../types/nodeTypes.js";
import { HubProp } from "../models/propModels/hubProp.js";
import { ViewProp } from "../models/propModels/viewProp.js";

/**
 * Hub 「可选标签」的显示方式（全局，由设置面板切换）
 *
 * - `bar`（默认）：标签以 title 栏形式出现在 hub 上方；
 * - `corner`：标签收到 hub 右下角的图标里，悬停/点击看说明。
 *
 * ⚠️ 只有显式标了 `hub.showLabel = true` 的 hub 才画标签（容器节点的透传属性 hub）。
 * 模板里那些 hub（端口 / 基础 / 扩展…）不挂标签，否则整张画布的节点高度与排版都会变。
 */
let hubLabelMode = 'bar';

/**
 * 切换 Hub 标签的显示方式
 *
 * @param {'bar' | 'corner'} mode
 * @returns {void}
 */
export function setHubLabelMode(mode) {
    hubLabelMode = mode === 'corner' ? 'corner' : 'bar';
}

export class PropView {
    /**
     * @param {BaseProp} prop
     * @returns {{ 
     * element: HTMLElement, 
     * listeners: listenerMap[] 
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
                const { element: view, listeners: viewListeners } = this.createView(prop);
                listeners = viewListeners;
                if (!view) {
                    throw new Error('view属性无法创建');
                }

                result = view;
            } else {
                const { element: row, listeners: rowListeners } = this.createRow(prop);
                listeners = rowListeners;
                if (!row) {
                    throw new Error('属性无法创建');
                }
                result = row;
            }

            return { element: result, listeners: listeners };
        } catch (error) {
            console.error('属性渲染失败', error, prop);
            if (error instanceof Error) {
                return { element: PropRenderer.createErrorDom(error.message), listeners: [] };
            } else {
                return { element: PropRenderer.createErrorDom('未知错误'), listeners: [] };
            }
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
     * listeners: listenerMap[] 
     * }}
     */
    static createHub(propModel) {
        const hub = PropRenderer.createHub('hub', propModel.layout);

        /** @type {listenerMap[]} */
        const listeners = [];

        // 「可选标签」：标了 showLabel 的 hub 才画（标签栏 / 右下角图标两种样式）
        if (propModel.showLabel && propModel.label) {
            hub.classList.add('has-label');
            if (hubLabelMode === 'corner') {
                const icon = document.createElement('button');
                icon.type = 'button';
                icon.className = 'prop-hub-label-icon';
                icon.textContent = '🏷';
                icon.title = propModel.label;
                const noDrag = (/** @type {Event} */ e) => e.stopPropagation();
                icon.addEventListener('mousedown', noDrag);
                listeners.push({ target: icon, type: 'mousedown', listener: noDrag });
                hub.appendChild(icon);
            } else {
                const label = document.createElement('div');
                label.className = 'prop-hub-label';
                label.textContent = propModel.label;
                label.title = propModel.label;
                hub.appendChild(label);
            }
        }

        propModel.properties.forEach((/** @type {BaseProp} */ prop) => {
            const renderResult = this.renderProp(prop);
            hub.appendChild(renderResult.element);
            // 关键：子属性的监听器必须逐层向上汇总，否则销毁/重绘时无法移除
            listeners.push(...renderResult.listeners);
        })

        return { element: hub, listeners: listeners };
    }

    /**
     * 创建视图的方法
     * @param {BaseProp} propModel - 属性模型对象，包含要渲染的属性信息
     * @returns {{ 
     * element: HTMLElement, 
     * listeners: listenerMap[] 
     * }}
     */
    static createView(propModel) {
        const renderResult = PropRenderer.render(propModel);
        const view = renderResult.element;
        const listeners = renderResult.listeners;

        const wrapper = document.createElement('div');
        wrapper.className = 'prop-view';

        const portWrap = document.createElement('div');
        portWrap.className = 'prop-view-port';

        if (propModel instanceof PortProp && propModel.inputPort) {
            const { element: portDom, listeners: portListeners } = this.createPortDom(propModel.inputPort);
            portWrap.appendChild(portDom);
            listeners.push(...portListeners);
        }

        const contentWrap = document.createElement('div');
        contentWrap.className = 'prop-view-content';
        contentWrap.appendChild(view);

        const mousedownListener = (/**@type {Event}*/e) => e.stopPropagation();
        wrapper.addEventListener('mousedown', mousedownListener);
        listeners.push({ listener: mousedownListener, target: wrapper, type: 'mousedown' });

        wrapper.append(portWrap, contentWrap);
        this.createHint(propModel, wrapper);

        return { element: wrapper, listeners: listeners };
    }

    /**
     * @param {BaseProp} propModel
     * @returns {{ 
     * element: HTMLElement, 
     * listeners: listenerMap[] 
     * }}
     */
    static createRow(propModel) {

        const row = document.createElement('div');
        row.className = `prop-row type-${propModel.type}`;
        if (propModel.forward) row.classList.add('prop-forward');

        /** @type {listenerMap[]} */
        const listeners = [];

        // 1. 左槽位 (处理所有输入端点)
        const leftSlot = document.createElement('div');
        leftSlot.className = 'port-slot';
        if (propModel instanceof PortProp) {

            if (propModel.inputPort) {
                const { element: portDom, listeners: portListeners } = this.createPortDom(propModel.inputPort);
                leftSlot.appendChild(portDom);
                listeners.push(...portListeners);
            }

            if (propModel.layout === PortProp.layoutTypes.noLeft ||
                propModel.layout === PortProp.layoutTypes.ignorePort) {
                leftSlot.classList.add('hidden');
            }
        }

        row.appendChild(leftSlot);


        // 2. 中间内容区 (Label + Control)
        const content = document.createElement('div');
        content.className = 'prop-content';
        // content.style.border = '1px solid white';

        const { element: contentElement, listeners: contentListeners } = PropRenderer.render(propModel);
        content.appendChild(contentElement);
        listeners.push(...contentListeners);

        if (propModel instanceof ViewProp) {
            const stopPropagationListener = (e) => e.stopPropagation();
            content.addEventListener('mousedown', stopPropagationListener);
            listeners.push({ target: content, type: 'mousedown', listener: stopPropagationListener });
        }

        this.createHint(propModel, content);

        row.appendChild(content);

        // 3. 右槽位 (处理所有输出端点)
        const rightSlot = document.createElement('div');
        rightSlot.className = 'port-slot';
        
        if (propModel instanceof PortProp) {
            if (propModel.outputPort) {
                const { element: portDom, listeners: portListeners } = this.createPortDom(propModel.outputPort);
                rightSlot.appendChild(portDom);
                listeners.push(...portListeners);
            }

            if (propModel instanceof ViewProp && !propModel.outputPort) {
                rightSlot.classList.add('hidden');
            }

            if (propModel.layout === PortProp.layoutTypes.noRight ||
                propModel.layout === PortProp.layoutTypes.ignorePort) {
                rightSlot.classList.add('hidden');
            }
            
        }
        row.appendChild(rightSlot);

        return { element: row, listeners: listeners };
    }

    /**
     * 创建端口 DOM 并返回其全部监听器（含 portModel 模型监听器）
     *
     * @param {PortModel} portModel
     * @returns {{ element: HTMLElement, listeners: listenerMap[] }}
     */
    static createPortDom(portModel) {
        const dom = document.createElement('div');
        // 容量形状：单连接（maxLinks===1）用三角形，多连接用圆形
        const capacityClass = portModel.maxLinks === 1 ? 'single' : 'multi';
        dom.className = `port-dot ${portModel.portType} ${portModel.pos} ${capacityClass}`;
        // 用 CSS 变量承载端口颜色，供空心（描边）/实心（填充）样式统一取色
        dom.style.setProperty('--port-color', NodeTypeRegistry.getColor(portModel.dataType));

        // 恢复加载时若端口已连接，直接标记实心样式
        if (portModel.isConnected) {
            dom.classList.add('connected');
        }

        // 反向记录端口（契约 `links[].reverse`，如 recipe 的 alt / linked / inductions、元素的 induces）：
        // 列表写在本节点上，但「是否跳转 / 能否触发」由**对端** recipe 决定 → 给一圈外环 + 悬停提示。
        // ⚠️ `reverse` 在**端口属性**（`PortProp`）上，不在 `PortModel` 上 → 经 `parentProp` 读。
        const ownerProp = /** @type {any} */ (portModel.parentProp);
        if (ownerProp && ownerProp.reverse) {
            dom.classList.add('reverse');
            dom.title = '分支（反向记录）：列表写在本节点上，但判定由对端 recipe 决定';
        }

        /** @type {listenerMap[]} */
        const listeners = [];

        // —— portModel 模型监听器 ——
        const getRectListener = () => {
            portModel.width = dom.offsetWidth;
            portModel.height = dom.offsetHeight;

            const rect = dom.getBoundingClientRect();

            portModel.x = rect.x + rect.width / 2;
            portModel.y = rect.y + rect.height / 2;
        };
        const draggingListener = () => {
            dom.classList.add('dragging');
        };
        const connectedListener = () => {
            dom.classList.add('connected');
        };
        const disconnectedListener = () => {
            dom.classList.remove('connected');
        };

        // —— DOM 监听器 ——
        const mouseEnterListener = () => {
            dom.classList.add('hover');
        };
        const mouseDownListener = (e) => {
            e.stopPropagation();

            if (!portModel.parentProp) {
                console.error('未找到端口对应属性');
                return;
            }

            portModel.triggerEvent('mousedown:port', e);
        };
        const mouseUpListener = (e) => {
            // e.stopPropagation();

            if (!portModel.parentProp) {
                console.error('未找到端口对应属性');
                return;
            }

            portModel.triggerEvent('mouseup:port', e);
        };

        portModel.addEventListener('getRect', getRectListener);
        portModel.addEventListener('dragging', draggingListener);
        portModel.addEventListener('connected', connectedListener);
        portModel.addEventListener('disconnected', disconnectedListener);

        dom.addEventListener('mouseenter', mouseEnterListener);
        dom.addEventListener('mousedown', mouseDownListener);
        dom.addEventListener('mouseup', mouseUpListener);

        listeners.push(
            { target: portModel, type: 'getRect', listener: getRectListener },
            { target: portModel, type: 'dragging', listener: draggingListener },
            { target: portModel, type: 'connected', listener: connectedListener },
            { target: portModel, type: 'disconnected', listener: disconnectedListener },
            { target: dom, type: 'mouseenter', listener: mouseEnterListener },
            { target: dom, type: 'mousedown', listener: mouseDownListener },
            { target: dom, type: 'mouseup', listener: mouseUpListener }
        );

        return { element: dom, listeners };
    }

}


