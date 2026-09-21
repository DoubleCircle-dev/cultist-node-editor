import { NodeModel } from '../models/nodeModels/nodeModel.js';
import { PropView } from '../generators/propViewGenerator.js';
import { IView } from '../types/IView.js';

/**
 * 内联节点用的图标与徽标规格 —— 照抄 ComfyUI（Comfy-Org/ComfyUI_frontend）的实现：
 *
 * - **子图图标**（`SubgraphNode.drawTitleBox`）：普通节点在标题左侧画类型色圆点，
 *   子图节点改画一个 **#3b82f6 的圆角块**（`roundRect(6, -24.5, 22, 20, 5)`）+ 白色工作流图形；
 * - **计数徽标**（`LGraphBadge`）：白字 / 深色底（`#0F1F0F`）、圆角 5、高 20、内边距 6、字号 12，
 *   画在节点右上角 —— ComfyUI 里子图节点的「内部有几个 API 节点」就是这么报的（`badgeSystem.ts`）；
 * - **进入按钮**（`addTitleButton({ name: 'enter_subgraph', text: 'pi-window-maximize 图标字形' })`）：
 *   标题栏右侧的图标按钮，点击进入子图。我们这里改成内联展开（只展开一层）。
 *
 * @see https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/lib/litegraph/src/subgraph/SubgraphNode.ts
 */
