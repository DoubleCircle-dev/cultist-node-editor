import { EventBus } from '../types/eventBus.js';
import { ControllerCore } from './controllerCore.js';
import { IManager } from './manager.js';

/** 菜单序号：每次新建菜单换一个 id，`_appendMenu` 靠它判断要不要重挂 */
let MENU_SERIAL = 0;

/**
 * 菜单项描述（数据式菜单的输入格式）
 *
 * 调用方只描述「有什么项、点了干什么」，DOM 与交互（定位 / 关闭 / 键盘）全在这里，
 * 免得各处重复 `createElement` 拼菜单。
 *
 * @typedef {object} MenuItemSpec
 * @property {string} [label] - 主文本（只有 `note` / `separator` 时可以不给）
 * @property {string} [hint] - 第二行小字说明
 * @property {string} [shortcut] - 右侧快捷键提示（只是展示）
 * @property {string} [icon] - 左侧图标字符
 * @property {boolean} [disabled] - 置灰不可点
 * @property {boolean} [danger] - 危险操作（红色）
 * @property {boolean} [checked] - 带勾选标记（开关型项）
 * @property {boolean} [separator] - 在本项**上方**画分隔线
 * @property {string} [note] - 纯说明行（不可点，只占位）
 * @property {string} [id] - 便于测试与调试
 * @property {(api: { close: () => void; position: { x: number; y: number } | null }) => void} [onSelect] - 点击回调
 */

export class MenuManager extends IManager {
    /**
     * @param {EventBus} bus - 事件总线，用于管理器间的通信
     * @param {HTMLElement} viewport - 视口元素，用于容纳节点
     * @param {HTMLElement} world - 画布元素，用于渲染节点
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus, viewport, world, coreSpace);

        /** @type {HTMLElement | null} */
        this.menu = null;

        /** 最近一次 `showContextMenu` 的位置（回调里要用来做「在鼠标处新建节点」这类事） */
        /** @type {{ x: number; y: number } | null} */
        this.position = null;

        this.menuContainer = this._createMenuContainer();
        this.viewport.appendChild(this.menuContainer);

        /** @type {listenerMap[]} */
        this.listenerMaps = this._initListeners();

