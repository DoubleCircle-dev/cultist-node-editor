import { BaseProp } from '../models/propModels/baseProp.js';
import { NumericProp } from '../models/propModels/numericProp.js';
import { OptionsProp } from '../models/propModels/optionsProp.js';
import { PortProp } from '../models/propModels/portProp.js';
import { ViewProp } from '../models/propModels/viewProp.js';
import { HubProp } from '../models/propModels/hubProp.js';
import { BaseNodeModel } from '../models/nodeModels/baseNodeModel.js';

export class PropGenerator {
    /**
     * @param {any} id
     * @param {any} type
     * @param {any} propConfig
     * @param {WeakRef<BaseNodeModel>} [node=null] Default is `null`
     * @returns {BaseProp | PortProp}
     */
    static createProp(id, type, propConfig, node = null) {
        let propClass = null;

        // 根据类型预处理参数
        let args;
        switch (type) {
            case 'hub':
                const hubProps = [];
                propConfig.properties.forEach((/** @type {PropConfig} */ p, /** @type {number} */ index) => {
                    hubProps.push(PropGenerator.createProp(`${id}_hub:${propConfig.label}-${index}`, p.type, p, node));
                });
                args = [id, propConfig.label, hubProps, propConfig.layout];
                propClass = HubProp;
                break;
            case 'range':
                args = [id, propConfig.label, 'slider', propConfig.default, propConfig.min, propConfig.max];
                propClass = NumericProp;
                break;
            case 'number':
            case 'integer':
            case 'slider':
                args = [id, propConfig.label, propConfig.type, propConfig.default, propConfig.min, propConfig.max];
                propClass = NumericProp;
                break;
            case 'text':
            case 'image-path':
                args = [
                    id,
                    propConfig.label,
                    propConfig.type,
                    propConfig.default,
                    {
                        placeholder: propConfig.placeholder,
                        inputPort: { id: `${id}-input`, portType: 'implicit', dataType: 'text' },
                    },
                ];
                propClass = PortProp;
                break;
            case 'table':
            case 'table-preview':
                args = [id, propConfig.label, 'table-preview', propConfig.default, propConfig.columns, propConfig.rows];
                propClass = ViewProp;
                break;
            case 'image-preview':
                args = [id, propConfig.label, 'image-preview', propConfig.default];
                propClass = ViewProp;
                break;
            case 'textarea-preview':
                args = [id, propConfig.label, 'textarea-preview', propConfig.default];
                propClass = ViewProp;
                break;
            case 'image-icon':
                args = [id, propConfig.label, 'image-icon', propConfig.default];
                propClass = ViewProp;
                break;
            case 'bool':
                args = [id, propConfig.label, 'bool', propConfig.default];
                propClass = BaseProp;
                break;
            case 'checkbox':
                args = [id, propConfig.label, 'checkbox', propConfig.default];
                propClass = BaseProp;
                break;
            case 'select':
                args = [id, propConfig.label, 'select', propConfig.default, propConfig.options, propConfig.isModeSwitcher];
                propClass = OptionsProp;
                break;
            case 'port':
                {
                    const portConfig = {
                        inputPort: {},
                        outputPort: {},
                    };

                    const maxLinks = propConfig.multiConnect ? propConfig.connectNum || Infinity : 1;

                    if (!propConfig.direction || propConfig.direction === 'input') {
                        portConfig.inputPort = {
                            id: `${id}-input`,
                            maxLinks: maxLinks,
                            dataType: propConfig.requireType || 'any',
                        };
                    } else if (propConfig.direction === 'output') {
                        portConfig.outputPort = {
                            id: `${id}-output`,
                            maxLinks: maxLinks,
                            dataType: propConfig.returnType || 'any',
                        };
                    } else if (propConfig.direction === 'both') {
                        portConfig.inputPort = {
                            id: `${id}-input`,
                            maxLinks: maxLinks,
                            dataType: propConfig.requireType || 'any',
                        };
                        portConfig.outputPort = {
                            id: `${id}-output`,
                            maxLinks: maxLinks,
                            dataType: propConfig.returnType || 'any',
                        };
                    }
                    args = [id, propConfig.label, propConfig.type, propConfig.default, portConfig];
                    propClass = PortProp;
                }
                break;
            default:
                args = [id, propConfig.label, propConfig.type, propConfig.default];
                propClass = BaseProp;
                break;
        }

        if (!propClass) {
            console.error(`未知属性类型: ${type}`);
            return new BaseProp(null, null, null, null);
        }

        const result = Reflect.construct(propClass, args);

        if (result instanceof BaseProp) {
            result.description = propConfig.description;
            if (!(result instanceof HubProp)) {
                result.parentNode = node;
            }
        } else {
            console.error('注册属性失败', propClass, args);
            return new BaseProp(null, null, null, null);
        }

        return result;
    }
}

