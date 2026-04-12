import { BaseProp } from "../models/propModels/baseProp.js";
import { NumericProp } from "../models/propModels/numericProp.js";
import { OptionsProp } from "../models/propModels/optionsProp.js";
import { PortProp } from "../models/propModels/portProp.js";
import { ViewProp } from "../models/propModels/viewProp.js";
import { HubProp } from "../models/propModels/hubProp.js";

export class PropGenerator {

    /**
     * 
     * @param {*} id 
     * @param {*} type 
     * @param {*} propConfig 
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
                    hubProps.push(PropGenerator.createProp(`${id}_hub:${propConfig.label}-${index}`, p.type, p, node))
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
                args = [id, propConfig.label, propConfig.type, propConfig.default, {
                    inputPort: { id: `${id}-input`, portType: 'implicit', dataType: 'text' }
                }];
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
                const portConfig = {
                    inputPort: null,
                    outputPort: null
                }
                if (!propConfig.direction || propConfig.direction === 'input') {
                    portConfig.inputPort = {
                        id: `${id}-input`,
                        dataType: propConfig.requireType || 'any',
                    }
                } else if (propConfig.direction === 'output') {
                    portConfig.outputPort = {
                        id: `${id}-output`,
                        dataType: propConfig.returnType || 'any',
                    }
                } else if (propConfig.direction === 'both') {
                    portConfig.inputPort = {
                        id: `${id}-input`,
                        dataType: propConfig.requireType || 'any',
                    }
                    portConfig.outputPort = {
                        id: `${id}-output`,
                        dataType: propConfig.returnType || 'any',
                    }
                }
                args = [id, propConfig.label, propConfig.type, propConfig.default, portConfig];
                propClass = PortProp;
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
     * 渲染映射表
     */
    static RenderMap = {
        'text': (p) => this.createInput('text', p, { placeholder: p.label }),
        'integer': (p) => this.createInput('number', p, { placeholder: p.label }),
        'number': (p) => this.createNumber('number', p),
        'range': (p) => this.createInput('range', p, {
            step: String(p.config?.step ?? 1)
        }),
        'slider': (p) => this.createInput('range', p, {
            step: String(p.config?.step ?? 1)
        }),
        'radio': (p) => this.createRadio(p),
        'bool': (p) => this.createRadio(p, true),
        'checkbox': (p) => this.createCheckbox(p),
        'select': (p) => this.createSelect(p),
        'image-path': (p) => this.createInput('text', p, { placeholder: "图片路径" }),
        'image-preview': (p) => this.createPreView('image', p),
        'image-icon': (p) => this.createPreView('icon', p),
        'table-button': (p) => this.createButton('table', p),
        'table-preview': (p) => this.createPreView('table', p, p.columns),
        'textarea-preview': (p) => this.createPreView('textarea', p),
        'port': (p) => this.createButton('port', p),
        'selectPort': (p) => this.createButton('selectPort', p),
        'hub': (p) => this.createHub('hub', p)
    };

    /**
     * 辅助工具：创建 DOM 元素并分配属性
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
     * 
     */
    static createInput(type, prop, config = {}) {
        const val = prop.value;
        const input = this.createElement('input', {
            type,
            id: prop.id || `input-${type}`,
            value: val ?? '',
            className: `prop-input ${type}`,
            ...config
        });

        input.addEventListener('change', (e) => {
            const target = e.target;
            if (target instanceof HTMLInputElement) {
                prop.setValue(target.value);
            }
        });

        input.addEventListener('mousedown', (e) => e.stopPropagation());

        return input;
    }

    static createLabel(textContent, forId, className = 'label') {
        const label = this.createElement('label', { textContent, htmlFor: forId }, className);
        return label;
    }

    static createNumber(type, prop) {
        const num = this.createElement('div', {}, 'prop-number');

        const label = this.createLabel(prop.label, String(prop.id));
        const input = this.createInput(type, prop);

        num.appendChild(label);
        num.appendChild(input);

        return num;
    }