        this._onEvent();
    }

    /** @private */
    _initListeners() {
        /** @type {listenerMap[]} listener */
        const listeners = [];

        listeners.push(this.autoBind(document, 'mousedown', this._onMouseDown));
        listeners.push(this.autoBind(document, 'keydown', this._onKeyDown));
        return listeners;
    }

    /**
     * @private 点空白处关菜单
     *
     * ⚠️ 点**菜单内部**不能关：mousedown 一摘 `active`，菜单就被 `display:none` 了，
     * 之后的 click 不会触发 → 菜单项静默失效（合并按钮"没反应"就是这个原因）。
     *
     * @param {Event} e
     * @returns {void}
     */
    _onMouseDown(e) {
        const target = /** @type {Node | null} */ (e.target);
        if (target && this.menuContainer.contains(target)) return;
        this.menuContainer.classList.remove('active');
    }

    /**
     * @private 菜单打开时的键盘操作：Esc 关、上下键在可点项之间走
     *
     * @param {KeyboardEvent} e
     * @returns {void}
     */
    _onKeyDown(e) {
        if (!this.isOpen) return;
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.closeMenu();
            return;
        }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

        const items = [...this.menuContainer.querySelectorAll('.context-menu-item:not(.is-disabled)')].filter(
            (el) => el instanceof HTMLElement
        );
        if (!items.length) return;
        e.preventDefault();
        const current = items.findIndex((el) => el === document.activeElement);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const next = current < 0 ? (step > 0 ? 0 : items.length - 1) : (current + step + items.length) % items.length;
        items[next].focus();
    }

    /**
     * 在指定屏幕位置弹出一个**数据描述式**菜单
     *
     * 调用方只描述「有什么项、点了干什么」，DOM 与交互（挂载 / 定位 / 关闭 / 键盘）都在这里，
     * 免得各处重复 `createElement` 拼菜单。
     *
     * @param {MenuItemSpec[]} items - 菜单项（普通项 / `separator` / `note` 混排）
     * @param {{ x: number; y: number } | null} [position] - 屏幕坐标（clientX / clientY）
     * @returns {HTMLElement | null} 菜单元素（没有可显示项 = null）
     */
    showContextMenu(items, position = null) {
        const list = (Array.isArray(items) ? items : []).filter(Boolean);
        if (!list.length) return null;

        MENU_SERIAL += 1;
        const menu = this._buildMenu(list, `context-menu-${MENU_SERIAL}`);
        this.position = position ? { x: position.x || 0, y: position.y || 0 } : null;
        this._appendMenu(menu, menu.id);
        this.openMenu();
        this._positionAt(this.menuContainer, this.position);
        return menu;
    }

    /**
     * @private 按描述拼出菜单 DOM
     *
     * @param {MenuItemSpec[]} items - 菜单项
     * @param {string} id - 菜单元素 id
     * @returns {HTMLElement} 菜单元素
     */
    _buildMenu(items, id) {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.id = id;
        menu.setAttribute('role', 'menu');

        items.forEach((spec) => {
            if (spec.separator && menu.lastChild) menu.appendChild(this._createSeparator());

            // 纯说明行：不可点，只用来解释「为什么没有某个操作」
            if (!spec.label && spec.note) {
                const note = document.createElement('div');
                note.className = 'context-menu-note';
                note.textContent = spec.note;
                menu.appendChild(note);
                return;
            }
            if (!spec.label) return;

            menu.appendChild(this._buildItem(spec));
        });

        return menu;
    }

    /**
     * @private 拼一个菜单项
     *
     * @param {MenuItemSpec} spec - 菜单项描述
     * @returns {HTMLElement} 菜单项（button）
     */
    _buildItem(spec) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'context-menu-item';
        item.setAttribute('role', 'menuitem');
        if (spec.id) item.dataset.itemId = spec.id;
        if (spec.disabled) item.classList.add('is-disabled');
        if (spec.danger) item.classList.add('is-danger');
        if (spec.checked) item.classList.add('is-checked');
        item.disabled = Boolean(spec.disabled);

        if (spec.icon) {
            const icon = document.createElement('span');
            icon.className = 'menu-icon';
            icon.textContent = spec.icon;
            item.appendChild(icon);
        }

        const body = document.createElement('span');
        body.className = 'menu-body';
        const label = document.createElement('span');
        label.className = 'menu-label';
        label.textContent = spec.label;
        body.appendChild(label);
        if (spec.hint) {
            const hint = document.createElement('span');
            hint.className = 'menu-hint';
            hint.textContent = spec.hint;
            body.appendChild(hint);
        }
        item.appendChild(body);

        if (spec.shortcut) {
            const key = document.createElement('span');
            key.className = 'menu-shortcut';
            key.textContent = spec.shortcut;
            item.appendChild(key);
        }

        item.addEventListener('click', () => {
            if (spec.disabled) return;
            this.closeMenu();
            if (typeof spec.onSelect === 'function') {
                spec.onSelect({ close: () => this.closeMenu(), position: this.position });
            }
        });
        return item;
    }

    /** @private */
    _createSeparator() {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        return sep;
    }

    /**
     * @private 把菜单摆到鼠标位置
     *
     * ⚠️ `position` 是屏幕坐标（clientX / clientY），而 `left/top` 是相对 viewport 的：
     * 忘了减 viewport 偏移，有工具栏 / 多页面标签时菜单会跑到画布外。
     * 再夹在视口内，免得贴边弹出时被截断。
     *
     * @param {HTMLElement} container - 菜单容器
     * @param {{ x: number; y: number } | null} position - 屏幕坐标
     * @returns {void}
     */
    _positionAt(container, position) {
        if (!position) return;
        const viewRect = this.viewport.getBoundingClientRect();
        const menuRect = container.getBoundingClientRect();
        const maxX = Math.max(0, this.viewport.clientWidth - menuRect.width - 8);
        const maxY = Math.max(0, this.viewport.clientHeight - menuRect.height - 8);
        const posX = (position.x || 0) - viewRect.left + 20;
        const posY = (position.y || 0) - viewRect.top + 20;
        container.style.left = Math.min(Math.max(0, posX), maxX) + 'px';
        container.style.top = Math.min(Math.max(0, posY), maxY) + 'px';
    }

    /** @private */
    _onEvent() {
        this.listenerMaps.push(this.autoBind(this.bus, 'toggleMenu', this._toggleMenu));
    }

    /**
     * @private
     *
     * 两种语义：
     *   - `menuId` 和当前挂着的是同一个 → 收起（「修改可选属性」按钮的开关行为）
     *   - 不同（或还没有菜单）→ **总是打开**。盲目 toggle 会让「右键 A 再右键 B」变成关菜单。
     *
     * @param {Event} e
     */
    _toggleMenu(e) {
        const ce = /** @type {CustomEvent} */ (e);
        const detail = ce.detail || {};

        if (detail.menuId && this.menu && detail.menuId === this.menu.id) {
            this.closeMenu();
            return;
        }

        // 先挂内容再定位：菜单尺寸要等内容进去才能量
        this._appendMenu(detail.menu, detail.menuId);
        this.openMenu();

        if (detail.position) {
            this.position = { x: detail.position.x || 0, y: detail.position.y || 0 };
            this._positionAt(this.menuContainer, this.position);
        }
    }

    openMenu() {
        this.menuContainer.classList.add('active');
    }

    closeMenu() {
        this.menuContainer.classList.remove('active');
    }

    /** 菜单当前是否打开 */
    get isOpen() {
        return this.menuContainer.classList.contains('active');
    }

    /**
     * @private
     * @param {HTMLElement} menu
     * @param {string} menuId
     */
    _appendMenu(menu, menuId) {
        if (!menu) {
            return;
        }

        if (menuId && menuId === this.menu?.id) {
            return;
        }

        this.menuContainer.innerHTML = '';
        this.menuContainer.appendChild(menu);
        this.menu = menu;
    }

    /** @private */
    _createMenuContainer() {
        const container = document.createElement('div');
        container.classList.add('menu-container');
        container.setAttribute('role', 'menu');
        return container;
    }
}
