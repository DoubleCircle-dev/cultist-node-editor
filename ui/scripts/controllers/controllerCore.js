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
import { DataSelector } from '../views/dataSelector.js';
import { ModDataRegistry } from '../modDataRegistry.js';

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
            autoLayoutLimit: 200, // 数据加载后自动铺图的最大节点数（超出保留在数据池）
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
     * 打开数据选择器：从基础类型的数据池选择条目，实例化节点（类型保持为基础类型）。
     *
     * @param {string} type - 基础类型（recipes/elements/...）
     */
    openDataSelector(type) {
        const entries = ModDataRegistry.getEntries(type);
        if (!entries.length) {
            console.warn(`[数据选择器] 类型 ${type} 暂无数据源`);
            return;
        }
        const selector = new DataSelector({
            category: type,
            entries,
            onSelect: (entry) => this.nodeManager.addNodeFromData(type, entry),
        });
        document.body.appendChild(selector.element);
    }

    /**
     * 数据加载后自动转换为可查看的节点（铺到画布，受 autoLayoutLimit 规模限制）。
     * 按类别均衡取样，保证各类别都有节点可见；超出的数据留在数据池，
     * 可经「添加节点 → 数据选择器」手动创建。
     *
     * @param {string} namespace
     * @returns {number} 实际创建的节点数
     */
    autoLayoutLoadedData(namespace) {
        if (!namespace) return 0;
        const all = ModDataRegistry.getEntriesByNamespace(namespace);
        if (!all.length) return 0;
        const limit = this.setting.autoLayoutLimit || 200;

        // 按类别分组，每类均取一部分，避免前 N 条集中在某一类
        const byCat = {};
        all.forEach((e) => {
            const key = e.category || 'misc';
            (byCat[key] = byCat[key] || []).push(e);
        });
        const perCat = Math.max(1, Math.floor(limit / Object.keys(byCat).length));
        const items = [];
        Object.entries(byCat).forEach(([, list]) => items.push(...list.slice(0, perCat)));

        return this.nodeManager.addNodesFromData(items, { limit });
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
        // 保存引用，便于 destroy() 时移除 —— 避免重复初始化（如 webview 重载）
        // 时 document 级监听器不断累积，且旧闭包持续持有整个 ControllerCore
        this._shortcutHandler = (e) => {
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
        };
        document.addEventListener('keydown', this._shortcutHandler);
    }

    /**
     * 销毁核心控制器：移除全局监听器并销毁全部管理器。
     * Webview 关闭 / 重新初始化前应调用，避免 document 级监听器与
     * EventBus 上的监听器（闭包持有本实例）形成泄漏。
     */
    destroy() {
        if (this._shortcutHandler) {
            document.removeEventListener('keydown', this._shortcutHandler);
            this._shortcutHandler = null;
        }

        // 注意：UIManager 不是 IManager 子类，没有 destroy()，需做能力判断
        [
            this.historyManager,
            this.nodeManager,
            this.canvasManager,
            this.uiManager,
            this.nodeActionManager,
            this.connectionManager,
            this.menuManager,
            this.panelManager,
        ].forEach((m) => {
            if (m && 'destroy' in m && typeof m.destroy === 'function') {
                m.destroy();
            }
        });
    }
}
