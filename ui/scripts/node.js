/* eslint-disable no-undef */
// @ts-nocheck

class PropertiesGenerator {
    constructor() {
        this.varStack = [];
    }

    getStackPeek() {
        return this.varStack[this.varStack.length - 1];
    }

    // ================== 配置常量 ==================

    static PROPERTY_TYPES = {
        text: {
            hasPort: true,
            style: ['property-input', 'text'],
            layout: 'full',
            description: '普通文本输入框，支持 placeholder'
        },
        'text-Editor': {
            hasPort: true,
            style: ['property-input', 'text'],
            layout: 'super',
            description: '文本输入框，样式更为宽松，可以输入大量文本'
        },
        number: {
            hasPort: true,
            style: ['property-input'],
            layout: 'dot',
            description: '数字输入框（浮点），step="any"'
        },
        int: {
            hasPort: true,
            style: ['property-input', 'int'],
            layout: 'dot',
            description: '整数输入框，step="1"，显示数字箭头'
        },
        range: {
            hasPort: false,
            style: ['range-wrapper', 'property-input', 'range', 'range-value'],
            layout: 'full',
            description: '滑块控件，包含实时数值显示'
        },
        bool: {
            hasPort: false,
            style: ['bool-radio-group', 'bool-option', 'bool-radio-label'],
            layout: 'half',
            description: '单选按钮（是/否），支持自定义标签'
        },
        checkbox: {
            hasPort: false,
            style: ['checkbox-wrapper', 'property-input', 'checkbox'],
            layout: 'half',
            description: '复选框，自动调整布局'
        },
        select: {
            hasPort: false,
            style: ['property-input', 'select'],
            layout: 'full',
            description: '下拉选择框，选项值从0开始索引'
        },
        'mode-switcher': {
            hasPort: false,
            style: ['property-input', 'select', 'mode-switcher'],
            layout: 'full',
            description: '特殊下拉框，用于切换模式，高亮显示'
        },
        image: {
            hasPort: true,
            style: ['image', 'property-input', 'text'],
            layout: 'dot',
            description: '图片路径输入，附带浏览按钮'
        },
        'image-container': {
            hasPort: false,
            style: ['image-container'],
            layout: 'super',
            description: '图片容器，用于显示图片'
        },
        port: {
            hasPort: true,
            style: ['port-item', 'port-dot', 'port-label'],
            layout: 'full',
            description: '单个端口项，支持方向、布局、多连接样式'
        },
        selectPort: {
            hasPort: true,
            style: ['port-item', 'port-dot', 'port-label'],
            layout: 'full',
            description: '同 port，仅为类型别名'
        },
        'port-hub': {
            hasPort: false,
            style: ['property-port-hub', 'ports-container', 'port-column'],
            layout: 'super',
            description: '端口集容器，自动将输入/输出端口分列显示'
        },
        table: {
            hasPort: true,
            style: ['property-table'],
            layout: 'super',
            description: '表格控件，支持自定义列'
        },
        set: {
            hasPort: true,
            style: ['property-set'],
            layout: 'super',
            description: '属性集容器'
        }
    };

    // 补充样式类名常量（与 Node 类中使用的保持一致）
    static CLASSES = {
        PROPERTY: 'property-item',
        LABEL: 'property-label',
        HELP: 'property-help',
        INPUT: 'property-input'
    };

    // ================== 主入口 ==================
    createProperty(prop, propId, uid) {
        const key = prop.label || propId;
        const value = prop.default !== undefined ? prop.default : '';
        const propType = PropertiesGenerator.PROPERTY_TYPES[prop.type];

        if (!propType) {
            console.error(`未知的属性类型：${prop.type}`);
            return;
        }

        const layout = propType.layout || 'full';
        const hasPort = propType.hasPort;

        this.varStack.push({ uid, prop, key, value, layout, hasPort});

        let result = null;
        switch (prop.type) {
            case 'port':
            case 'selectPort':
                result = this._createPortItem();
                break;
            case 'port-hub':
                result = this._createPortHub();
                break;
            default:
                result = this._createStandardProperty();
                break;
        }

        this.varStack.pop();
        return result;
    }