export class PropRenderer {
    /**
     * 渲染属性
     *
     * @param {BaseProp} prop
     * @returns {{
     *     element: HTMLElement;
     *     listeners: listenerMap[];
     * }}
     */
    static render(prop) {
        if (prop instanceof HubProp) {
            console.warn('HubProp 不应被此函数渲染, 会导致listener丢失');
            return { element: PropRenderer.createHub(prop.type), listeners: [] };
        }

        const result = this.RenderMap[prop.type](prop);
        if (!result) {
            console.error(`未知属性类型: ${prop.type}`);
            return { element: this.createErrorDom(`未知属性类型: ${prop.type}`), listeners: [] };
        }

        if (!result.element) {
            console.error(`属性渲染出错: ${prop.type}`);
            return { element: this.createErrorDom(`属性渲染出错: ${prop.type}`), listeners: [] };
        }

        return result;
    }

    /**
     * 渲染映射表
     *
     * @type {Record<string, (prop: any) => { element: HTMLElement; listeners: listenerMap[] }>}
     */
    static RenderMap = {
        text: (p) => this.createInput('text', p, { placeholder: p.placeholder || p.label }),
        integer: (p) => this.createInput('number', p, { placeholder: p.placeholder || p.label }),
        number: (p) => this.createNumber('number', p),
        range: (p) =>
            this.createInput('range', p, {
                step: String(p.config?.step ?? 1),
            }),
        slider: (p) =>
            this.createInput('range', p, {
                step: String(p.config?.step ?? 1),
            }),
        radio: (p) => this.createRadio(p),
        bool: (p) => this.createRadio(p, true),
        checkbox: (p) => this.createCheckbox(p),
        select: (p) => this.createSelect(p),
        button: (p) => this.createButton('simple', p),
        'image-path': (p) => this.createInput('text', p, { placeholder: '图片路径' }),
        'image-preview': (p) => this.createPreView('image', p),
        'image-icon': (p) => this.createPreView('icon', p),
        'table-button': (p) => this.createButton('table', p),
        'table-preview': (p) => this.createPreView('table', p, p.columns),
        'textarea-preview': (p) => this.createPreView('textarea', p),
        port: (p) => this.createButton('port', p),
        selectPort: (p) => this.createButton('selectPort', p),
    };

    /**
     * 辅助工具：创建 DOM 元素并分配属性
     *
     * @param {string} tagName
     */
    static createElement(tagName, props = {}, className = '') {
        const el = document.createElement(tagName);
        if (el instanceof HTMLInputElement) {
            el.name = props.label || `${el.type}输入`;
        }

        if (className) el.className = className;
        Object.assign(el, props);
        return el;
    }

    /**
     * @param {string} type
     * @param {BaseProp} prop
     * @returns {{
     *     element: HTMLElement;
     *     listeners: listenerMap[];
     * }}
     */

    static createInput(type, prop, config = {}) {
        const val = prop.value;
        const input = this.createElement('input', {
            type,
            id: prop.id || `input-${type}`,
            value: val ?? '',
            className: `prop-input ${type}`,
            ...config,
        });

        if (!(input instanceof HTMLInputElement)) {
            console.error(`无法创建 ${type} 类型的输入框`);
            return { element: this.createErrorDom(`无法创建 ${type} 类型的输入框`), listeners: [] };
        }

        input.autocomplete = 'off';

        /** @param {Event} e */
        const changeValueListener = (e) => {
            const target = e.target;
            if (target instanceof HTMLInputElement) {
                prop.changeValue(target.value);
            }
        };

        const mousedownListener = (e) => {
            e.stopPropagation();
        };

        /** @param {Event} e */
        const updateListener = (e) => {
            if (e instanceof CustomEvent) {
                input.value = e.detail.value;
            }
        };

        prop.addEventListener('update', updateListener);

        input.addEventListener('change', changeValueListener);

        input.addEventListener('mousedown', mousedownListener);

        const listeners = [
            { listener: changeValueListener, target: input, type: 'change' },
            { listener: mousedownListener, target: input, type: 'mousedown' },
            // 挂在 prop 模型上的监听器也必须登记，否则 redraw/销毁时无法移除
            { listener: updateListener, target: prop, type: 'update' },
        ];

        return { element: input, listeners: listeners };
    }

