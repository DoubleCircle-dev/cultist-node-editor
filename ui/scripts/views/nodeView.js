import { NodeModel } from '../models/nodeModels/nodeModel.js';
import { PropView } from './propView.js';

export class NodeView {
    /**
     * 构造函数，初始化节点模型和DOM元素，并设置模型变化的监听器
     * @param {NodeModel} model
     */
    constructor(model) {
        this.propListeners = [];

        // 初始化节点模型
        this.model = model;
        // 创建DOM元素并赋值给实例属性
        this.element = this._createDOM();


        this._initListeners();
    }

    // 提取回调
    _onPositionChange = (e) => {
        const { x, y } = e.detail;
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
    };

    _onPropertyChange = (e) => {
        this._updateInputDisplay(e.detail.key, e.detail.value);
    };

    _onSelectChange = (e) => {
        if (e.detail.isSelected) {
            this.element.classList.add('selected');
        } else {
            this.element.classList.remove('selected');
        }
    };

    _onRectChange = (e) => {
        this.element.style.width = e.detail.width + 'px';
        this.element.style.height = e.detail.height + 'px';
    };

    _onModeChange = () => {
        this.redraw();
    };

    _onMouseDown = (e) => {
        e.stopPropagation();
        this.model.handleMouseDown(e);
    };

    _onNodeDelete = (e) => {
        if (e.key === 'Delete') {
            this.model.emit('delete', { target: this.model.id });
        }
    };

    _initListeners() {
        this.model.addEventListener('change:position', this._onPositionChange);
        this.model.addEventListener('change:property', this._onPropertyChange);
        this.model.addEventListener('change:select', this._onSelectChange);
        this.model.addEventListener('change:rect', this._onRectChange);
        this.model.addEventListener('changeMode:node', this._onModeChange);
        this.element.addEventListener('mousedown', this._onMouseDown);
        this.element.addEventListener('keydown', this._onNodeDelete);
    }

    // 卸载所有监听器
    _removeListeners() {
        this.element.removeEventListener('mousedown', this._onMouseDown);
        this.element.removeEventListener('keydown', this._onNodeDelete)
        this.propListeners.forEach((l) => {
            l.target.removeEventListener(l.type, l.listener);
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
                       onmousedown="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
                <span class="node-id">#${this.model.id}</span>
            </div>
            <div class="node-label">
                <input type="text" 
                       class="node-label-input" 
                       value="${''}" 
                       placeholder="标签（label:游戏内显示的名称）"
                       data-node-id="${this.model.id}"
                       onmousedown="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
            </div>
        </div>
    `;
        header.innerHTML = innerHTML;
        return header;
    }

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
            this.propListeners.push(...propView.listeners);
            properties.appendChild(propView.element);

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

    _updateInputDisplay(key, value) {

    }

    redraw() {
        const world = this.element.parentElement;
        this.element.remove();
        this._removeListeners();
        this.element = this._createDOM();
        this._initListeners();
        world.appendChild(this.element);
    }

    onMounted() {
        if (!this.model.x || !this.model.y) {
            this.model.setPosition(this.element.offsetLeft, this.element.offsetTop);
        }

        // View 测量物理尺寸，同步给 Model
        // 这样后续的 fitView 就能直接读取 model.width 而不触发重排
        this.model.width = this.element.offsetWidth;
        this.model.height = this.element.offsetHeight;
    }

    removeChild(node) {
        // 防止重复处理（可选，用于防御循环引用）
        if (node.__isRemoving) return;
        node.__isRemoving = true;

        // 1. 如果是元素节点，先递归删除所有子节点
        if (node.nodeType === Node.ELEMENT_NODE) {
            // 复制一份快照，避免遍历时动态修改 childNodes
            const children = Array.from(node.childNodes);
            for (const child of children) {
                
                this.removeChild(child);  // 递归删除子节点

            }
        }

        // 2. 从父节点中移除当前节点（如果存在父节点）
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }

        delete node.__isRemoving;

    }

    destroy() {

        this.model = null;
        this._removeListeners();
        this.removeChild(this.element);



        this.element.remove();
        this.element.innerHTML = '';
        // 创建DOM元素并赋值给实例属性
        this.element = null;

    }

}