const SUBGRAPH_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path stroke="white" stroke-linecap="round" stroke-width="1.3" d="M9.18613 3.09999H6.81377M9.18613 12.9H7.55288c-3.08678 0-5.35171-2.99581-4.60305-6.08843l.3054-1.26158M14.7486 2.1721l-.5931 2.45c-.132.54533-.6065.92789-1.1508.92789h-2.2993c-.77173 0-1.33797-.74895-1.1508-1.5221l.5931-2.45c.132-.54533.6065-.9279 1.1508-.9279h2.2993c.7717 0 1.3379.74896 1.1508 1.52211Zm-8.3033 0-.59309 2.45c-.13201.54533-.60646.92789-1.15076.92789H2.4021c-.7717 0-1.33793-.74895-1.15077-1.5221l.59309-2.45c.13201-.54533.60647-.9279 1.15077-.9279h2.29935c.77169 0 1.33792.74896 1.15076 1.52211Zm8.3033 9.8-.5931 2.45c-.132.5453-.6065.9279-1.1508.9279h-2.2993c-.77173 0-1.33797-.749-1.1508-1.5221l.5931-2.45c.132-.5453.6065-.9279 1.1508-.9279h2.2993c.7717 0 1.3379.7489 1.1508 1.5221Z"/></svg>`;

/** 「展开内部」图标（lucide maximize-2，对齐 ComfyUI 的 pi-window-maximize） */
const ICON_EXPAND =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';

/** 「收起内部」图标（lucide minimize-2） */
const ICON_COLLAPSE =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';

/** 容器背景框的最小尺寸（拖动缩放时夹住） */
const MIN_CONTAINER_WIDTH = 220;
const MIN_CONTAINER_HEIGHT = 120;

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

        /** @type {{ element: Element; event: string; handler: EventListenerOrEventListenerObject }[]} */
        this.domListeners = [];

        /**
         * 内联节点（复合）视图状态：`redraw()` 重建 DOM 后要按它重放外观
         * （徽标 / 计数面板 / 转发端口保留）。由 `setCompositeView` 写入。
         *
         * @private
         * @type {{ collapsed: boolean; children: any[]; nestedIds: Set<string> | string[]; level: number; onToggle: (() => void) | null } | null}
         */
        this._containerState = null;

        /**
         * 子节点归属浮标的状态（`redraw()` 后重放）
         *
         * @private
         * @type {{ text: string; title?: string; color?: string; level?: number } | null}
         */
        this._inlineTagState = null;

        // 创建DOM元素并赋值给实例属性
        this.element = this._createDOM();

        this._initListeners();
    }

    /**
     * @private
     * @param {Event} evt
     */
    _onPositionUpdate = (evt) => {
        const e = /** @type {CustomEvent<{ x: number | string; y: number | string }>} */ (evt);
        const { x, y } = e.detail;
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
    };

    /**
     * @private
     * @param {Event} evt
     */
    _onPropertyUpdate = (evt) => {
        const e = /** @type {CustomEvent<{ key: string; value: any }>} */ (evt);
        this._updateInputDisplay(e.detail.key, e.detail.value);
    };

    /**
     * @private
     * @param {Event} evt
     */
    _onSelectUpdate = (evt) => {
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
    _onRectUpdate = (evt) => {
        const e = /** @type {CustomEvent<{ width: number; height: number }>} */ (evt);
        this.element.style.width = e.detail.width + 'px';
        this.element.style.height = e.detail.height + 'px';
    };

    /** @private */
    _onModeUpdate = () => {
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
        this.model.addEventListener('update:position', this._onPositionUpdate);
        this.model.addEventListener('update:property', this._onPropertyUpdate);
        this.model.addEventListener('update:select', this._onSelectUpdate);
        this.model.addEventListener('update:rect', this._onRectUpdate);
        this.model.addEventListener('update:mode', this._onModeUpdate);
        this.model.addEventListener('redraw', this._redraw);
        this.element.addEventListener('mousedown', this._onMouseDown);
    }

    // 卸载所有监听器
    removeListeners() {
        super.removeListeners();
        if (this.model) {
            this.model.removeEventListener('update:position', this._onPositionUpdate);
            this.model.removeEventListener('update:property', this._onPropertyUpdate);
            this.model.removeEventListener('update:select', this._onSelectUpdate);
            this.model.removeEventListener('update:rect', this._onRectUpdate);
            this.model.removeEventListener('update:mode', this._onModeUpdate);
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

        // 引用副本（ref）：只读副本，只提供端口用于布线；样式照容器节点的展开态
        if (this.model.type === 'ref') {
            element.classList.add('node-ref');
            element.title = '引用副本：只读副本，端口上拖出的连线落在原节点上';
        }

        // 悬空端口（文件外目标的占位节点）：只有端口，标题栏只留一个只读文本，明细走 hover
        if (this.model.type === 'danglingPort') {
            element.classList.add('node-dangling');
            this.refreshDanglingTooltip();

            const refs = this.model.danglingRefs || [];
            const jumpHandler = () => {
                this.model.emit('jump:target', {
                    category: this.model.danglingCategory || (refs[0] && refs[0].category) || '',
                    targetId: this.model.title,
                });
            };
            element.addEventListener('dblclick', jumpHandler);
            this.domListeners.push({ element, event: 'dblclick', handler: jumpHandler });
        }

        element.appendChild(this._createHeader());

        // 引用副本：标题栏建好之后才能挂「⌖ 定位原节点」按钮（否则找不到 .node-header）
        if (this.model.type === 'ref') this._ensureRefFocusButton(element);

        element.appendChild(this._createProperties());

        // 右键菜单：必须用 contextmenu 而不是 mousedown ——
        // mousedown 会先冒泡到 document，被 MenuManager 的「点空白关菜单」吃掉，菜单刚开就被关。
        const contextMenuHandler = (/** @type {MouseEvent} */ e) => {
            e.preventDefault();
            e.stopPropagation();
            this.model.emit('contextmenu', {
                originalEvent: e,
                nodeId: this.model.id,
                position: { x: e.clientX, y: e.clientY },
            });
        };
        element.addEventListener('contextmenu', contextMenuHandler);
        this.domListeners.push({ element, event: 'contextmenu', handler: contextMenuHandler });

        // 聚焦节点使其可接收键盘事件
        element.tabIndex = 0;

        return element;
    }

    /** @private */
    _createHeader() {
        const header = document.createElement('div');
        header.className = 'node-header';

        // 悬空端口：不建可编辑输入框，只显示目标 id（标题是数据里的目标，改它没意义）
        if (this.model.type === 'danglingPort') {
            header.classList.add('node-header-dangling');
            const target = document.createElement('span');
            target.className = 'node-dangling-target';
            target.textContent = this.model.title || '';
            header.appendChild(target);
            return header;
        }

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
            const newTitle = target?.value;
            if (!newTitle) {
                this.model.emit('change:title:empty', {});
            }
            this.model.title = newTitle;
            this.model.emit('change:title:success', {});
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
            const newLabel = target?.value;

            this.model.label = newLabel;
            this.model.emit('change:label:success', {});
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
            // 引用副本：属性区是**只读预览**（值随源节点同步，但这里改不动）。
            // hub 也要锁（「按原节点复制」时属性是分组摆放的，值属性藏在 hub 里）；
            // 端口行由 `_lockReadonly` 里的 `_isPortControl` 单独放过，所以锁了也不影响连线。
            if (this.model.type === 'ref') {
                this._lockReadonly(propView.element);
            }
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

    /**
     * @private 引用副本的「定位原节点」按钮（标题栏右侧）
     *
     * 点击 → `model.emit('ref:focus')` → 控制器把视野移到源节点并高亮（`ControllerCore.focusNode`）。
     * 按钮上带 title 提示，⌖ 一眼看出是「跳过去」。
     *
     * @param {HTMLElement} element - 节点根元素
     * @returns {void}
     */
    _ensureRefFocusButton(element) {
        const header = element.querySelector('.node-header');
        if (!header || header.querySelector('.node-ref-focus')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'node-ref-focus';
        btn.textContent = '⌖';
        btn.title = '定位原节点（跳到被引用的那个节点）';

        const onClick = (/** @type {MouseEvent} */ e) => {
            // 别把点击传给节点（否则会变成拖节点 / 选中）
            e.stopPropagation();
            e.preventDefault();
            this.model.emit('ref:focus', { refId: this.model.id });
        };
        btn.addEventListener('click', onClick);
        this.domListeners.push({ element: btn, event: 'click', handler: onClick });
        header.appendChild(btn);
    }

    /**
     * @private 把一小块 DOM 里的交互控件锁成**纯预览**（引用副本的属性区用）
     *
     * ⚠️ `readOnly` 只对文本类输入生效：`range`（滑杆）/ `radio` / `checkbox` 必须用 `disabled`，
     * 否则用户还能拖滑杆、点单选 —— 看上去像“改到了引用节点”。

     * ⚠️ 端口行里的控件（`.prop-row.type-port` 的端口按钮等）一律跳过 —— 副本的用途就是连线。
     *
     * @param {HTMLElement} element - 属性行元素
     * @returns {void}
     */
    _lockReadonly(element) {
        element.classList.add('is-readonly');

        // 文本类：只读；其它类型的 input（滑杆 / 单选 / 复选 / 颜色 / 文件）只能 disabled
        element.querySelectorAll('input, textarea').forEach((item) => {
            if (this._isPortControl(item)) return; // 端口行留给连线（副本只用于连接）
            const control = /** @type {any} */ (item);
            const type = String(control.type || '').toLowerCase();
            const readonlyWorks = type === '' || type === 'text' || type === 'number' || type === 'search';
            if (readonlyWorks) {
                control.readOnly = true;
            } else {
                control.disabled = true;
            }
            control.tabIndex = -1;
        });

        element.querySelectorAll('select, button').forEach((item) => {
            if (this._isPortControl(item)) return;
            /** @type {any} */ (item).disabled = true;
            item.tabIndex = -1;
        });

        // 可编辑块（如某些自定义控件）一并封死
        element.querySelectorAll('[contenteditable="true"]').forEach((item) => {
            if (this._isPortControl(item)) return;
            item.setAttribute('contenteditable', 'false');
        });
    }

    /**
     * @private 这个控件是不是「端口行」里的（端口按钮 / 端口值输入）
     *
     * ⚠️ 端口行**不能锁**：引用副本的用途就是拉线，把端口按钮也 disabled 掉就废了。
     *
     * @param {Element} element - 待检查的控件
     * @returns {boolean} 是否在端口行里
     */
    _isPortControl(element) {
        return !!(element && typeof element.closest === 'function' && element.closest('.prop-row.type-port'));
    }

    /** @private */
    _updateInputDisplay(key, value) {}

    /**
     * 重算悬空端口的 hover 明细（引用它的宿主字段列表）
     *
     * ⚠️ `_createDOM` 时 `model.danglingRefs` 可能还没挂上（由 ControllerCore 建完节点后补），
     * 所以单独留一个方法，挂上明细后再刷一次。
     */
    refreshDanglingTooltip() {
        if (!this.element || this.model.type !== 'danglingPort') return;
        const refs = this.model.danglingRefs || [];
        const where = refs
            .map((ref) => `${ref.category || ''}:${ref.id || ''}.${ref.field || ''}`)
            .filter(Boolean)
            .join('\n');
        this.element.title = `${
            where ? `未实现的目标：${this.model.title}\n被引用于：\n${where}` : `未实现的目标：${this.model.title}`
        }\n（双击跳转）`;
    }

    /**
     * 容器节点视图（对齐 ComfyUI 的 subgraph 容器）
     *
     * - **展开态**：整个节点变成一块**半透明背景框**（只有 title 栏与右下角可交互，背景不吃鼠标事件），
     *   成员节点就在框里、位置由用户自由调；正文区不渲染任何属性。
     * - **收起态**：缩回普通卡片，只显示**转发端口**与**透传属性**（每个来源节点一个带标签的 Hub）。
     *
     * 标题栏保持 ComfyUI 那套：蓝色子图图标（`drawTitleBox`）+ 成员计数徽标（`LGraphBadge`）
     * + 右侧图标按钮（`enter_subgraph` 标题按钮）。
     *
     * 视图状态存进 `this._containerState`，`redraw()` 重建 DOM 后会自动重放。
     *
     * @param {{ collapsed?: boolean; rect?: { w: number; h: number } | null; memberCount?: number; level?: number; minSize?: { w: number; h: number } | null; onToggle?: (() => void) | null; onResizeEnd?: ((size: { width: number; height: number }) => void) | null }} options
     *   - `rect` 展开态的背景框尺寸（收起态传什么都不用，卡片尺寸由内容决定）
     *   - `memberCount` 成员节点数量（计数徽标）
     *   - `level` 嵌套层级（1 = 顶层容器，>1 = 容器套容器）
     *   - `minSize` 框的**最小尺寸**：由控制器按「包住全部成员」算出来，缩放时夹住不让再小
     *   - `minSizeFn` 同上，但**拖动时每帧现算**（成员动过 / 尺寸刚变过都能马上生效）
     *   - `toWorld` 屏幕坐标 → 世界坐标（画布的平移 / 缩放参数在控制器里，缩放句柄借用它才跟手）
     *   - `onResizeEnd` 缩放结束时回调（控制器用它记尺寸并把跑到框外的成员夹回来）
     * @returns {any} 存下来的视图状态
     */
    setContainerView(options = {}) {
        const {
            collapsed = true,
            rect = null,
            memberCount = 0,
            level = 1,
            minSize = null,
            minSizeFn = null,
            toWorld = null,
            onToggle = null,
            onResizeEnd = null,
        } = options;
        this._containerState = {
            collapsed: Boolean(collapsed),
            rect: rect && rect.w ? rect : null,
            memberCount: Number(memberCount) || 0,
            level: Number(level) || 1,
            minSize: minSize && minSize.w ? minSize : null,
            minSizeFn,
            toWorld,
            onToggle,
            onResizeEnd,
        };
        this._renderContainer();
        return this._containerState;
    }

    /**
     * 摘掉容器节点外观（背景框 / 缩放句柄 / 徽标 / 按钮），回到普通节点
     *
     * `ControllerCore.splitContainer()` 拆开容器时调；状态记在 `_containerState`，这里也一并清掉，
     * 否则 `redraw()` 会把旧外观又重放回来。
     *
     * @returns {void}
     */
    clearContainerView() {
        this._containerState = null;
        const element = this.element;
        if (!element) return;
        element.classList.remove('node-container', 'node-container-expanded', 'node-container-collapsed');
        element.querySelector('.node-badges')?.remove();
        element.querySelector('.node-composite-toggle')?.remove();
        element.querySelector('.node-container-resize')?.remove();
        element.style.width = '';
        element.style.height = '';

        // 换回普通节点的类型图标（子图图标占用了同一个 .node-icon 位置）
        const icon = /** @type {HTMLElement | null} */ (element.querySelector('.node-icon'));
        if (icon && icon.dataset.subgraph === '1') {
            delete icon.dataset.subgraph;
            icon.classList.remove('node-icon-subgraph');
            icon.innerHTML = '';
            icon.textContent = this.model.icon || '⚡';
        }
        if (typeof this.onMounted === 'function') this.onMounted();
    }

    /**
     * 成员归属浮标：在节点左上角浮出一个小徽标（`↳ 容器标题`），表示它属于哪个容器
     *
     * ⚠️ 标签是**绝对定位的浮标**，不占文档流 —— 不改变节点高度，也就不会让端口位置漂移。
     *
     * @param {{ text: string; title?: string; color?: string; level?: number } | null} options - 传 `null` 摘掉标签
     * @returns {void}
     */
    setMemberTag(options = null) {
        const element = this.element;
        if (!element) return;
        /** @type {HTMLElement | null} */
        let tag = element.querySelector('.node-member-tag');

        if (!options) {
            this._inlineTagState = null;
            if (tag) tag.remove();
            element.classList.remove('node-container-member');
            return;
        }

        this._inlineTagState = options;
        element.classList.add('node-container-member');
        if (!tag) {
            tag = document.createElement('div');
            tag.className = 'node-member-tag';
            element.appendChild(tag);
        }
        tag.textContent = options.text;
        tag.title = options.title || options.text;
        tag.style.setProperty('--member-tag-color', options.color || 'var(--accent-purple)');
    }

    /**
     * @private 按 `this._containerState` 重画容器外观（背景框 / 卡片 + 徽标 + 缩放句柄）
     *
     * @returns {void}
     */
    _renderContainer() {
        const element = this.element;
        const state = this._containerState;
        if (!element || !state) return;

        const collapsed = Boolean(state.collapsed);
        element.classList.add('node-container');
        element.classList.toggle('node-container-expanded', !collapsed);
        element.classList.toggle('node-container-collapsed', collapsed);

        this._applySubgraphIcon(element);
        this._renderSubgraphBadges(element, state);

        const btn = this._ensureToggleButton(element);
        btn.innerHTML = collapsed ? ICON_EXPAND : ICON_COLLAPSE;
        btn.title = collapsed ? '展开容器（显示背景框）' : '收起容器（只留转发端口与透传属性）';
        btn.setAttribute('aria-expanded', String(!collapsed));

        if (collapsed) {
            // 卡片尺寸由内容决定：把背景框留下的行内尺寸清掉，让 onMounted 重新量
            this._removeResizeHandle(element);
            element.style.width = '';
            element.style.height = '';
            return;
        }

        // 背景框：按记下来的尺寸铺开，右下角可拖拽缩放
        if (state.rect) {
            element.style.width = `${state.rect.w}px`;
            element.style.height = `${state.rect.h}px`;
        }
        this._ensureResizeHandle(element);
    }

    /**
     * @private 背景框右下角的缩放手柄（拖动改 `model` 的宽高，也就改了背景框大小）
     *
     * ⚠️ 位移必须走画布的**世界坐标换算**（`toWorld`）：鼠标位移是屏幕像素，
     * 画布缩放 50% 时就该放大一倍才跟手；自己除一个「以为的」缩放系数（曾错读过 dataset）会越拖越偏。
     *
     * @param {HTMLElement} element - 节点根元素
     * @returns {HTMLElement} 句柄元素
     */
    _ensureResizeHandle(element) {
        /** @type {HTMLElement | null} */
        let handle = element.querySelector('.node-container-resize');
        if (handle) return handle;

        handle = document.createElement('div');
        handle.className = 'node-container-resize';
        handle.title = '拖动缩放容器';

        const downHandler = (/** @type {MouseEvent} */ e) => {
            e.stopPropagation();
            e.preventDefault();
            const state = this._containerState;
            const toWorld =
                state && typeof state.toWorld === 'function' ? state.toWorld : (x, y) => ({ x, y });
            const start = toWorld(e.clientX, e.clientY);
            const startW = element.offsetWidth;
            const startH = element.offsetHeight;

            const moveHandler = (/** @type {MouseEvent} */ ev) => {
                const point = toWorld(ev.clientX, ev.clientY);
                // 最小尺寸：既不能小于硬下限，也不能小于「包住全部成员」的尺寸（否则成员会露到框外）。
                // 现算优先：拖之前成员动过 / 刚缩放完，快照会过期。
                const live = state && typeof state.minSizeFn === 'function' ? state.minSizeFn() : null;
                const limit = live && live.w ? live : state && state.minSize;
                const minW = Math.max(MIN_CONTAINER_WIDTH, (limit && limit.w) || 0);
                const minH = Math.max(MIN_CONTAINER_HEIGHT, (limit && limit.h) || 0);
                const w = Math.max(minW, startW + (point.x - start.x));
                const h = Math.max(minH, startH + (point.y - start.y));
                element.style.width = `${Math.round(w)}px`;
                element.style.height = `${Math.round(h)}px`;
                this.model.setRect(Math.round(w), Math.round(h));
                if (state) state.rect = { w: Math.round(w), h: Math.round(h) };
            };
            const upHandler = () => {
                window.removeEventListener('mousemove', moveHandler);
                window.removeEventListener('mouseup', upHandler);
                const size = { width: this.model.width, height: this.model.height };
                if (state && typeof state.onResizeEnd === 'function') state.onResizeEnd(size);
                this.model.emit('container:resized', size);
            };
            window.addEventListener('mousemove', moveHandler);
            window.addEventListener('mouseup', upHandler);
        };

        handle.addEventListener('mousedown', downHandler);
        this.domListeners.push({ element: handle, event: 'mousedown', handler: downHandler });
        element.appendChild(handle);
        return handle;
    }

    /**
     * @private 摘掉缩放手柄（收起态不需要）
     *
     * @param {HTMLElement} element - 节点根元素
     * @returns {void}
     */
    _removeResizeHandle(element) {
        element.querySelector('.node-container-resize')?.remove();
    }

    /**
     * @private 标题左侧的子图图标（对齐 ComfyUI `SubgraphNode.drawTitleBox`：蓝色圆角块 + 工作流图形）
     *
     * @param {HTMLElement} element - 节点根元素
     * @returns {void}
     */
    _applySubgraphIcon(element) {
        const icon = /** @type {HTMLElement | null} */ (element.querySelector('.node-icon'));
        if (!icon) return;
        icon.classList.add('node-icon-subgraph');
        icon.title = '容器节点（相当于 ComfyUI 的 subgraph）';
        if (icon.dataset.subgraph !== '1') {
            icon.dataset.subgraph = '1';
            icon.innerHTML = SUBGRAPH_ICON;
        }
    }

    /**
     * @private 标题栏右侧的计数徽标（对齐 ComfyUI `LGraphBadge` / `badgeSystem.ts`）
     *
     * 「内部有几个节点」在 ComfyUI 里就是一条节点徽标（子图报 API 节点数），这里同款：
     * 成员数 + 嵌套层级，窄卡片上宁可省略也不要撑破标题行。
     *
     * @param {HTMLElement} element - 节点根元素
     * @param {any} state - `this._containerState`
     * @returns {void}
     */
    _renderSubgraphBadges(element, state) {
        const badges = this._ensureBadges(element);

        this._setBadge(badges, 'count', `${state.memberCount} 个节点`, '容器里的成员节点数量');
        // 层级只在嵌套（>1）时显示：顶层容器不必挂个 L1
        this._setBadge(
            badges,
            'level',
            state.level > 1 ? `L${state.level}` : '',
            `嵌套层级 ${state.level}（这个容器自己也在另一个容器里）`
        );
        this._setBadge(
            badges,
            'nested',
            '',
            ''
        );
    }

    /**
     * @private 写一条徽标（空文本 = 不显示）
     *
     * @param {HTMLElement} container - 徽标容器
     * @param {string} kind - 徽标种类（`count` / `level` / `nested`）
     * @param {string} text - 徽标文字
     * @param {string} title - 悬停说明
     * @returns {void}
     */
    _setBadge(container, kind, text, title) {
        /** @type {HTMLElement | null} */
        let badge = container.querySelector(`.node-badge-${kind}`);
        if (!text) {
            if (badge) badge.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement('span');
            badge.className = `node-badge node-badge-${kind}`;
            container.appendChild(badge);
        }
        badge.textContent = text;
        badge.title = title;
    }

    /**
     * @private 标题栏右侧的图标按钮（对齐 ComfyUI `addTitleButton({ name: 'enter_subgraph' })`），已存在就复用
     *
     * @param {HTMLElement} element - 节点根元素
     * @returns {HTMLButtonElement} 按钮
     */
    _ensureToggleButton(element) {
        /** @type {HTMLButtonElement | null} */
        let btn = element.querySelector('.node-fold-toggle');
        if (btn) return btn;

        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'node-fold-toggle';
        const clickHandler = (e) => {
            e.stopPropagation();
            const state = this._containerState;
            if (state && typeof state.onToggle === 'function') state.onToggle();
        };
        const downHandler = (e) => e.stopPropagation();
        btn.addEventListener('click', clickHandler);
        btn.addEventListener('mousedown', downHandler);
        this.domListeners.push(
            { element: btn, event: 'click', handler: clickHandler },
            { element: btn, event: 'mousedown', handler: downHandler }
        );

        const title = element.querySelector('.node-title');
        (title || element).appendChild(btn);
        return btn;
    }

    /**
     * @private 标题栏里的徽标容器，已存在就复用
     *
     * @param {HTMLElement} element - 节点根元素
     * @returns {HTMLElement} 徽标容器
     */
    _ensureBadges(element) {
        /** @type {HTMLElement | null} */
        let container = element.querySelector('.node-badges');
        if (!container) {
            container = document.createElement('div');
            container.className = 'node-badges';
            const title = element.querySelector('.node-title');
            (title || element).appendChild(container);
        }
        return container;
    }

    redraw() {
        const world = this.element.parentElement;

        // 修复：原代码调用不存在的 this._removeListeners()，必然抛 TypeError
        // 改为 removeListeners()，统一清理模型/DOM/prop 三层监听器后再重建
        this.removeListeners();
        this.element.remove();
        this.propListeners = [];
        this.domListeners = [];

        this.element = this._createDOM();
        this._initListeners();
        world?.appendChild(this.element);
        // 重建后重放内联节点外观（换配色 / 加转发端口都会走到这里）
        if (this._containerState) this._renderContainer();
        if (this._inlineTagState) this.setMemberTag(this._inlineTagState);
        // 重建后重新测量尺寸，保证 model.width/height 与 DOM 一致
        this.onMounted();
    }

    /**
     * 节点视图销毁：移除全部监听器、从 DOM 摘除、切断模型引用
     * 由 NodeManager 在节点删除/清空画布时调用，一次性释放视图资源
     */
    dispose() {
        this.removeListeners();
        this.element?.remove();
        // 置空引用，打破 view ↔ model 的强引用环，加速 GC
        this.model = /** @type {any} */ (null);
        this.element = /** @type {any} */ (null);
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