    // ================== 端口项创建 ==================
    _createPortItem() {
        if (!this.getStackPeek()) return null;
        const {uid, prop, key, value, layout } = this.getStackPeek();
        const direction = prop.direction || 'in';

        const portItem = document.createElement('div');
        portItem.classList.add('port-item');

        // 如果有描述，整个端口区域显示帮助提示
        if (prop.description) {
            portItem.title = prop.description;
        } else if (layout === 'dot') {
            // dot 模式且无描述时，用标签作为提示
            portItem.title = prop.label;
        }

        portItem.dataset.nodeId = uid;
        portItem.dataset.portId = key;
        portItem.dataset.requireType = prop.requireType || 'any';
        portItem.dataset.portDirect = direction;
        portItem.dataset.portConnected = false;
        portItem.dataset.portMulti = prop.multiConnect !== false;

        // 创建端口圆点
        const dot = this._createPortDot(prop.multiConnect !== false, portItem.dataset.requireType);

        // 创建内容区域（标签 + 控件）
        const contentArea = document.createElement('div');
        contentArea.className = 'port-label';

        if (layout !== 'dot') {
            // 标签文本
            const labelSpan = document.createElement('span');
            labelSpan.textContent = `${prop.label}`;
            contentArea.appendChild(labelSpan);

            // 输入控件（如果类型需要控件）
            if (prop.type !== 'port' && prop.type !== 'selectPort') {
                const control = this._createControl(); // 不再传参
                if (control) contentArea.appendChild(control);
            }
        } else {
            portItem.append(dot);
            portItem.classList.add('port-dot-only');
            portItem.dataset.portDirect = 'in';
            return portItem;
        }

        // 根据方向组装
        if (direction === 'out') {
            portItem.appendChild(contentArea);
            portItem.appendChild(dot);
            // portItem.classList.add('port-outputs');
        } else {
            portItem.appendChild(dot);
            portItem.appendChild(contentArea);
            // portItem.classList.add('port-inputs');
        }

        

        return portItem;
    }

    _createPortDot(multi, requireType) {
        const dot = document.createElement('div');
        dot.className = 'port-dot';
        dot.classList.add(multi ? 'multi' : 'single');

        // 设置端口颜色（安全获取全局变量）
        let color = 'var(--node-blank)';
        if (typeof nodeColorVars !== 'undefined' && nodeColorVars[requireType]) {
            color = nodeColorVars[requireType];
        }
        // dot.style.setProperty('--port-color', color);
        // 同时设置背景色或边框色（根据 single/multi 不同样式）
        if (multi) {
            dot.style.backgroundColor = `${color}`;
        } else {
            dot.style.borderBottomColor = `${color}`;
        }

        return dot;
    }

    // ================== 端口集创建 ==================
    _createPortHub() {
        const stack = this.getStackPeek();
        if (!stack) return null;
        const { prop, key, uid } = stack;

        const portHub = document.createElement('div');
        portHub.className = 'node-port-hub';

        const portsContainer = document.createElement('div');
        portsContainer.className = 'ports-container';

        // 输入端口列
        if (prop.inputs && Array.isArray(prop.inputs) && prop.inputs.length > 0) {
            const inputColumn = document.createElement('div');
            inputColumn.className = 'port-column port-inputs';

            const title = document.createElement('div');
            title.className = 'port-column-title';
            title.textContent = prop.inputsLabel || '输入端口';
            inputColumn.appendChild(title);


            prop.inputs.forEach((inputPort, idx) => {
                // 为每个输入端口构建临时属性并压栈
                const tempProp = {
                    ...inputPort,
                    label: inputPort.label || `${idx}`,
                    type: inputPort.type || 'port',
                    direction: 'in'
                };
                this.varStack.push({
                    uid,
                    prop: tempProp,
                    key: `${key}-input-${idx}`,
                    value: '',
                    layout: 'full',
                    hasPort: false,
                });
                const portItem = this._createPortItem();
                if (portItem) inputColumn.appendChild(portItem);
                this.varStack.pop();
            });

            portsContainer.appendChild(inputColumn);
        }

        // 输出端口列
        if (prop.outputs && Array.isArray(prop.outputs) && prop.outputs.length > 0) {
            const outputColumn = document.createElement('div');
            outputColumn.className = 'port-column port-outputs';

            const title = document.createElement('div');
            title.className = 'port-column-title';
            title.textContent = prop.outputsLabel || '输出端口';
            outputColumn.appendChild(title);

            prop.outputs.forEach((outputPort, idx) => {
                const tempProp = {
                    ...outputPort,
                    label: outputPort.label || `输出${idx}`,
                    type: outputPort.type || 'port',
                    direction: 'out'
                };
                this.varStack.push({
                    uid,
                    prop: tempProp,
                    key: `${key}-output-${idx}`,
                    value: '',
                    layout: 'full',
                    hasPort: false,
                });
                const portItem = this._createPortItem();
                if (portItem) outputColumn.appendChild(portItem);
                this.varStack.pop();
            });

            portsContainer.appendChild(outputColumn);
        }

        if (portsContainer.children.length === 0) {
            return null; // 没有端口时返回空
        }

        portHub.appendChild(portsContainer);

        portHub.dataset.propId = key;
        return portHub;
    }

