import { EditorConfig } from './constant.js';
import { BaseNodeModel } from '../models/nodeModels/baseNodeModel.js';
import { NodeManager } from './nodeManager.js';
import { CanvasManager } from './canvasManager.js';
import { UIManager } from './uiManager.js';
import { NodeActionManager } from './nodeActionManager.js';
import { ConnectionManager } from './connectionManager.js';
import { EventBus } from '../types/eventBus.js';
import { PanelManager } from './panelManager.js';
import { HistoryManager } from './historyManager.js';
import { MenuManager } from './MenuManager.js';
import { StandardMessage } from '../types/standardDetail.js';

export class ControllerCore {
    /**
     * @param {HTMLElement} world
     * @param {HTMLElement} viewport
     */
    constructor(world, viewport) {
        this.world = world;
        this.viewport = viewport;
        this.bus = new EventBus();

        this.setting = {
            refreshMovingConnection: true,
            checkConnectionPos: false,
            quickClear: true,
            quickDelete: true,
            historyMaxLength: 20,
            undoHistoryMaxLength: 20,
        };

        this.historyManager = new HistoryManager(this.bus, this.viewport, this.world, this);

        this.nodeManager = new NodeManager(this.bus, this.viewport, this.world, this);

        this.canvasManager = new CanvasManager(this.bus, this.viewport, this.world, this);

        this.uiManager = new UIManager(this.bus, this.viewport, this.world, this);

        this.nodeActionManager = new NodeActionManager(this.bus, this.viewport, this.world, this);

        this.connectionManager = new ConnectionManager(this.bus, this.viewport, this.world, this);

        this.menuManager = new MenuManager(this.bus, this.viewport, this.world, this);

        this.panelManager = new PanelManager(this.bus, this.viewport, this.world, this);

        this._bindShortCut();
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    viewportToWorld(x, y) {
        if (!this.canvasManager) {
            console.error('无法转化坐标，canvasManager未初始化');
            return { x, y };
        }
        return this.canvasManager.viewportToWorld(x, y);
    }
    /**
     * @param {number} x
     * @param {number} y
     */
    worldToViewport(x, y) {
        if (!this.canvasManager) {
            console.error('无法转化坐标，canvasManager未初始化');
        }
        return this.canvasManager.worldToViewport(x, y);
    }

    get nodes() {
        const nodes = this.nodeManager.nodes;
        return Array.from(nodes.values());
    }

    get mode() {
        if (!this.canvasManager) {
            console.error('无法获取模式，canvasManager未初始化');
            return null;
        }
        return this.canvasManager.mode;
    }

    get selectedNodes() {
        /** @type {BaseNodeModel[]} */
        const selectedNodes = [];
        this.nodes.forEach((node) => {
            if (node.selected) selectedNodes.push(node);
        });

        return selectedNodes;
    }

    get ViewCenter() {
        return this.canvasManager.ViewCenter;
    }

    /**
     * @param {string} nodeType
     * @param {number | null} Px
     * @param {number | null} Py
     */
    addNode(nodeType, Px = null, Py = null) {
        this.nodeManager.addNode(nodeType, Px, Py);
    }

    /**
     * @param {string} mode
     * @returns {void}
     */
    setMode(mode) {
        this.canvasManager.setMode(mode);
    }

    clearCanvas() {
        this.historyManager.clear();

        this.nodeManager.clear();
        this.connectionManager.clear();
        // this.nodeActionManager.clear();

        this.canvasManager.reset();
        // this.uiManager.reset();

        if (this.canvasManager) {
            this.forceRepaint();
            // console.log('刷新页面')
        }
    }

    undo() {
        this.historyManager.undo();
    }

    redo() {
        this.historyManager.redo();
    }

    forceRepaint() {
        this.canvasManager.refresh();
    }

    /**
     * 快捷键管理
     *
     * @private
     */
    _bindShortCut() {
        document.addEventListener('keydown', (e) => {
            // 处理键盘事件--快捷键设置
            if (e.target) {
                if (e.target instanceof HTMLElement) {
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
                }
            }

            e.preventDefault();

            const key = e.key.toUpperCase();
            if (e.ctrlKey || e.metaKey) {
                switch (key) {
                    case 'Z':
                        this.undo();
                        break;
                    case 'Y':
                        this.redo();
                        break;
                    case 'S':
                        // this.save();
                        break;
                    case 'A':
                        this.nodes.forEach((node) => {
                            node.setSelected(true);
                        });
                        break;
                    default:
                        break;
                }
            }

            switch (key) {
                case 'DELETE':
                    this.nodeManager.deleteNodes(this.selectedNodes.map((node) => node.id));
                    break;
                case 'H':
                    this.setMode('select');
                    break;

                case 'G':
                    this.setMode('drag');
                    break;

                case 'F':
                    this.setMode('focus');
                    break;
                default:
                    break;
            }
        });
    }
}
