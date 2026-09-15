import { EventBus } from '../types/eventBus.js';
import { ControllerCore } from './controllerCore.js';

export class UIManager {
    /**
     * @param {EventBus} bus
     * @param {HTMLElement} viewport
     * @param {HTMLElement} world
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        this.bus = bus;
        this.viewport = viewport;
        this.world = world;

        this.coreSpace = coreSpace;

        this.updateStatus = null;
        this.mousePosition = null;
        this.viewControlPanel = null;

        this.placeHolder = null;

        this._initComponents();

        this._initListeners();
    }

    /** @private */
    _initComponents() {
        this.updateStatus = document.getElementById('status');
        this.mousePosition = document.getElementById('mouse-coords');
        this.viewControlPanel = document.getElementsByClassName('view-controls').item(0);
        this.updateMode(new CustomEvent('modeChanged', { detail: { mode: 'select' } }));

        this.placeHolder = document.getElementById('placeholder');

        this.tooltip = document.getElementsByClassName('.tooltip-trigger').item(0) || document.createElement('div');
        this.tooltip.classList.add('tooltip-trigger');
        this.tooltip.setAttribute('id', 'tooltip');
        this.world.appendChild(this.tooltip);
    }

    /** @private */
    _initListeners() {
        this.bus.on('mousePosition', this.updateMousePosition.bind(this));
        this.bus.on('transformChanged', this.updateZoom.bind(this));
        this.bus.on('modeChanged', this.updateMode.bind(this));
        this.bus.on('toggle:connections', this.toggleConnections.bind(this));
        this.bus.on('create:node:finished', this.removePlaceHolder.bind(this));
        this.bus.on('delete:all_node:success', this.addPlaceHolder.bind(this));
    }

    /** @param {CustomEvent} e */
    updateMousePosition(e) {
        if (this.mousePosition) {
            this.mousePosition.textContent = `视口:(${Math.round(e.detail.viewportX)}, ${Math.round(e.detail.viewportY)}) 世界:(${e.detail.worldX.toFixed(1)}, ${e.detail.worldY.toFixed(1)}) 原始:(${e.detail.clientX.toFixed(1)}, ${e.detail.clientY.toFixed(1)})`;
        } else {
            console.warn('鼠标位置更新显示失败');
        }
    }

    /** @param {CustomEvent} e */
    updateZoom(e) {
        if (this.viewControlPanel) {
            const slider = this.viewControlPanel.querySelector('#zoom-slider');
            if (slider) {
                if (slider instanceof HTMLInputElement) {
                    slider.value = e.detail.scale;
                }
            }

            const percent = this.viewControlPanel.querySelector('#zoom-percent');
            if (percent) {
                percent.textContent = `${(e.detail.scale * 100).toFixed(1)}%`;
            }
        }
    }

    updateMode(e) {
        const mode = e.detail.mode;
        if (this.viewControlPanel) {
            this.viewControlPanel.querySelectorAll('.view-btn').forEach((element) => {
                if (element instanceof HTMLElement) {
                    element.classList.remove('active');

                    if (element.dataset.mode === mode) {
                        element.classList.add('active');
                    }
                }
            });
            this.viewControlPanel.querySelector('#' + mode)?.classList.add('active');
        }
    }

    toggleConnections() {
        if (this.viewControlPanel) {
            const toggle = this.viewControlPanel.querySelector('#toggle-connections');
            if (toggle instanceof HTMLElement) {
                toggle.classList.toggle('active');
            }
        }
    }

    removePlaceHolder() {
        if (this.placeHolder) {
            this.placeHolder.remove();
        }
    }

    addPlaceHolder() {
        if (this.placeHolder) {
            this.world.appendChild(this.placeHolder);
        }
    }
}