    static createLabel(textContent, forId, className = 'label') {
        const label = this.createElement('label', { textContent, htmlFor: forId }, className);
        return label;
    }

    /**
     * @returns {{
     *     element: HTMLElement;
     *     listeners: listenerMap[];
     * }}
     */

    static createNumber(type, prop) {
        const num = this.createElement('div', {}, 'prop-number');

        const label = this.createLabel(prop.label, String(prop.id));
        const input = this.createInput(type, prop);

        num.appendChild(label);
        num.appendChild(input.element);

        return { element: num, listeners: input.listeners };
    }

    /**
     * 创建一个单选按钮组
     *
     * @param {OptionsProp} prop
     * @returns {{
     *     element: HTMLElement;
     *     listeners: listenerMap[];
     * }} 返回包含单选按钮组的容器元素,以及元素及子元素绑定的所有listener
     */
    static createRadio(prop, boolFlag = false) {
        // 创建一个div容器，类名为'prop-radio-group'
        const container = this.createElement('div', {}, 'prop-radio-group');

        /** @type {listenerMap[]} */
        const listeners = [];

        // 创建一个label元素，类名为'radio-label'，并设置文本内容为p.label
        const label = this.createLabel(prop.label, String(prop.id), 'radio-label');
        // 将label添加到容器中
        container.appendChild(label);

        // 从配置中解构出选项数组和默认值
        let { opts = [] } = prop.config || {};

        if (boolFlag) {
            opts = ['是', '否'];
        }

        const currentValue = prop.value;

        // 遍历选项数组，为每个选项创建一个单选按钮
        opts.forEach((/** @type {any} */ opt) => {
            // 创建一个label元素，类名为'radio-option'
            const label = this.createElement('label', {}, 'radio-option');

            const labelMouseDownListener = (e) => {
                e.stopPropagation();
            };

            label.addEventListener('mousedown', labelMouseDownListener);

            listeners.push({
                target: label,
                type: 'mousedown',
                listener: labelMouseDownListener,
            });

            const input = this.createElement('input', {
                type: 'radio',
                name: String(prop.id), // 同一组的 name 相同
                value: opt,
                className: 'prop-radio-input',
            });

            if (!(input instanceof HTMLInputElement)) {
                console.error(`无法创建单选输入框`, prop);
                return { element: this.createErrorDom(`无法创建单选输入框`), listeners: [] };
            }

            // 设置选中状态：处理布尔型转换
            if (boolFlag) {
                // 布尔型：'是' 对应 true，'否' 对应 false
                const boolVal = currentValue === true || currentValue === false ? currentValue : false;
                if ((opt === '是' && boolVal === true) || (opt === '否' && boolVal === false)) {
                    input.checked = true;
                }
            } else {
                // 普通单选：直接比较值
                if (opt === currentValue) {
                    input.checked = true;
                }
            }

            const changeValueListener = (e) => {
                const target = e.target;
                if (boolFlag) {
                    prop.changeValue(target.value === '是' ? true : false);
                } else {
                    prop.changeValue(target.value);
                }
            };
            input.addEventListener('change', changeValueListener);

            /** @param {Event} e */
            const updateListener = (e) => {
                if (e instanceof CustomEvent) {
                    const eventValue = e.detail.value;
                    if (boolFlag) {
                        // 布尔型：'是' 对应 true，'否' 对应 false
                        const boolVal = eventValue === true || eventValue === false ? eventValue : false;
                        if ((opt === '是' && boolVal === true) || (opt === '否' && boolVal === false)) {
                            input.checked = true;
                        }
                    } else {
                        // 普通单选：直接比较值
                        if (opt === eventValue) {
                            input.checked = true;
                        }
                    }
                }
            };

            prop.addEventListener('update', updateListener);

            listeners.push({
                target: input,
                type: 'change',
                listener: changeValueListener,
            });
            // 登记 prop 模型上的 update 监听器，便于销毁/重绘时移除
            listeners.push({
                target: prop,
                type: 'update',
                listener: updateListener,
            });

            // 创建一个span元素作为标签文本，类名为'radio-option-label'
            const span = this.createElement('span', { textContent: opt }, 'radio-option-label');

            // 将input和span添加到label中，然后将label添加到容器中
            label.append(input, span);
            container.appendChild(label);
        });

        return { element: container, listeners };
    }

