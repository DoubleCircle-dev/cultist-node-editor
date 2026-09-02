import { BaseProp } from '../models/propModels/baseProp.js';
import { NumericProp } from '../models/propModels/numericProp.js';
import { OptionsProp } from '../models/propModels/optionsProp.js';
import { PortProp } from '../models/propModels/portProp.js';
import { ViewProp } from '../models/propModels/viewProp.js';
import { HubProp } from '../models/propModels/hubProp.js';
import { BaseNodeModel } from '../models/nodeModels/baseNodeModel.js';

/**
 * 实时文本同步是否开启（设置项 core.setting.realtimeTextSync；浏览器/Webview 运行时读取）
 * @returns {boolean}
 */
function isRealtimeTextSyncEnabled() {
    const core = typeof window !== 'undefined' ? /** @type {any} */ (window).controlCore : null;
    return !!(core && core.setting && core.setting.realtimeTextSync);
}

export class PropGenerator {
    /**
     * @param {any} id
     * @param {any} type
     * @param {any} propConfig
     * @param {WeakRef<BaseNodeModel> | null} [node=null] Default is `null`
     * @returns {BaseProp | PortProp}
     */
    static createProp(id, type, propConfig, node = null) {
        let propClass = null;

        // 根据类型预处理参数
        let args;
        switch (type) {
            case 'hub': {
                /** @type {BaseProp[]} */
                const hubProps = [];
                propConfig.properties.forEach((/** @type {PropConfig} */ p, /** @type {number} */ index) => {
                    hubProps.push(PropGenerator.createProp(`${id}_hub:${propConfig.label}-${index}`, p.type, p, node));
                });
                args = [id, propConfig.label, hubProps, propConfig.layout];
                propClass = HubProp;
                break;
            }
            case 'range':
                args = [id, propConfig.label, 'slider', propConfig.default, propConfig.min, propConfig.max];
                propClass = NumericProp;
                break;
            case 'number':
            case 'integer':
            case 'int':
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
                args = [id, propConfig.label, 'image-preview', propConfig.default, [], [], 'images'];
                propClass = ViewProp;
                break;
            case 'textarea-preview':
                args = [id, propConfig.label, 'textarea-preview', propConfig.default, [], [], 'text'];
                propClass = ViewProp;
                break;
            case 'image-icon':
                args = [id, propConfig.label, 'image-icon', propConfig.default, [], [], 'images'];
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
            case 'custom':
                // 只读文本展示（origin 多余字段保留用），由数据实例化时创建
                args = [id, propConfig.label, 'custom', propConfig.default];
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
            // 兜底占位：构造参数故意传 null（未知属性类型）
            return Reflect.construct(BaseProp, [null, null, null, null]);
        }

        const result = Reflect.construct(propClass, args);

        if (result instanceof BaseProp) {
            result.description = propConfig.description;
            // 修复：把模板属性名（name）传给 prop 实例，供「数据填充」按名匹配
            result.name = propConfig.name || propConfig.label;
            if (!(result instanceof HubProp)) {
                result.parentNode = node;
            }
        } else {
            console.error('注册属性失败', propClass, args);
            return Reflect.construct(BaseProp, [null, null, null, null]);
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
        int: (p) => this.createInput('number', p, { placeholder: p.placeholder || p.label }),
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
        node: (p) => this.createInput('text', p, { placeholder: '节点引用/ID' }),
        'text-preview': (p) => this.createPreView('textarea', p),
        custom: (p) => this.createInput('text', p, { readonly: true, placeholder: '只读（origin 保留字段）' }),
        port: (p) => this.createButton('port', p),
        selectPort: (p) => this.createButton('selectPort', p),
    };

    /**
     * 辅助工具：创建 DOM 元素并分配属性
     *
     * @param {string} tagName
     * @param {Record<string, any>} props
     * @param {string} className
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
        // `type: text` 的文本属性 → 折叠式自动换行输入框（内容超一行时才出现折叠按钮）
        if (type === 'text' && prop.type === 'text' && !config.readonly) {
            return this.createFoldableTextInput(type, prop, config);
        }

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

    /**
     * 创建折叠式自动换行文本输入框（`type: text` 属性专用）
     *
     * 规则：
     *  - 短内容（单行放得下）→ 等价普通单行输入框，不出现折叠按钮；
     *  - 长内容 → 默认折叠成单行（省略号 + 右侧 ▾ 按钮），点击展开为随
     *    内容自动增高、自动换行的多行文本框（可编辑），再点 ▴ 收起；
     *  - 折叠态聚焦或输入超过一行 → 自动展开，保证编辑全程换行可见；
     *  - 外部改写值（updateValue/数据填充/连线）后回到默认折叠态。
     *
     * @param {string} type - input 的 HTML type（恒为 'text'）
     * @param {BaseProp} prop
     * @param {Record<string, any>} [config]
     * @returns {{ element: HTMLElement; listeners: listenerMap[] }}
     */
    static createFoldableTextInput(type, prop, config = {}) {
        const val = prop.value ?? '';

        // 容器：默认折叠态
        const wrap = this.createElement('div', {}, 'prop-fold-text collapsed');

        // 单行输入（折叠 / 短文本态）
        const single = this.createElement('input', {
            type,
            id: prop.id || `input-${type}`,
            value: val,
            className: 'prop-input text single',
            ...config,
        });
        if (!(single instanceof HTMLInputElement)) {
            console.error(`无法创建 ${type} 类型的输入框`);
            return { element: this.createErrorDom(`无法创建 ${type} 类型的输入框`), listeners: [] };
        }
        single.autocomplete = 'off';

        // 多行输入（展开态）：默认隐藏，随内容自动增高、自动换行
        const multi = this.createElement('textarea', {
            value: val,
            className: 'prop-input text multi',
            placeholder: config.placeholder,
        });
        if (!(multi instanceof HTMLTextAreaElement)) {
            console.error('无法创建多行文本输入框');
            return { element: this.createErrorDom('无法创建多行文本输入框'), listeners: [] };
        }
        multi.rows = 1;

        // 隐形测量层：与输入框同宽同排版，仅用于判断内容是否超出一行
        const ghost = this.createElement('div', {}, 'prop-fold-ghost');

        // 折叠/展开按钮（用 span 而非 button，避免预览模式禁用 button 的逻辑误伤）
        const foldBtn = this.createElement('span', {}, 'prop-fold-btn');
        foldBtn.textContent = '▾';
        foldBtn.title = '展开全文';

        wrap.append(single, ghost, multi, foldBtn);

        /** @type {listenerMap[]} */
        const listeners = [];

        /** 是否已展开为多行 */
        let expanded = false;

        /** @returns {string} */
        const modelValue = () => String(prop.value ?? '');

        /** 当前可见控件里的实际值（未提交前以控件为准） */
        const currentValue = () => (expanded ? multi.value : single.value);

        /**
         * 内容是否超过一行（依赖真实布局，DOM 挂载后才能精确测量）
         * @returns {boolean}
         */
        const isOverflowing = () => {
            const text = currentValue();
            if (text.includes('\n')) return true;
            if (!wrap.isConnected || wrap.offsetWidth <= 0) return false;
            ghost.textContent = 'x'; // 单行基准
            const oneLineH = ghost.offsetHeight || 0;
            ghost.textContent = text || ' ';
            const fullH = ghost.offsetHeight || 0;
            ghost.textContent = '';
            return fullH > oneLineH + 2;
        };

        /** 多行输入框高度适配内容（需已布局） */
        const autoGrow = () => {
            if (!multi.isConnected) return;
            multi.style.height = 'auto';
            multi.style.height = `${multi.scrollHeight}px`;
        };

        /** 依据模型值与当前展开状态刷新 DOM */
        const applyState = () => {
            // 先把模型值同步到控件，超行判定才基于最新内容（外部 updateValue 尤其依赖此顺序）
            const text = modelValue();
            if (single.value !== text) single.value = text;
            if (multi.value !== text) multi.value = text;

            const long = isOverflowing();
            if (!long) expanded = false;

            wrap.classList.toggle('expanded', expanded);
            wrap.classList.toggle('collapsed', !expanded);

            if (expanded) {
                foldBtn.textContent = '▴';
                foldBtn.title = '收起';
                foldBtn.classList.add('visible');
                wrap.classList.add('has-btn');
                autoGrow();
            } else {
                foldBtn.textContent = '▾';
                foldBtn.title = '展开全文';
                foldBtn.classList.toggle('visible', long);
                wrap.classList.toggle('has-btn', long);
            }
        };

        /** 把当前可见控件里未提交的值写回模型（仅当确实变化时） */
        const syncModelFromActive = () => {
            const value = currentValue();
            if (String(prop.value ?? '') !== value) {
                prop.changeValue(value);
            }
        };

        /** 进入展开态并保留当前正在输入的内容 */
        const enterExpanded = () => {
            expanded = true;
            multi.value = single.value;
            wrap.classList.add('expanded');
            wrap.classList.remove('collapsed');
            wrap.classList.add('has-btn');
            foldBtn.textContent = '▴';
            foldBtn.title = '收起';
            autoGrow();
            multi.focus();
            const end = multi.value.length;
            try {
                multi.setSelectionRange(end, end);
            } catch { /* 忽略（部分环境不支持） */ }
        };

        /** 失焦提交值（change 事件），随后按内容刷新折叠状态 */
        const commitListener = (e) => {
            const target = e.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                prop.changeValue(target.value);
            }
            applyState();
        };

        /** 折叠态单行输入：实时同步 + 内容超过一行时自动展开 */
        const singleInputListener = () => {
            if (isRealtimeTextSyncEnabled()) {
                prop.emit('text:input', { value: single.value });
            }
            if (expanded || !isOverflowing()) return;
            enterExpanded();
        };

        /** 折叠态聚焦长文本 → 自动展开方便查看/编辑 */
        const singleFocusListener = () => {
            if (expanded || !isOverflowing()) return;
            enterExpanded();
        };

        /** 展开态多行输入：随内容自动增高 + 实时同步 */
        const multiInputListener = () => {
            autoGrow();
            if (isRealtimeTextSyncEnabled()) {
                prop.emit('text:input', { value: multi.value });
            }
        };

        /** 点击折叠/展开按钮（先写回未提交内容再切换，避免丢字） */
        const toggleListener = (e) => {
            e.stopPropagation();
            syncModelFromActive();
            expanded = !expanded;
            applyState();
        };

        /** 阻止 mousedown 冒泡，避免触发节点拖动 */
        const stopPropagationListener = (e) => {
            e.stopPropagation();
        };

        /** 外部改写值（updateValue/连线/数据填充）→ 回到默认折叠态 */
        const updateListener = () => {
            expanded = false;
            applyState();
        };

        prop.addEventListener('update', updateListener);
        single.addEventListener('change', commitListener);
        single.addEventListener('input', singleInputListener);
        single.addEventListener('focus', singleFocusListener);
        multi.addEventListener('change', commitListener);
        multi.addEventListener('input', multiInputListener);
        foldBtn.addEventListener('click', toggleListener);
        wrap.addEventListener('mousedown', stopPropagationListener);

        listeners.push(
            { listener: commitListener, target: single, type: 'change' },
            { listener: singleInputListener, target: single, type: 'input' },
            { listener: singleFocusListener, target: single, type: 'focus' },
            { listener: commitListener, target: multi, type: 'change' },
            { listener: multiInputListener, target: multi, type: 'input' },
            { listener: toggleListener, target: foldBtn, type: 'click' },
            { listener: stopPropagationListener, target: wrap, type: 'mousedown' },
            // 挂在 prop 模型上的监听器也必须登记，否则 redraw/销毁时无法移除
            { listener: updateListener, target: prop, type: 'update' },
        );

        // 节点挂载、布局可用后再精确测量超行并刷新折叠按钮（避免短内容闪现按钮）
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                if (wrap.isConnected) applyState();
            });
        }

        return { element: wrap, listeners: listeners };
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
     * 获取图片加载失败时的回退占位图 URI（优先后端注入的 webview URI，其次浏览器相对路径）
     *
     * @returns {string}
     */
    static getPlaceholderImage() {
        const cfg = typeof window !== 'undefined' ? window.NODE_EDITOR_CONFIG : null;
        return (cfg && cfg.placeholderImage) || 'assets/img/placeholder.png';
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

        /** @type {listenerMap[]} */
        const listeners = [];

        switch (type) {
            case 'textarea': {
                const textInput = this.createElement('textarea', {
                    value: prop.value ?? '',
                    placeholder: '输入文本内容...',
                });
                // 阻止 mousedown 冒泡，避免在文本框中编辑时触发节点拖动
                const textareaMousedownListener = (/** @type {Event} */ e) => e.stopPropagation();
                textInput.addEventListener('mousedown', textareaMousedownListener);
                listeners.push({ target: textInput, type: 'mousedown', listener: textareaMousedownListener });

                // 失焦提交（与其它输入框一致），使文本变量等内容可编辑并持久化
                const textareaChangeListener = (/** @type {Event} */ e) => {
                    const target = e.target;
                    if (target instanceof HTMLTextAreaElement) {
                        prop.changeValue(target.value);
                    }
                };
                textInput.addEventListener('change', textareaChangeListener);
                listeners.push({ target: textInput, type: 'change', listener: textareaChangeListener });

                // 外部改写值（变量同步 / 数据填充 / 撤销）→ 刷新显示
                const textareaUpdateListener = (/** @type {Event} */ e) => {
                    if (e instanceof CustomEvent && textInput instanceof HTMLTextAreaElement) {
                        textInput.value = e.detail?.value ?? '';
                    }
                };
                prop.addEventListener('update', textareaUpdateListener);
                listeners.push({ target: prop, type: 'update', listener: textareaUpdateListener });

                // 实时同步：开启时每次键入即通知绑定（供文本变量↔字段即时同步）
                const textareaInputListener = (/** @type {Event} */ e) => {
                    const target = e.target;
                    if (target instanceof HTMLTextAreaElement && isRealtimeTextSyncEnabled()) {
                        prop.emit('text:input', { value: target.value });
                    }
                };
                textInput.addEventListener('input', textareaInputListener);
                listeners.push({ target: textInput, type: 'input', listener: textareaInputListener });

                preView.appendChild(textInput);
                break;
            }
            case 'icon': {
                const placeholder = this.getPlaceholderImage();
                const icon = /** @type {HTMLImageElement} */ (this.createElement('img', {
                    src: prop.value || placeholder,
                }));
                // 图片加载失败（src 无效/404）时回退占位图，仅回退一次
                let fallbackApplied = false;
                icon.addEventListener('error', () => {
                    if (!fallbackApplied) {
                        fallbackApplied = true;
                        icon.src = placeholder;
                    }
                });
                const iconUpdateListener = (/** @type {Event} */ e) => {
                    if (e instanceof CustomEvent) {
                        fallbackApplied = false;
                        icon.src = e.detail?.value || placeholder;
                    }
                };
                prop.addEventListener('update', iconUpdateListener);
                listeners.push({ target: prop, type: 'update', listener: iconUpdateListener });
                preView.appendChild(icon);
                preView.classList.add('icon');
                break;
            }

            case 'image': {
                const placeholder = this.getPlaceholderImage();
                const img = /** @type {HTMLImageElement} */ (this.createElement('img', {
                    src: prop.value || placeholder,
                }));
                // 图片加载失败（src 无效/404）时回退占位图，仅回退一次
                let fallbackApplied = false;
                img.addEventListener('error', () => {
                    if (!fallbackApplied) {
                        fallbackApplied = true;
                        img.src = placeholder;
                    }
                });
                const imageUpdateListener = (/** @type {Event} */ e) => {
                    if (e instanceof CustomEvent) {
                        fallbackApplied = false;
                        img.src = e.detail?.value || placeholder;
                    }
                };
                prop.addEventListener('update', imageUpdateListener);
                listeners.push({ target: prop, type: 'update', listener: imageUpdateListener });
                preView.appendChild(img);
                break;
            }

            case 'table': {
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
        }

        return { element: preView, listeners: listeners };
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
