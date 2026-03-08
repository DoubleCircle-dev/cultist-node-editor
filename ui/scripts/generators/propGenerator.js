// 辅助工具：创建一个基础 Input
/**
 * @param {string} type
 * @param {any} val
 */
function createInput(type, val) {
    const i = document.createElement('input');
    i.className = 'prop-input';
    i.classList.add(type);
    i.type = type;
    i.value = val || '';
    return i;
}

/**
 * 创建一个单选按钮组
 * @param {Object} p - 包含单选按钮配置的对象
 * @returns {HTMLElement} 返回包含单选按钮组的div元素
 */
function createRadio(p) {
    // 创建一个div容器，用于存放单选按钮组
    const container = document.createElement('div');
    container.className = 'prop-radio-group';
    // 遍历配置中的选项，为每个选项创建一个单选按钮
    p.config.opts.forEach((/** @type {any} */ opt) => {
        const label = document.createElement('label');
        label.className = 'radio-option';
        // 创建input元素作为单选按钮
        const input = createInput('radio', opt)
        input.checked = opt === p.config.default;
        input.name = String(p.id);  // 设置单选按钮组的名称
        label.appendChild(input);  // 将单选按钮添加到容器中

        const span = document.createElement('span');
        span.className = 'radio-option-label';
        span.textContent = opt;
        label.appendChild(span);

        container.appendChild(label);  // 将label元素添加到容器中

    });
    return container;  // 返回包含所有单选按钮的容器
}

function createBoolRadio(p) {
    return createRadio({
        id: p.id,
        config: {
            opts: ['是', '否'],
            default: p.value ? '是' : '否'
        }
    })
}

function createSelect(p) {
    const s = document.createElement('select');
    s.className = 'select';
    p.config.opts.forEach((/** @type {any} */ o) => {
        s.innerHTML += `<option>${o}</option>`;
    })
    return s;
}

function createPreView(type, val) {
    const preView = document.createElement('div');
    preView.className = 'prop-card'
    if (type === 'textarea') {
        const textInput = document.createElement('textarea');
        textInput.value = val || ''
        textInput.placeholder = 'Text Area...';
        preView.appendChild(textInput);
    }

    if (type === 'image') {
        const img = document.createElement('img');
        // preView.classList.add('icon');
        img.src = val || '../../../test/img/placeholder.png';
        preView.appendChild(img);
    }

    if (type === 'table') {
        const table = document.createElement('table');
        table.className= 'prop-table';

        const thead = document.createElement('thead');

        const headerRow = document.createElement('tr');

        val.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });

        table.appendChild(thead);
        thead.appendChild(headerRow);

        preView.appendChild(table);
    }

    return preView;
}

export const PropRenderMap = {
    'text': (/** @type {{ value: any; }} */ p) =>
        createInput('text', p.value),
    'integer': (/** @type {{ value: any; }} */ p) =>
        createInput('number', p.value),
    'slider': (/** @type {{ value: any; config: { min: Number; max: Number; }; }} */ p) => {
        const i = createInput('range', p.value);
        i.min = String(p.config.min || '0'); i.max = String(p.config.max || '100');
        return i;
    },
    'radio': (/** @type {{ config: { opts: any[]; }}} */ p) =>
        createRadio(p),
    'bool-radio': (/** @type {{ value: any; }} */ p) =>
        createBoolRadio(p),
    'select': (/** @type {{ config: { opts: any[]; }; }} */ p) =>
        createSelect(p),
    'image-path': (/** @type {{ value: any; }} */ p) => {
        const el = createInput('text', p.value);
        el.placeholder = "Image Path...";
        return el;
    },
    'image-preview': (/** @type {{ value: any; }} */ p) =>
        createPreView('image', p.value),
    'table-button': () => {
        const div = document.createElement('div');
        div.className = 'preview-box table';
        div.innerText = 'DATA TABLE';
        return div;
    },
    'table-preview': (/** @type {{ value: any; }} */ p) =>
        createPreView('table', p.value),
    'textarea-preview': (/** @type {{ value: any; }} */ p) =>
        createPreView('textarea', p.value)


};


