import { BaseProp } from "../models/propModels/baseProp.js";
import { NumericProp } from "../models/propModels/numericProp.js";
import { OptionsProp } from "../models/propModels/optionsProp.js";
import { PortProp } from "../models/propModels/portProp.js";
import { ViewProp } from "../models/propModels/viewProp.js";

export class PropGenerator {
    static createProp(id, type, prop) {
        switch (type) {
            case 'integer':
            case 'slider':
                return new NumericProp(id, prop.label, prop.type, prop.default, prop.min, prop.max);
            case 'text':
            case 'image-path':
            case 'port':
                return new PortProp(id, prop.label, prop.type, prop.default);
            case 'radio':
            case 'bool-radio':
            case 'select':
                return new OptionsProp(id, prop.label, prop.type, prop.default, prop.options);
            case 'image-preview':
            case 'table-preview':
            case 'textarea-preview':
                return new ViewProp(id, prop.label, prop.type, prop.default);
            case 'blank':
                return new BaseProp(null, null, null, null);
            default:
                console.error(`未知的属性类型 ${type}`);
                return new BaseProp(null, null, null, null);;
        }
    }
}

/**
 * 辅助工具：创建 DOM 元素并分配属性
 * @param {string} tagName
 */
function createElement(tagName, props = {}, className = '') {
    const el = document.createElement(tagName);
    if (className) el.className = className;
    Object.assign(el, props);
    return el;
}


/**
 * @param {string} type
 * @param {any} val
 */
function createInput(type, val, config = {}) {
    return createElement('input', {
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
function createRadio(p) {
    // 创建一个div容器，类名为'prop-radio-group'
    const container = createElement('div', {}, 'prop-radio-group');
    // 从配置中解构出选项数组和默认值
    const { opts = [], default: def } = p.config || {};

    // 遍历选项数组，为每个选项创建一个单选按钮
    opts.forEach((/** @type {any} */ opt) => {
        // 创建一个label元素，类名为'radio-option'
        const label = createElement('label', {}, 'radio-option');
        // 创建一个radio类型的input元素，设置name和checked属性
        const input = createInput('radio', opt, {
            name: String(p.id),
            checked: opt === (p.value || def)  // 如果当前选项等于值或默认值，则设为选中状态
        });

        // 创建一个span元素作为标签文本，类名为'radio-option-label'
        const span = createElement('span', { textContent: opt }, 'radio-option-label');

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
function createSelect(p) {
    const s = createElement('select', {}, 'select');
    const opts = p.config?.opts || [];

    const fragment = document.createDocumentFragment();
    opts.forEach(o => {
        // 显式创建 option，JS 引擎会识别其类型
        const option = document.createElement('option');
        option.textContent = o;
        option.value = o;


        // 现在这里不会报错了，因为 option 确定有 selected 属性
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
function createPreView(type, val) {
    const preView = createElement('div', {}, 'prop-card');

    switch (type) {
        case 'textarea':
            const textInput = createElement('textarea', {
                value: val ?? '',
                placeholder: 'Text Area...'
            });
            preView.appendChild(textInput);
            break;

        case 'image':
            const img = createElement('img', {
                src: val || '../../../test/img/placeholder.png'
            });
            preView.appendChild(img);
            break;

        case 'table':
            const table = createElement('table', {}, 'prop-table');
            const thead = createElement('thead');
            const headerRow = createElement('tr');

            (Array.isArray(val) ? val : []).forEach(text => {
                headerRow.appendChild(createElement('th', { textContent: text }));
            });

            thead.appendChild(headerRow);
            table.appendChild(thead);
            preView.appendChild(table);
            break;
    }

    return preView;
}

/**
 * 渲染映射表
 */
export const PropRenderMap = {
    'text': (/** @type {{ value: any; }} */ p) => createInput('text', p.value),

    'integer': (/** @type {{ value: any; }} */ p) => createInput('number', p.value),

    'slider': (/** @type {{ value: any; config: { min: any; max: any; step: any; }; }} */ p) => createInput('range', p.value, {
        min: String(p.config?.min ?? 0),
        max: String(p.config?.max ?? 100),
        step: String(p.config?.step ?? 1)
    }),

    'radio': (/** @type {any} */ p) => createRadio(p),

    'bool-radio': (/** @type {{ id: any; value: any; }} */ p) => createRadio({
        id: p.id,
        value: p.value ? '是' : '否',
        config: { opts: ['是', '否'] }
    }),

    'select': (/** @type {any} */ p) => createSelect(p),

    'image-path': (/** @type {{ value: any; }} */ p) => createInput('text', p.value, { placeholder: "Image Path..." }),

    'image-preview': (/** @type {{ value: any; }} */ p) => createPreView('image', p.value),

    'table-button': () => createElement('div', { innerText: 'DATA TABLE' }, 'preview-box table'),

    'table-preview': (/** @type {{ value: any; }} */ p) => createPreView('table', p.value),

    'textarea-preview': (/** @type {{ value: any; }} */ p) => createPreView('textarea', p.value),

    'port': (/** @type {{ value: any; }} */ p) => createInput('text', p.value)
};