    // ================== 标准属性项创建 ==================
    _createStandardProperty() {
        const stack = this.getStackPeek();
        if (!stack) return null;
        const {uid, prop, key, value, layout, hasPort } = stack;
        const C = PropertiesGenerator.CLASSES;

        const container = document.createElement('div');
        container.className = C.PROPERTY;

        // 标签
        const label = document.createElement('div');
        label.className = C.LABEL;
        label.appendChild(document.createTextNode(`${prop.label}:`));

        if (prop.description) {
            const help = document.createElement('span');
            help.className = C.HELP;
            help.title = prop.description;
            help.textContent = '?';
            label.appendChild(help);
        }
        // 控件（不再传参）
        const control = this._createControl();
        container.appendChild(label);
        if (hasPort) {
            const tempProp = {
                label: '',
                type: 'port',
                multiConnect: false,
                direction: 'in',
                requireType: prop.type || 'text',
            };
            this.varStack.push({
                uid,
                prop: tempProp,
                key: `${key}-port`,
                value: '',
                layout: 'dot',
                hasPort: false,
            });

            const portItem = this._createPortItem();
            if (portItem) container.appendChild(portItem);
            this.varStack.pop();
        }

        if (control) container.appendChild(control);

        container.dataset.propId = key;
        return container;
    }

    // ================== 统一控件工厂 ==================
    _createControl() {
        const stack = this.getStackPeek();
        if (!stack) return null;
        const { prop } = stack;
        const type = prop.type;
        const strategies = {
            text: () => this._createBasicInput(),
            'text-Editor': () => this._createBasicInput(), // 可扩展为 textarea
            number: () => this._createBasicInput(),
            int: () => {
                const input = this._createBasicInput();
                input.classList.add('int');
                input.step = '1';
                return input;
            },
            range: () => this._createRangeInput(),
            bool: () => this._createBoolInput(),
            checkbox: () => this._createCheckboxInput(),
            select: () => this._createSelectInput(),
            'mode-switcher': () => this._createSelectInput(),
            image: () => this._createImageInput(),
            // 其他类型可继续扩展
        };

        const handler = strategies[type];
        return handler ? handler() : this._createBasicInput(); // 默认回退
    }

    // ================== 具体控件实现 ==================
    _createBasicInput() {
        const stack = this.getStackPeek();
        if (!stack) return null;
        const { prop, key, value } = stack;
        // 根据 prop.type 决定 input 的 type 属性
        let inputType = 'text';
        if (prop.type === 'number' || prop.type === 'int') {
            inputType = 'number';
        }
        const input = document.createElement('input');
        input.type = inputType;
        input.className = PropertiesGenerator.CLASSES.INPUT;
        input.value = value;
        if (prop.placeholder) input.placeholder = prop.placeholder;
        this._setCommonAttributes(input);
        input.addEventListener('change', (e) => this._updateProperty(key, e.target.value));
        // 对于数字类型，确保数值类型
        if (inputType === 'number') {
            input.addEventListener('input', (e) => {
                // 可以实时更新，但 change 已足够
            });
        }
        return input;
    }

    _createRangeInput() {
        const stack = this.getStackPeek();
        if (!stack) return null;
        const { prop, key, value } = stack;

        const wrapper = document.createElement('div');
        wrapper.className = 'range-wrapper';

        const input = document.createElement('input');
        input.type = 'range';
        input.className = `${PropertiesGenerator.CLASSES.INPUT} range`;
        input.min = prop.min || 0;
        input.max = prop.max || 100;
        input.value = value;
        this._setCommonAttributes(input);

        const valueSpan = document.createElement('span');
        valueSpan.className = 'range-value';
        valueSpan.textContent = value;

        input.addEventListener('input', (e) => {
            valueSpan.textContent = e.target.value;
            this._updateProperty(key, parseFloat(e.target.value));
        });

        wrapper.appendChild(input);
        wrapper.appendChild(valueSpan);
        return wrapper;
    }

