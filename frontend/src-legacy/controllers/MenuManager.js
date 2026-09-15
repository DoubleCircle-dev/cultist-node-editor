import { EventBus } from '../types/eventBus.js';
import { ControllerCore } from './controllerCore.js';
import { IManager } from './manager.js';

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
        return listeners;
    }

    /**
     * @private
     * @param {Event} e
     */
    _onMouseDown(e) {
        this.menuContainer.classList.remove('active');
    }

    /** @private */
    _onEvent() {
        this.listenerMaps.push(this.autoBind(this.bus, 'toggleMenu', this._toggleMenu));
    }

    /**
     * @private
     * @param {Event} e
     */
    _toggleMenu(e) {
        const ce = /** @type {CustomEvent} */ (e);

        this.menuContainer.classList.toggle('active');

        if (ce.detail.menuId) {
            this._appendMenu(ce.detail.menu, ce.detail.menuId);

            if (ce.detail.position) {
                const posX = (ce.detail.position.x || 0) + 20;
                const posY = (ce.detail.position.y || 0) + 20;

                this.menuContainer.style.left = posX + 'px';
                this.menuContainer.style.top = posY + 'px';
            }
        }
    }

    openMenu() {
        this.menuContainer.classList.add('active');
    }

    closeMenu() {
        this.menuContainer.classList.remove('active');
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

        if (menuId === this.menu?.id) {
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
        return container;
    }
}
