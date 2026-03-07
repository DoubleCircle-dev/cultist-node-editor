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