    _createBoolInput() {
        const stack = this.getStackPeek();
        if (!stack) return null;
        const { prop, key, value, uid } = stack;

        const group = document.createElement('div');
        group.className = 'bool-radio-group';
        const groupId = `bool-${uid}-${key}`;

        const createRadio = (boolVal, labelText) => {
            const label = document.createElement('label');
            label.className = 'bool-option';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = groupId;
            radio.value = String(boolVal);
            radio.checked = (value === boolVal);
            this._setCommonAttributes(radio);
            radio.addEventListener('change', () => this._updateProperty(key, boolVal));

            const span = document.createElement('span');
            span.className = 'bool-radio-label';
            span.textContent = labelText;

            label.appendChild(radio);
            label.appendChild(span);
            return label;
        };

        group.appendChild(createRadio(true, prop.labels?.true || '是'));
        group.appendChild(createRadio(false, prop.labels?.false || '否'));
        return group;
    }

    _createCheckboxInput() {
        const stack = this.getStackPeek();
        if (!stack) return null;
        const { prop, key, value } = stack;

        const wrapper = document.createElement('div');
        wrapper.className = 'checkbox-wrapper';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = `${PropertiesGenerator.CLASSES.INPUT} checkbox`;
        checkbox.checked = !!value;
        this._setCommonAttributes(checkbox);
        checkbox.addEventListener('change', (e) => this._updateProperty(key, e.target.checked));

        wrapper.appendChild(checkbox);
        return wrapper;
    }

    _createSelectInput() {
        const stack = this.getStackPeek();
        if (!stack) return null;
        const { prop, key, value } = stack;
        const isModeSwitcher = prop.isModeSwitcher;

        if (!Array.isArray(prop.options)) {
            console.warn('select 类型需要 options 数组');
            return document.createElement('div');
        }

        const select = document.createElement('select');
        select.className = `${PropertiesGenerator.CLASSES.INPUT} select`;
        if (isModeSwitcher) {
            select.classList.add('mode-switcher');
        }
        this._setCommonAttributes(select);

        prop.options.forEach((opt, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = opt;
            if (isModeSwitcher) {
                if (index === (prop.default || 0)) {
                    option.selected = true;
                }
            } else {
                if (index === value) option.selected = true;
            }
            select.appendChild(option);
        });

        return select;
    }

    _createImageInput() {
        const stack = this.getStackPeek();
        if (!stack) return null;
        const { prop, key, value, uid } = stack;

        const wrapper = document.createElement('div');
        wrapper.className = 'image';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = `${PropertiesGenerator.CLASSES.INPUT} text`;
        input.value = value;
        input.placeholder = '图片文件名';
        this._setCommonAttributes(input);
        input.addEventListener('change', (e) => this._updateProperty(key, e.target.value));

        const browseBtn = document.createElement('button');
        browseBtn.className = 'btn btn-small browse-btn';
        browseBtn.textContent = '浏览';
        // 捕获当前 uid 和 key 供回调使用
        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.browseImage === 'function') {
                window.browseImage(uid, key, input);
            }
        });

        wrapper.appendChild(input);
        wrapper.appendChild(browseBtn);
        return wrapper;
    }

    // ================== 通用辅助方法 ==================
    _setCommonAttributes(el) {
        const stack = this.getStackPeek();
        if (!stack) return;
        const { uid, key } = stack;
        el.dataset.nodeUid = uid;
        el.dataset.propKey = key;
        el.addEventListener('click', (e) => e.stopPropagation());
    }

}

class Connection {
    constructor(id, fromNodeId, fromPortId, toNodeId, toPortId) {
        this.id = id;
        this.fromNodeId = fromNodeId;
        this.fromPortId = fromPortId;
        this.toNodeId = toNodeId;
        this.toPortId = toPortId;
        this.line = null;
    }

    equals(other) {
        if (this === other) return true;
        if (!(other instanceof Connection)) return false;

        return this.fromNodeId === other.fromNodeId &&
            this.fromPortId === other.fromPortId &&
            this.toNodeId === other.toNodeId &&
            this.toPortId === other.toPortId;
    }

