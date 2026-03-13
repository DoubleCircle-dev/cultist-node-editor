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
            case 'number':
                args = [id, prop.label, 'integer', prop.default, prop.min, prop.max];
                propClass = NumericProp;
                break;
            case 'range':
                args = [id, prop.label, 'slider', prop.default, prop.min, prop.max];
                propClass = NumericProp;
                break;
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
            case 'bool':
                args = [id, prop.label, 'bool-radio', prop.default,]
                propClass = OptionsProp;
                break;
            case 'select':
                args = [id, prop.label, 'select', prop.default, prop.options];
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
        'text': (/** @type {{ value: any; }} */ p) =>
            this.createInput('text', p.value),

        'integer': (/** @type {{ value: any; }} */ p) =>
            this.createInput('number', p.value),

        'slider': (/** @type {{ value: any; config: { min: any; max: any; step: any; }; }} */ p) =>
            this.createInput('range', p.value, {
                min: String(p.config?.min ?? 0),
                max: String(p.config?.max ?? 100),
                step: String(p.config?.step ?? 1)
            }),

        'radio': (/** @type {any} */ p) =>
            this.createRadio(p),

        'bool-radio': (/** @type {{ id: any; value: any; }} */ p) =>
            this.createRadio({
                id: p.id,
                value: p.value ? '是' : '否',
                config: { opts: ['是', '否'] }
            }),

        'select': (/** @type {any} */ p) =>
            this.createSelect(p),

        'image-path': (/** @type {{ value: any; }} */ p) =>
            this.createInput('text', p.value, { placeholder: "Image Path..." }),

        'image-preview': (/** @type {{ value: any; }} */ p) =>
            this.createPreView('image', p.value),

        //TODO 创建table界面
        'table-button': () =>
            this.createButton('table', 'DATA TABLE', { innerText: 'DATA TABLE' }),

        'table-preview': (/** @type {{ value: any; columns: string[]; }} */ p) =>
            this.createPreView('table', p.value, p.columns),

        'textarea-preview': (/** @type {{ value: any; }} */ p) =>
            this.createPreView('textarea', p.value),

        'port': (/** @type {{label:'string'; value: any; }} */ p) =>
            this.createButton('port', p.label, p.value),

        'hub': (/** @type {{layout: 'string'; }} */ p) =>
            this.createHub('hub', p.layout)
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
     * @param {any} val
     * 
     */
    static createInput(type, val, config = {}) {
        return this.createElement('input', {
            type,
            value: val ?? '',
            className: `prop-input ${type}`,
            ...config
        });
    }

    /**
     * 创建一个单选按钮组
     * @param {Object} p - 配置对象，包含id、value、config等属性
     * @returns {HTMLElement} 返回包含单选按钮组的容器元素
     */
    static createRadio(p) {
        // 创建一个div容器，类名为'prop-radio-group'
        const container = this.createElement('div', {}, 'prop-radio-group');
        // 从配置中解构出选项数组和默认值
        const { opts = [], default: def } = p.config || {};

        // 遍历选项数组，为每个选项创建一个单选按钮
        opts.forEach((/** @type {any} */ opt) => {
            // 创建一个label元素，类名为'radio-option'
            const label = this.createElement('label', {}, 'radio-option');
            // 创建一个radio类型的input元素，设置name和checked属性
            const input = this.createInput('radio', opt, {
                name: String(p.id),
                checked: opt === (p.value || def)  // 如果当前选项等于值或默认值，则设为选中状态
            });

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
     * @param {{ config: { opts: any[]; }; value: any; }} p
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
        s.appendChild(fragment);
        return s;
    }

    /**
     * 创建预览组件
     * @param {string} type
     * @param {any} val
     */
    static createPreView(type, val, columns = []) {
        const preView = this.createElement('div', {}, 'prop-card');

        switch (type) {
            case 'textarea':
                const textInput = this.createElement('textarea', {
                    value: val ?? '',
                    placeholder: 'Text Area...'
                });
                preView.appendChild(textInput);
                break;

            case 'image':
                const img = this.createElement('img', {
                    src: val || '../../../test/img/placeholder.png'
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
                (Array.isArray(val) ? val : []).forEach(rowItem => {
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
     * @param {{ innerText: string; }} val
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
