import { NodeModel } from '../models/nodeModels/nodeModel.js';
import { PropView } from '../generators/propViewGenerator.js';
import { IView } from '../types/IView.js';

export class NodeView extends IView {
    /**
     * 构造函数，初始化节点模型和DOM元素，并设置模型变化的监听器
     *
     * @param {NodeModel} model
     */
    constructor(model) {
        super(model);

        // 初始化节点模型
        this.model = model;

        /** @type {listenerMap[]} */
        this.propListeners = [];

        /** @type {Array<{element: Element, event: string, handler: Function}>} */
        this.domListeners = [];

        // 创建DOM元素并赋值给实例属性
        this.element = this._createDOM();

        this._initListeners();
    }

    /**
     * @private
     * @param {Event} evt
     */
    _onPositionChange = (evt) => {
        const e = /** @type {CustomEvent<{ x: number | string; y: number | string }>} */ (evt);
        const { x, y } = e.detail;
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
    };

    /**
     * @private
     * @param {Event} evt
     */
    _onPropertyChange = (evt) => {
        const e = /** @type {CustomEvent<{ key: string; value: any }>} */ (evt);
        this._updateInputDisplay(e.detail.key, e.detail.value);
    };

    /**
     * @private
     * @param {Event} evt
     */
    _onSelectChange = (evt) => {
        const e = /** @type {CustomEvent<{ isSelected: boolean }>} */ (evt);
        if (e.detail.isSelected) {
            this.element.classList.add('selected');
        } else {
            this.element.classList.remove('selected');
        }
    };

    /**
     * @private
     * @param {Event} evt
     */
    _onRectChange = (evt) => {
        const e = /** @type {CustomEvent<{ width: number; height: number }>} */ (evt);
        this.element.style.width = e.detail.width + 'px';
        this.element.style.height = e.detail.height + 'px';
    };

    /** @private */
    _onModeChange = () => {
        this.redraw();
    };

    /**
     * @private
     * @param {MouseEvent} e
     */
    _onMouseDown = (e) => {
        e.stopPropagation();
        this.model.transmit(e);
    };

    /** @private */
    _redraw = () => {
        this.redraw();
    };

    /** @private */
    _initListeners() {
        this.model.addEventListener('change:position', this._onPositionChange);
        this.model.addEventListener('change:property', this._onPropertyChange);
        this.model.addEventListener('change:select', this._onSelectChange);
        this.model.addEventListener('change:rect', this._onRectChange);
        this.model.addEventListener('update:mode', this._onModeChange);
        this.model.addEventListener('redraw', this._redraw);
        this.element.addEventListener('mousedown', this._onMouseDown);
    }

    // 卸载所有监听器
    removeListeners() {
        super.removeListeners();
        if (this.model) {
            this.model.removeEventListener('change:position', this._onPositionChange);
            this.model.removeEventListener('change:property', this._onPropertyChange);
            this.model.removeEventListener('change:select', this._onSelectChange);
            this.model.removeEventListener('change:rect', this._onRectChange);
            this.model.removeEventListener('update:mode', this._onModeChange);
            this.model.removeEventListener('redraw', this._redraw);
        }
        this.element.removeEventListener('mousedown', this._onMouseDown);
        this.propListeners.forEach((l) => {
            if (l.target && l.listener) {
                l.target.removeEventListener(l.type, l.listener);
            }
        });
        this.propListeners = [];

        this.domListeners.forEach(({ element, event, handler }) => {
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        this.domListeners = [];
    }

    // 创建节点DOM元素
    /** @private */
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

    /** @private */
    _createHeader() {
        const header = document.createElement('div');
        header.className = 'node-header';

        const icon = document.createElement('div');
        icon.className = 'node-icon';
        icon.style.color = this.model.color;
        icon.textContent = this.model.icon || '⚡';
        header.appendChild(icon);

        const title = document.createElement('div');
        title.className = 'node-title';
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'node-title-input';
        titleInput.value = this.model.title;
        titleInput.placeholder = '节点标题';

        const titleMousedownHandler = (e) => e.stopPropagation();
        const titleKeydownHandler = (e) => {
            if (e.key === 'Enter') {
                titleInput.blur();
            }
        };
        const titleChangeHandler = (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            this.model.title = target?.value;
        };

        titleInput.addEventListener('mousedown', titleMousedownHandler);
        titleInput.addEventListener('keydown', titleKeydownHandler);
        titleInput.addEventListener('change', titleChangeHandler);

        this.domListeners.push(
            { element: titleInput, event: 'mousedown', handler: titleMousedownHandler },
            { element: titleInput, event: 'keydown', handler: titleKeydownHandler },
            { element: titleInput, event: 'change', handler: titleChangeHandler }
        );

        title.appendChild(titleInput);

        const titleId = document.createElement('div');
        titleId.className = 'node-title-id';
        titleId.textContent = '#' + this.model.id;
        title.appendChild(titleId);

        header.appendChild(title);

        const label = document.createElement('div');
        label.className = 'node-label';
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'node-label-input';
        labelInput.value = this.model.label;
        labelInput.placeholder = '标签（label:游戏内显示的名称）';

        const labelMousedownHandler = (e) => e.stopPropagation();
        const labelKeydownHandler = (e) => {
            if (e.key === 'Enter') {
                labelInput.blur();
            }
        };
        const labelChangeHandler = (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            this.model.label = target?.value;
        };

        labelInput.addEventListener('mousedown', labelMousedownHandler);
        labelInput.addEventListener('keydown', labelKeydownHandler);
        labelInput.addEventListener('change', labelChangeHandler);

        this.domListeners.push(
            { element: labelInput, event: 'mousedown', handler: labelMousedownHandler },
            { element: labelInput, event: 'keydown', handler: labelKeydownHandler },
            { element: labelInput, event: 'change', handler: labelChangeHandler }
        );

        label.appendChild(labelInput);
        header.appendChild(label);

        return header;
    }

    /** @private */
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
        });

        if (separateFlag) {
            if (!properties.lastChild) {
                properties.appendChild(this._createSeparator());
            } else {
                properties.removeChild(properties.lastChild);
            }
        }

        return properties;
    }

    /** @private */
    _createSeparator() {
        const separator = document.createElement('hr');
        separator.className = 'prop-separator';
        return separator;
    }

    /** @private */
    _updateInputDisplay(key, value) {}

    redraw() {
        const world = this.element.parentElement;

        this._removeListeners();
        this.element.remove();
        this.propListeners = [];

        this.element = this._createDOM();
        this._initListeners();
        world?.appendChild(this.element);
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
                this.removeChild(child); // 递归删除子节点
            }
        }

        // 2. 从父节点中移除当前节点（如果存在父节点）
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }

        delete node.__isRemoving;
    }
}
