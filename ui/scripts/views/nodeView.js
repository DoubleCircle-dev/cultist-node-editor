import { NodeModel } from '../models/nodeModels/nodeModel.js';
import { PropView } from './propView.js';

export class NodeView {
    /**
     * 构造函数，初始化节点模型和DOM元素，并设置模型变化的监听器
     * @param {NodeType | NodeModel} model - 节点模型实例，默认为新的BaseNodeModel对象
     */
    constructor(model) {
        // 初始化节点模型
        this.model = model;
        // 创建DOM元素并赋值给实例属性
        this.element = this._createDOM(); 

        // 核心：监听 Model 的变化
        // 监听位置变化事件，当模型位置改变时更新DOM元素的位置
        this.model.addEventListener('change:position', (/** @type {CustomEvent} */ e) => {
            // 从事件详情中获取x和y坐标
            const { x, y } = (e).detail;
            // 使用transform属性更新元素位置
            this.element.style.transform = `translate(${x}px, ${y}px)`;
        });

        // 监听属性变化事件
        this.model.addEventListener('change:property', (/** @type {CustomEvent} */ e) => {
            // 根据属性 key 找到对应的 input 更新其显示值
            this._updateInputDisplay(e.detail.key, e.detail.value);
        });

        // 监听UI变化事件
        this.model.addEventListener('change:select', (/** @type {CustomEvent} */ e) => {
            if (e.detail) {
                this.element.classList.add('selected');
            }else {
                this.element.classList.remove('selected');
            }
        })
    }

    // 创建节点DOM元素
    _createDOM() {
        const element = document.createElement('div');
        element.className = 'node';
        element.style.left = this.model.x + 'px';
        element.style.top = this.model.y + 'px';
        element.style.borderColor = this.model.color;

        element.appendChild(this._createHeader());

        element.appendChild(this._createProperties());

        // element.appendChild(this._createPortHub());

        // 聚焦节点使其可接收键盘事件
        element.tabIndex = 0;

        return element;
    }

    _createHeader() {
        const header = document.createElement('div');
        const innerHTML = `
        <div class="node-header">
            <div class="node-icon" style="color: ${this.model.color}">
                ${this.model.icon || '⚡'}
            </div>
            <div class="node-title">
                <input type="text" 
                       class="node-title-input" 
                       value="${this.model.title}" 
                       placeholder="节点标题"
                       data-node-id="${this.model.id}"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
                <span class="node-id">#${this.model.id}</span>
            </div>
            <div class="node-label">
                <input type="text" 
                       class="node-label-input" 
                       value="${''}" 
                       placeholder="标签（label:游戏内显示的名称）"
                       data-node-id="${this.model.id}"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
            </div>
        </div>
    `;
        header.innerHTML = innerHTML;
        return header;
    }

    // TODO
    _createProperties() {
        const properties = document.createElement('div');
        properties.className = 'node-properties';

        let separateFlag = false;
        this.model.properties.forEach((prop) => {
            if (prop.type === 'hub') {
                if (!separateFlag) {
                    properties.appendChild(this._createSeparator());
                }
            } else {
                separateFlag = false;
            }
            const propView = PropView.renderProp(prop);
            properties.appendChild(propView);

            if (prop.type === 'hub') {
                properties.appendChild(this._createSeparator());
                separateFlag = true;
            }

        })

        if (separateFlag) {
            properties.removeChild(properties.lastChild);
        }

        return properties;
    }

    _createSeparator() {
        const separator = document.createElement('hr');
        separator.className = 'prop-separator';
        return separator;
    }

    _createPortHub() {
        const portHub = document.createElement('div');


        return portHub;        
    }


    _updateInputDisplay(key, value) {
        
    }

    redraw() {
        this.element.remove();
        this.element = this._createDOM();
    }


}