    /**
     * 创建一个单选按钮组
     * @param {OptionsProp} p
     * @returns {HTMLElement} 返回包含单选按钮组的容器元素
     */
    static createRadio(p, boolFlag = false) {
        // 创建一个div容器，类名为'prop-radio-group'
        const container = this.createElement('div', {}, 'prop-radio-group');

        // 创建一个label元素，类名为'radio-label'，并设置文本内容为p.label
        const label = this.createLabel(p.label, String(p.id), 'radio-label');
        // 将label添加到容器中
        container.appendChild(label);

        // 从配置中解构出选项数组和默认值
        let { opts = [] } = p.config || {};

        if (boolFlag) {
            opts = ['是', '否'];
        }

        const currentValue = p.value;

        // 遍历选项数组，为每个选项创建一个单选按钮
        opts.forEach((/** @type {any} */ opt) => {
            // 创建一个label元素，类名为'radio-option'
            const label = this.createElement('label', {}, 'radio-option');

            label.addEventListener('mousedown', (e) => e.stopPropagation());

            const input = this.createElement('input', {
                type: 'radio',
                name: String(p.id),   // 同一组的 name 相同
                value: opt,
                className: 'prop-radio-input'
            });
            // 设置选中状态：处理布尔型转换
            if (boolFlag) {
                // 布尔型：'是' 对应 true，'否' 对应 false
                const boolVal = currentValue === true || currentValue === false ? currentValue : false;
                if ((opt === '是' && boolVal === true) || (opt === '否' && boolVal === false)) {
                    if (input instanceof HTMLInputElement) {
                        input.checked = true;
                    }
                }
            } else {
                // 普通单选：直接比较值
                if (opt === currentValue) {
                    if (input instanceof HTMLInputElement) {
                        input.checked = true;
                    }
                }
            }

            input.addEventListener('change', (e) => {
                const target = e.target
                if (target instanceof HTMLInputElement) {
                    if (boolFlag) {
                        p.setValue(target.value === '是' ? true : false);
                    } else {
                        p.setValue(target.value);
                    }
                }
            })

            // 创建一个span元素作为标签文本，类名为'radio-option-label'
            const span = this.createElement('span', { textContent: opt }, 'radio-option-label');

            // 将input和span添加到label中，然后将label添加到容器中
            label.append(input, span);
            container.appendChild(label);
        });
        return container;
    }

    /**
     * 创建下拉选择框
     * @param {BaseProp} p
     */
    static createSelect(p) {
        const s = this.createElement('select', {}, 'select');
        const opts = p.config?.opts || [];

        const fragment = document.createDocumentFragment();
        opts.forEach(o => {
            const option = document.createElement('option');
            option.textContent = o;
            option.value = o;

            if (o === p.value) {
                option.selected = true;
            }

            fragment.appendChild(option);
        });

        s.addEventListener('mousedown', (e) => e.stopPropagation());

        s.addEventListener('change', (e) => {
            const target = e.target;
            if (target instanceof HTMLSelectElement) {
                p.setValue(target.value);
            }
        })

        s.appendChild(fragment);
        return s;
    }

    static createCheckbox(p) {

        const c = this.createElement('div', {}, 'checkbox');

        const label = this.createLabel(p.label, String(p.id));

        const input = this.createInput('checkbox', p);

        c.appendChild(label);
        c.appendChild(input);

        return c
    }

    /**
     * 创建预览组件
     * @param {string} type
     * @param {ViewProp} prop
     */
    static createPreView(type, prop, columns = []) {
        const preView = this.createElement('div', {}, 'prop-card');

        switch (type) {
            case 'textarea':
                const textInput = this.createElement('textarea', {
                    value: prop.value ?? '',
                    placeholder: '输入文本内容...'
                });
                preView.appendChild(textInput);
                break;
            case 'icon':
                const icon = this.createElement('img', {
                    src: prop.value || '../../../test/img/placeholder.png'
                })
                preView.appendChild(icon);
                preView.classList.add('icon');
                break;

            case 'image':
                const img = this.createElement('img', {
                    src: prop.value || '../../../test/img/placeholder.png'
                });
                preView.appendChild(img);
                break;

            case 'table':
                const tableWrapper = this.createElement('div', {}, 'table-wrapper');

                const table = this.createElement('table', {}, 'prop-table');
                const thead = this.createElement('thead');
                const headerRow = this.createElement('tr');

                columns.forEach(col => {
                    headerRow.appendChild(this.createElement('th', { textContent: col.label }));
                })

                const tbody = this.createElement('tbody');
                (Array.isArray(prop.value) ? prop.value : []).forEach(rowItem => {
                    const tr = this.createElement('tr');
                    columns.forEach(col => {
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

        return preView;
    }


    /**
     * @param {string} type
     * @param {BaseProp} p
     */
    static createButton(type, p) {
        const button = document.createElement('button');

        button.className = `button ${type}`;
        button.textContent = p.label || '测试用';

        button.addEventListener('mousedown', (e) => e.stopPropagation());

        return button;

    }

    /**
     * @param {string} type
     */
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