    strictEquals(other) {
        return this.id === other.id && this.equals(other);
    }
}


/**
 * 节点类(Node)
 * 用于表示图形界面中的基本元素节点
 * 包含节点的基本属性如位置、尺寸、端口等信息
 */
class Node {

    static PROPERTY_GENERATOR = new PropertiesGenerator();

    constructor(uid, type, x, y, config) {
        this.uid = uid;
        this.type = type;
        this.config = config;
        this.x = x;
        this.y = y;

        if (!config) {
            this.element = this._createBlankNodeElement();
            return;
        }

        this.data = {};

        this.connections = {
            inputs: [],
            outputs: []
        };

        this.currentMode = null; // 当前模式
        this.activeExProperties = new Map(); // 当前激活的扩展属性

        // 存储动态属性状态
        this.dynamicProperties = new Map();
        this.propertyValues = {};

        // 检查是否有 exProperties[999] 并初始化添加按钮
        this.hasExProperties999 = false;
        if (this.exProperties) {
            if (this.exProperties[999]) {
                this.hasExProperties999 = true;
            }
        }

        // 初始化数据
        this._initializeData();

        this.element = this._createNodeElement();

        this.ports = new Map();
        this._initPorts();

        // 隐藏占位符
        const placeholder = document.getElementById('placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

    }

    // 初始化节点数据
    _initializeData() {
        // 初始化固定属性
        if (this.config.fixedProperties) {
            this.config.fixedProperties.forEach((prop, index) => {

                if (prop.modeSwitcher) {
                    this.currentMode = prop.default;
                }
                const key = prop.label || `fixed-${index}`;
                this.data[key] = prop.default !== undefined ? prop.default : '';
                this.propertyValues[key] = prop.default !== undefined ? prop.default : '';
            });
        }

        // 初始化常规属性
        if (this.config.properties) {
            this.config.properties.forEach((prop, index) => {
                const key = prop.label || `prop-${index}`;
                this.data[key] = prop.default !== undefined ? prop.default : '';
                this.propertyValues[key] = prop.default !== undefined ? prop.default : '';
            });
        }

        // 初始化 activeExProperties
        this.activeExProperties.clear();

        // 检查当前模式是否有对应的exProperties
        if (this.config.exProperties && this.config.exProperties[this.currentMode]) {
            const modeExProperties = this.config.exProperties[this.currentMode];
            if (modeExProperties && Array.isArray(modeExProperties)) {
                modeExProperties.forEach((prop, index) => {
                    const key = `ex-${this.currentMode}-${index}`;
                    this.activeExProperties.set(key, prop);
                    // 同时保存到 data 中
                    this.data[key] = prop.default !== undefined ? prop.default : '';
                });
            }
        }

        // 初始化标题
        this.data.title = this.config.title;
    }

    _initPorts() {
        Array.from(this.element.getElementsByClassName('port-item')).forEach(port => {
            const portId = port.dataset.portId;
            this.ports.set(portId, port);
        })
    }

    _createBlankNodeElement() {
        const element = document.createElement('div');
        element.className = 'node';
        element.uid = this.uid;
        element.dataset.nodeType = this.type;
        element.style.left = this.x + 'px';
        element.style.top = this.y + 'px';
        element.style.borderColor = nodeColorVars['blank'];
        element.locked = false;
        this.config = window.nodeTypes['blank'];

        element.appendChild(this._createHeader());
        // 构建节点HTML结构
        // let html = this._createHeaderHTML();
        // html += '<div class="node-content">';
        // html += this._createContentHTML();
        // html += '</div>';
        // html += this._createPropertiesHTML();

        // element.innerHTML = html;

        element.appendChild(this._createProperties());


        element.tabIndex = 0;

        return element;
    }

    // 创建节点DOM元素
    _createNodeElement() {
        const element = document.createElement('div');
        element.className = 'node';
        element.uid = this.uid;
        element.dataset.nodeType = this.type;
        element.style.left = this.x + 'px';
        element.style.top = this.y + 'px';
        element.style.borderColor = this.config.color;
        element.locked = false;

        element.appendChild(this._createHeader());

        element.appendChild(this._createProperties());

        // 创建端口区域
        element.appendChild(this._createPortHub());

        // 聚焦节点使其可接收键盘事件
        element.tabIndex = 0;

        return element;
    }

    // 创建头部HTML
    _createHeader() {
        const innerHTML = `
        <div class="node-header">
            <div class="node-icon" style="color: ${this.config.color}">
                ${this.config.icon || '⚡'}
            </div>
            <div class="node-title">
                <input type="text" 
                       class="node-title-input" 
                       value="${this.config.title}" 
                       placeholder="节点标题"
                       data-node-uid="${this.uid}"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
                <span class="node-uid">#${this.uid}</span>
            </div>
            <div class="node-label">
                <input type="text" 
                       class="node-label-input" 
                       value="${''}" 
                       placeholder="标签（label:游戏内显示的名称）"
                       data-node-uid="${this.uid}"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
            </div>
        </div>
    `;
        const header = document.createElement('div');
        header.innerHTML = innerHTML;
        return header;
    }

    // 创建内容HTML
    _createContentHTML() {
        let content = this.config.content || '';
        // 替换内容中的变量
        return `<div class="node-info">${content}</div>`;
    }

    // 创建属性
    _createProperties() {
        const properties = document.createElement('div');
        properties.className = 'properties-container';

        // 固定属性
        if (this.config.fixedProperties && this.config.fixedProperties.length > 0) {
            const fixedProperties = document.createElement('div');
            fixedProperties.className = 'properties-container';
            this.config.fixedProperties.forEach((prop, index) => {
                fixedProperties.appendChild(Node.PROPERTY_GENERATOR.createProperty(prop, `fixed-${index}`, this.uid));
            });
            properties.appendChild(fixedProperties);
        }

        // 常规属性
        if (this.config.properties && this.config.properties.length > 0) {
            const regularProperties = document.createElement('div');
            regularProperties.className = 'properties-container';
            this.config.properties.forEach((prop, index) => {
                regularProperties.appendChild(Node.PROPERTY_GENERATOR.createProperty(prop, `prop-${index}`, this.uid));
            });
            properties.appendChild(regularProperties);
        }

        // 扩展属性容器
        const exProperties = document.createElement('div');
        exProperties.className = 'properties-container extended-properties-container';

        if (this.activeExProperties && this.activeExProperties.size > 0) {
            this.activeExProperties.forEach((prop, key) => {
                exProperties.appendChild(Node.PROPERTY_GENERATOR.createProperty(prop, key, this.uid));
            })
        }
        // 检查是否有编号999的exProperties
        if (this.hasExProperties999) {
            // 添加"+"按钮
            const addButton = document.createElement('button');
            addButton.className = 'add-ex-property-btn';
            // 添加点击事件
            addButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showExPropertiesMenu(e);
            });

            exProperties.appendChild(addButton);
        }

