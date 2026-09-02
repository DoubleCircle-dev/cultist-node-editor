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
            theme: 'dark',
            language: 'zh-cn',
            autoSave: false,
            autoSaveInterval: 300,
            gridSize: 20,
            snapToGrid: true,
            defaultZoom: 1,
            minZoom: 0.1,
            maxZoom: 3,
            animationSpeed: 200,
            connectionStyle: 'bezier',
            showGrid: true,
            showMiniMap: false,
            // 实时文本同步：开启后在文本输入框/文本变量键入时即时同步（默认关；localStorage 记忆）
            realtimeTextSync: (() => {
                try {
                    return typeof localStorage !== 'undefined' && localStorage.getItem('nodeEditor.realtimeTextSync') === '1';
                } catch {
                    return false;
                }
            })(),
        };

        this.hasSavedSettings = false;
        try {
            const saved = localStorage.getItem('nodeEditor.settings');
            if (saved) {
                Object.assign(this.setting, JSON.parse(saved));
                this.hasSavedSettings = true;
            }
        } catch {
            // localStorage 不可用或历史配置损坏时使用默认值
        }

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
     * @returns {{ count: number, created: Array<{ entry: any, model: any }> }} 铺图数(count) 与 entry→model 映射（供 connectDataLinks 连线）
     */
    autoLayoutLoadedData(namespace) {
        if (!namespace) return { count: 0, created: [] };
        const all = ModDataRegistry.getEntriesByNamespace(namespace);
        if (!all.length) return { count: 0, created: [] };
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
     * 中间 JSON 模型：按连接候选（links）在已铺图节点间建立连线，展示引用关系。
     * 例如 recipe.effects 引用 element lantern → recipe 节点连到 element 节点的输出端口。
     * 仅对两端都已铺成节点的连接生效（引用缺失/未铺图 → 暂时悬空）。
     *
     * @param {Array<{from:{category:string;id:string;field:string}, to:{category:string;id:string}}>} links
     * @param {Array<{entry:any, model:any}>} createdList - addNodesFromData 返回的 {entry, model} 列表
     * @returns {number} 成功建立的连接数
     */
    connectDataLinks(links, createdList) {
        if (!Array.isArray(links) || !Array.isArray(createdList)) return 0;
        /** @type {Map<string, any>} `${category}:${id}` → node model */
        const map = new Map();
        createdList.forEach(({ entry, model }) => {
            if (entry && entry.id && model) map.set(`${entry.category}:${entry.id}`, model);
        });

        let connected = 0;
        links.forEach((link) => {
            if (!link || !link.from || !link.to) return;
            const fromModel = map.get(`${link.from.category}:${link.from.id}`);
            const toModel = map.get(`${link.to.category}:${link.to.id}`);
            if (!fromModel || !toModel) return;
            // 引用方端口：from 节点上字段名对应的 PortProp
            // （effects/requirements 是 input；linked/alt 是 output）
            const fromProp = (fromModel.detailProperties || []).find(
                (p) => p && p.name === link.from.field && (p.inputPort || p.outputPort)
            );
            if (!fromProp) return;
            const fromPort = fromProp.inputPort || fromProp.outputPort;
            // 被引用方端口：与 fromPort 方向相反
            //  - from 是 input（如 effects 引用 element）→ 目标输出端口
            //  - from 是 output（如 linked/alt 指向下一 recipe）→ 目标输入端口
            const toPort =
                fromPort.direction === 'input' ? this._findOutputPort(toModel) : this._findInputPort(toModel);
            if (!toPort) return;
            // 通过 ConnectionManager 程序化创建（模型连线 + 注册 + 生成 SVG 连接线）
            const created = this.connectionManager.createProgrammaticConnection(fromModel, fromPort, toModel, toPort);
            if (created) connected++;
        });
        return connected;
    }

    /** @private 找节点的第一个输出端口（PortModel） */
    _findOutputPort(model) {
        const outputs = model.outputs;
        if (outputs && outputs.properties && outputs.properties.length) {
            for (const p of outputs.properties) {
                if (p && p.outputPort) return p.outputPort;
            }
        }
        const p = (model.detailProperties || []).find((prop) => prop && prop.outputPort);
        return p ? p.outputPort : null;
    }

    /** @private 找节点的第一个输入端口（PortModel） */
    _findInputPort(model) {
        const inputs = model.inputs;
        if (inputs && inputs.properties && inputs.properties.length) {
            for (const p of inputs.properties) {
                if (p && p.inputPort) return p.inputPort;
            }
        }
        const p = (model.detailProperties || []).find((prop) => prop && prop.inputPort);
        return p ? p.inputPort : null;
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
