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
     * @param {*} prop 
     * @returns {BaseProp | PortProp}
     */
    static createProp(id, type, prop) {
        let propClass = null;

        // 根据类型预处理参数
        let args;
        switch (type) {
            case 'hub':
                const hubProps = [];
                prop.properties.forEach((/** @type {PropConfig} */ p, /** @type {number} */ index) => {
                    hubProps.push(PropGenerator.createProp(`${id}_hub:${prop.label}-${index}`, p.type, p))
                });
                args = [id, prop.label, hubProps, prop.layout];
                propClass = HubProp;
                break;
            case 'range':
                args = [id, prop.label, 'slider', prop.default, prop.min, prop.max];
                propClass = NumericProp;
                break;
            case 'number':
            case 'integer':
            case 'slider':
                args = [id, prop.label, prop.type, prop.default, prop.min, prop.max];
                propClass = NumericProp;
                break;
            case 'text':
            case 'image-path':
                args = [id, prop.label, prop.type, prop.default, {
                    inputPort: { id: `${id}-input`, portType: 'implicit', dataType: 'text' }
                }];
                propClass = PortProp;
                break;
            case 'table':
            case 'table-preview':
                args = [id, prop.label, 'table-preview', prop.default, prop.columns, prop.rows];
                propClass = ViewProp;
                break;
            case 'image-preview':
                args = [id, prop.label, 'image-preview', prop.default];
                propClass = ViewProp;
                break;
            case 'textarea-preview':
                args = [id, prop.label, 'textarea-preview', prop.default];
                propClass = ViewProp;
                break;
            case 'image-icon':
                args = [id, prop.label, 'image-icon', prop.default];
                propClass = ViewProp;
                break;
            case 'bool':
                args = [id, prop.label, 'bool-radio', prop.default,]
                propClass = BaseProp;
                break;
            case 'select':
                args = [id, prop.label, 'select', prop.default, prop.options, prop.isModeSwitcher];
                propClass = OptionsProp;
                break;
            case 'port':
                const portConfig = {
                    inputPort: null,
                    outputPort: null
                }
                if (!prop.direction || prop.direction === 'input') {
                    portConfig.inputPort = {
                        id: `${id}-input`,
                        dataType: prop.requireType || 'any',
                    }
                } else if (prop.direction === 'output') {
                    portConfig.outputPort = {
                        id: `${id}-output`,
                        dataType: prop.returnType || 'any',
                    }
                } else if (prop.direction === 'both') {
                    portConfig.inputPort = {
                        id: `${id}-input`,
                        dataType: prop.requireType || 'any',
                    }
                    portConfig.outputPort = {
                        id: `${id}-output`,
                        dataType: prop.returnType || 'any',
                    }
                }
                args = [id, prop.label, prop.type, prop.default, portConfig];
                propClass = PortProp;
                break;
            default:
                args = [id, prop.label, prop.type, prop.default];
                propClass = BaseProp;
                break;
        }

        if (!propClass) {
            console.error(`未知属性类型: ${type}`);
            return new BaseProp(null, null, null, null);
        }

        return Reflect.construct(propClass, args);
    }


}

export class PropRenderer {

    /**
     * 渲染映射表
     */
    static RenderMap = {
        'text': (p) => this.createInput('text', p),
        'integer': (p) => this.createInput('number', p),
        'number': (p) => this.createInput('number', p),
        'slider': (p) => this.createInput('range', p, {
            step: String(p.config?.step ?? 1)
        }),
        'radio': (p) => this.createRadio(p),
        'bool-radio': (p) => this.createRadio(p, true),   // 直接传入 prop
        'select': (p) => this.createSelect(p),
        'image-path': (p) => this.createInput('text', p, { placeholder: "Image Path..." }),
        'image-preview': (p) => this.createPreView('image', p),
        'image-icon': (p) => this.createPreView('icon', p),
        'table-button': (p) => this.createButton('table', 'DATA TABLE', p),
        'table-preview': (p) => this.createPreView('table', p, p.columns),
        'textarea-preview': (p) => this.createPreView('textarea', p),
        'port': (p) => this.createButton('port', p.label, p),
        'selectPort': (p) => this.createButton('selectPort', p.default, p),
        'hub': (p) => this.createHub('hub', p)
    };

    /**
     * 辅助工具：创建 DOM 元素并分配属性
     * @param {string} tagName
     */
    static createElement(tagName, props = {}, className = '') {
        const el = document.createElement(tagName);
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
            value: val ?? '',
            className: `prop-input ${type}`,
            ...config
        });
        input.addEventListener('change', (e) => {
            const target = e.target;
            if (target instanceof HTMLInputElement) {
                console.log(target)
                prop.setValue(target.value);
            }
        });

        return input;
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
        const label = this.createElement('label', { textContent: p.label }, 'radio-group-label');
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

            const input = this.createElement('input', {
                type: 'radio',
                name: String(p.id),   // 同一组的 name 相同
                value: opt,
                className: 'prop-radio-input'
            });
            // 设置选中状态：处理布尔型转换
            if (p.type === 'bool-radio' || p.type === 'bool') {
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
                    if (p.type === 'bool-radio' || p.type === 'bool') {
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

        s.addEventListener('change', (e) => {
            const target = e.target;
            if (target instanceof HTMLSelectElement) {
                p.setValue(target.value);
            }
        })

        s.appendChild(fragment);
        return s;
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
     * @param {string} label
     * @param {any} val
     */
    static createButton(type, label, val) {
        const button = document.createElement('button');

        button.className = `button ${type}`;
        button.textContent = label || '测试用';

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
    static createErrorDom(message = '未知原因') {
        const el = document.createElement('div');
        el.className = 'prop-error';
        el.textContent = '属性未正确渲染';
        return el;
    }


}