        properties.appendChild(exProperties);


        return properties;
    }

    // 在Node类中添加
    switchNodeMode(propKey, newMode) {

        if (this.connections.length > 0) {
            alert('节点有连接，无法切换模式');
            return;
        }

        // 保存当前模式的属性值
        if (this.currentMode !== null) {
            this._saveModeProperties(this.currentMode);
        }

        // 更新当前模式
        this.currentMode = parseInt(newMode);

        // 加载新模式的属性
        this._loadModeProperties(this.currentMode);

        // 更新UI
        this._updateModePropertiesUI();

        this._initPorts();
    }

    // 保存当前模式的属性值
    _saveModeProperties(mode) {
        const exProps = this.config.exProperties[mode];
        if (!exProps) return;

        exProps.forEach((prop, index) => {
            const key = `ex-${mode}-${index}`;
            if (this.activeExProperties.has(key)) {
                this.data[key] = this.activeExProperties.get(key).value;
            }
        });
    }

    // 加载新模式的属性
    _loadModeProperties(mode) {
        // 清除当前激活的扩展属性
        this.activeExProperties.clear();

        // 加载新模式的属性
        const exProps = this.config.exProperties[mode];
        if (!exProps) return;

        exProps.forEach((prop, index) => {
            const key = `ex-${mode}-${index}`;
            this.activeExProperties.set(key, prop);
        });
    }

    // 更新模式属性UI
    _updateModePropertiesUI() {
        const extendedPropsContainer = this.element.querySelector('.extended-properties-container ');
        if (!extendedPropsContainer) return;

        // 清空容器
        extendedPropsContainer.innerHTML = '';

        // 添加当前模式的属性
        this.activeExProperties.forEach((prop, key) => {
            extendedPropsContainer.appendChild(
                Node.PROPERTY_GENERATOR.createProperty(prop, key, this.uid)
            );
        });

        this._updateModePortUI();

    }

    _updateModePortUI() {
        const selectPorts = this.element.querySelectorAll('.select-port');
        if (!selectPorts) return;

        console.log('selectPorts', selectPorts);

        selectPorts.forEach((select, index) => {
            select.querySelector('.port-label').textContent = select.label[this.currentMode];
        })

    }

    // 显示exProperties菜单
    _showExPropertiesMenu(event) {
        // 创建菜单
        const menu = document.createElement('div');
        menu.className = 'ex-properties-menu';

        // 添加菜单项
        const exProps999 = this.config.exProperties[999];
        if (exProps999 && Array.isArray(exProps999)) {
            exProps999.forEach((prop, index) => {
                const menuItem = document.createElement('div');
                menuItem.className = 'ex-properties-menu-item';
                menuItem.textContent = prop.label || `属性 ${index}`;
                menuItem.style.padding = '8px 15px';
                menuItem.style.cursor = 'pointer';

                // 添加悬停效果
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.backgroundColor = '#f5f5f5';
                });
                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.backgroundColor = 'transparent';
                });

                // 添加点击事件
                menuItem.addEventListener('click', () => {
                    this.addExProperty(prop, index);
                    document.body.removeChild(menu);
                });

                menu.appendChild(menuItem);
            });
        }

        // 添加到文档
        document.body.appendChild(menu);

        // 点击其他地方关闭菜单
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                document.body.removeChild(menu);
                document.removeEventListener('click', closeMenu);
            }
        };

        // 延迟添加点击事件，避免立即触发
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    // 添加扩展属性
    _checkBitaddExProperty(prop, index) {
        // 生成属性键
        const key = `ex-custom-${Date.now()}-${index}`;

        // 添加到激活的扩展属性
        this.activeExProperties.set(key, {
            prop: prop,
            value: prop.default !== undefined ? prop.default : ''
        });

        // 更新UI
        this._updateModePropertiesUI();

        // 通知状态更新
        if (this.updateStatus) {
            this.updateStatus(`添加属性: ${prop.label}`);
        }
    }

    // 创建port hub区域存放连接端口
    _createPortHub() {

        const prop = {
            label: 'portHub', type: 'port-hub',
            inputs: this.config.inputs,
            outputs: this.config.outputs
        }

        return Node.PROPERTY_GENERATOR.createProperty(prop, 'fixed-port-hub', this.uid)
    }

    // 锁定节点
    lockNode() {
        this.element.locked = true;
    }

    // 解锁节点
    unlockNode() {
        this.element.locked = false;
    }

    // 获取端口
    getPort(portId) {
        const port = this.ports.get(portId)
        if (!port) {
            throw new Error(`节点 ${this.uid} 没有端口 ${portId}，请检查端口`, {
                cause: this.ports
            });
        }
        return port;
    }

    // 获取连接
    getConnections(portId, portDirect) {
        switch (portDirect) {
            case 'in':
                return this.connections.inputs.get(portId) || [];
            case 'out':
                return this.connections.outputs.get(portId) || [];
            default:
                console.error(`未知的端口类型: ${portType}`);
                return [];
        }

    }

    getAllConnections() {
        return [...this.connections.inputs.values(),
        ...this.connections.outputs.values()].flatMap(connections => connections);
    }

    _getConnectionsSet(portDirect) {
        switch (portDirect) {
            case 'in':
                return this.connections.inputs;
            case 'out':
                return this.connections.outputs;
            default:
                console.error(`未知的端口类型: ${portType}`);
        }
    }

    // 添加连接
    addConnection(connection) {
        if (parseInt(connection.toNodeId) === parseInt(this.uid)) {
            this.connections.inputs.push(connection);
            return true;
        }

        if (parseInt(connection.fromNodeId) === parseInt(this.uid)) {
            this.connections.outputs.push(connection);
            return true;
        }

        console.error(`连接 ${connection.id} 与本节点 ${this.uid} 无关`);
        return false
    }

    scale(scale) {
        this.element.style.transform = `scale(${scale})`;
        // console.log(`节点 ${this.uid} 缩放比例: ${scale}`);
    }

}




window.Node = Node;