    /**
     * 创建下拉选择框
     *
     * @param {BaseProp} p
     * @returns {{
     *     element: HTMLElement;
     *     listeners: listenerMap[];
     * }}
     */
    static createSelect(p) {
        const s = this.createElement('select', {}, 'select');
        if (!(s instanceof HTMLSelectElement)) {
            throw new Error('创建select元素失败');
        }
        const opts = p.config?.opts || [];

        let fragment = document.createDocumentFragment();
        opts.forEach((o) => {
            const option = document.createElement('option');
            option.textContent = o;
            option.value = o;

            if (o === p.value) {
                option.selected = true;
            }

            fragment.appendChild(option);
        });

        const mousedownListener = (e) => {
            e.stopPropagation();
        };

        const changeListener = (e) => {
            const target = e.target;
            if (target instanceof HTMLSelectElement) {
                p.changeValue(target.value);
            }
        };

        s.addEventListener('mousedown', mousedownListener);

        s.addEventListener('change', changeListener);

        /** @param {Event} e */
        const updateListener = (e) => {
            if (e instanceof CustomEvent) {
                s.value = e.detail.value;
            }
        };

        p.addEventListener('update', updateListener);

        s.appendChild(fragment);

        return {
            element: s,
            listeners: [
                { target: s, type: 'mousedown', listener: mousedownListener },
                { target: s, type: 'change', listener: changeListener },
                // 登记 prop 模型上的 update 监听器，便于销毁/重绘时移除
                { target: p, type: 'update', listener: updateListener },
            ],
        };
    }

    /**
     * @returns {{
     *     element: HTMLElement;
     *     listeners: listenerMap[];
     * }}
     */

    static createCheckbox(p) {
        const c = this.createElement('div', {}, 'checkbox');

        const label = this.createLabel(p.label, String(p.id));

        const input = this.createInput('checkbox', p);

        c.appendChild(label);
        c.appendChild(input.element);

        return { element: c, listeners: input.listeners };
    }

    /**
     * 创建预览组件
     *
     * @param {string} type
     * @param {ViewProp} prop
     * @returns {{
     *     element: HTMLElement;
     *     listeners: listenerMap[];
     * }}
     */
    static createPreView(type, prop, columns = []) {
        const preView = this.createElement('div', {}, 'prop-card');

        switch (type) {
            case 'textarea':
                const textInput = this.createElement('textarea', {
                    value: prop.value ?? '',
                    placeholder: '输入文本内容...',
                });
                preView.appendChild(textInput);
                break;
            case 'icon':
                const icon = this.createElement('img', {
                    src: prop.value || '../../../test/img/placeholder.png',
                });
                preView.appendChild(icon);
                preView.classList.add('icon');
                break;

            case 'image':
                const img = this.createElement('img', {
                    src: prop.value || '../../../test/img/placeholder.png',
                });
                preView.appendChild(img);
                break;

            case 'table':
                const tableWrapper = this.createElement('div', {}, 'table-wrapper');

                const table = this.createElement('table', {}, 'prop-table');
                const thead = this.createElement('thead');
                const headerRow = this.createElement('tr');

                columns.forEach((col) => {
                    headerRow.appendChild(this.createElement('th', { textContent: col.label }));
                });

                const tbody = this.createElement('tbody');
                (Array.isArray(prop.value) ? prop.value : []).forEach((rowItem) => {
                    const tr = this.createElement('tr');
                    columns.forEach((col) => {
                        const td = this.createElement('td');

                        const value = rowItem[col.field];

                        td.textContent = value ?? '';

                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });

                thead.appendChild(headerRow);
                table.appendChild(thead);
                table.appendChild(tbody);

                tableWrapper.appendChild(table);
                preView.appendChild(tableWrapper);
                break;
        }

        return { element: preView, listeners: [] };
    }

    /**
     * @param {string} type
     * @param {BaseProp} p
     * @returns {{
     *     element: HTMLElement;
     *     listeners: listenerMap[];
     * }}
     */
    static createButton(type, p) {
        const button = document.createElement('button');

        button.className = `button ${type}`;
        button.textContent = p.label || '测试用';

        const mousedownListener = (/**@type {Event}*/e) => {
            e.stopPropagation();
            p.transmit(e);
        };
        button.addEventListener('mousedown', mousedownListener);

        return { element: button, listeners: [{ listener: mousedownListener, target: button, type: 'mousedown' }] };
    }

    /** @param {string} type */
    static createHub(type, layout = 'single') {
        const hub = document.createElement('div');
        hub.className = 'prop-hub';
        hub.classList.add(layout);

        return hub;
    }

    //TODO 显示错误原因
    static createErrorDom(message = '属性未正确渲染') {
        const el = document.createElement('div');
        el.className = 'prop-error';
        el.textContent = message;
        return el;
    }
}
