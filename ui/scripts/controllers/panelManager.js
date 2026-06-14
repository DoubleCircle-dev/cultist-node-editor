import { ControllerCore } from './controllerCore.js';
import { EventBus } from '../types/eventBus.js';
import { IManager } from './manager.js';
import { PanelModel } from '../models/panelModels/panelModel.js';
import { PanelView } from '../views/panelView.js';
import { NodeTypeRegistry } from '../types/nodeTypes.js';
import { ExpandPanelModel } from '../models/panelModels/expandPanelModel.js';

// 管理展示面板
export class PanelManager extends IManager {
    /**
     * @param {EventBus} bus
     * @param {HTMLElement} viewport
     * @param {HTMLElement} world
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus, viewport, world, coreSpace);

        this.fetchControllers = new Map();

        // 面板容器
        let EPContainer = document.getElementById('expandPanelContainer');
        if (!EPContainer) {
            console.error('未找到侧面面板容器');
            EPContainer = document.createElement('div');
            EPContainer.id = 'expandPanelContainer';
            EPContainer.classList.add('panel');
            EPContainer.classList.add('expand');
            EPContainer.classList.add('hidden');
            this.viewport.appendChild(EPContainer);
        }
        this.expandPanelContainer = new ContainerView(EPContainer);

        let BPContainer = document.getElementById('bottomPanelContainer');
        if (!BPContainer) {
            console.error('未找到底部面板容器');
            BPContainer = document.createElement('div');
            BPContainer.id = 'bottomPanelContainer';
            BPContainer.classList.add('panel');
            BPContainer.classList.add('bottom');
            BPContainer.classList.add('hidden');
            this.viewport.appendChild(BPContainer);
        }
        this.bottomPanelContainer = new ContainerView(BPContainer);

        if (!this.expandPanelContainer || !this.bottomPanelContainer) {
            console.error('未找到面板容器');
        }

        /**
         * 面板列表
         *
         * @type {Map<string, { model: PanelModel; view: PanelView | null }>}
         */
        this.panels = new Map();

        this._initPanels();

        // 监听节点变化，自动刷新「查找节点」面板
        this.registerListener(this.bus, 'create:node:finished', this._onNodesChanged);
        this.registerListener(this.bus, 'delete:node:finished', this._onNodesChanged);
        this.registerListener(this.bus, 'delete:all_node:success', this._onNodesChanged);
    }

    /** @private */
    _initPanels() {
        const addNodesPanel = new ExpandPanelModel('addNodesPanel', '添加节点', {
            hasSearch: true,
            dataType: 'list',
        });
        addNodesPanel.rawData = NodeTypeRegistry.allTypesList;
        addNodesPanel.dataActionHandlers.set('click-node-item', (type, id, path) => {
            this.bus.emit('addNode',{
                type,
                id,
                path,
            });
        });
        this._attachPanelEventListener(addNodesPanel);
        this.panels.set(addNodesPanel.id, { model: addNodesPanel, view: null });

        const findNodesPanel = new ExpandPanelModel('findNodesPanel', '查找节点', {
            hasSearch: true,
            dataType: 'list',
        });
        this.findNodesPanel = findNodesPanel;
        findNodesPanel.dataActionHandlers.set('click-node-item', (type, id, path) => {
            this.bus.emit('findNode', {
                type,
                id,
                path,
            })
        })
        this._refreshFindNodesPanel();
        this._attachPanelEventListener(findNodesPanel);
        this.panels.set(findNodesPanel.id, { model: findNodesPanel, view: null });

        const openFilePanel = new ExpandPanelModel('openFilePanel', '打开文件', {
            hasSearch: true,
            dataType: 'tree',
        });

        const controller = new AbortController();
        this.fetchControllers.set('openFilePanel', controller);

        fetch('./json-manifest.json', { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP错误！状态码：${response.status}`);
                return response.json();
            })
            .then((data) => {
                return Object.keys(data)
                    .filter((key) => key in NodeTypeRegistry.nodeTypes)
                    .reduce((obj, key) => {
                        obj[key] = data[key];
                        return obj;
                    }, {});
            })
            .then((data) => {
                openFilePanel.rawData = data;
            })
            .catch((error) => {
                if (error.name !== 'AbortError') {
                    console.error('读取JSON出错：', error);
                }
            });

        this._attachPanelEventListener(openFilePanel);
        this.panels.set(openFilePanel.id, { model: openFilePanel, view: null });
    }

    /**
     * @private 为面板模型绑定数据点击事件处理
     * @param {PanelModel} panelModel
     */
    _attachPanelEventListener(panelModel) {
        panelModel.addEventListener('data:action:click', (e) => {
            const { action, type, id, path } = e.detail;

            if (panelModel.dataActionHandlers.has(action)) {

                const handler = panelModel.dataActionHandlers.get(action);
                if (!handler){
                    console.error(`未找到面板${panelModel.id}的点击事件处理函数${action}`);
                    return;
                }
                handler(type, id, path);
                return;
            }

            // 根据不同的 action 类型发送对应的 eventBus 信号
            if (action === 'click-node-item') {
                this.bus.emit('panel:click:node', {
                    panelId: panelModel.id,
                    type: type,
                    nodeId: id,
                });
            } else if (action === 'click-file-item') {
                this.bus.emit('panel:click:file', {
                    panelId: panelModel.id,
                    filePath: path,
                });
            } else if (action === 'toggle-folder') {
                this.bus.emit('panel:toggle:folder', {
                    panelId: panelModel.id,
                    folderPath: path,
                });
            }
        });
    }

    /** @param {string} panelName */
    togglePanel(panelName) {
        const panel = this.panels.get(panelName)?.model;
        let view = this.panels.get(panelName)?.view;

        if (!panel) {
            console.error(`未找到面板${panelName}`);
            return;
        }

        if (!view) {
            view = new PanelView(panel);
            this.panels.set(panelName, { model: panel, view: view });
        }

        if (panel.type == 'expand') {
            this._toggleExpandPanel(view);
            return;
        }

        if (panel.type == 'bottom') {
            this._toggleBottomPanel(view);
            return;
        }

        console.error(`未知的面板类型${panel.type}，请检查面板类型是否正确`);
    }

    /**
     * @private
     * @param {PanelView} panelView
     */
    _toggleExpandPanel(panelView) {
        this.expandPanelContainer.toggle(panelView);
    }

    /**
     * @private
     * @param {PanelView} panelView
     */
    _toggleBottomPanel(panelView) {
        this.bottomPanelContainer.toggle(panelView);
    }

    /**
     * @private
     * @param {PanelModel} panel
     */
    toggleCustomPanel(panel, temp = true) {
        if (!temp) {
            let panelView = this.panels.get(panel.id)?.view;
            if (!panelView) {
                panelView = new PanelView(panel);
                this.panels.set(panel.id, { model: panel, view: panelView });
            }
            this.togglePanel(panel.id);
        } else {
            let panelView = new PanelView(panel);
            if (panel.type == 'expand') {
                this._toggleExpandPanel(panelView);
                return;
            }

            if (panel.type == 'bottom') {
                this._toggleBottomPanel(panelView);
                return;
            }

            console.error(`未知的面板类型${panel.type}，请检查面板类型是否正确`);
        }
    }

    /** @private 节点增删时的事件处理 */
    _onNodesChanged() {
        this._refreshFindNodesPanel();
    }

    /** @private 将 CoreSpace.nodes 同步到 findNodesPanel.rawData 并通知视图刷新 */
    _refreshFindNodesPanel() {
        if (!this.findNodesPanel) return;
        const nodes = this.coreSpace.nodes;
        this.findNodesPanel.rawData = nodes;
        this.findNodesPanel.emit('data:changed', { data: nodes });
    }

    destroy() {
        this.fetchControllers.forEach((controller) => {
            controller.abort();
        });
        this.fetchControllers.clear();

        // 清理所有面板视图
        this.panels.forEach(({ view }) => {
            if (view && typeof view.destroy === 'function') {
                view.destroy();
            }
        });

        this.expandPanelContainer.destroy();
        this.bottomPanelContainer.destroy();

        this.panels.clear();

        super.destroy();
    }
}

export class ContainerView {
    /** @param {HTMLElement} element - 静态容器 DOM（如 document.getElementById('expandPanel')） */
    constructor(element) {
        this.element = element;
        this.currentView = null;

        this.animationendHandler = null;

        this._initEvents();
    }

    /** @private 统一在长生命周期的容器上监听动画结束，安全且不泄漏 */
    _initEvents() {
        this.animationendHandler = () => {
            if (this.element.classList.contains('exit')) {
                this.element.classList.remove('exit');
                this.element.classList.add('hidden');

                this.element.innerHTML = '';
                this.currentView = null;
            }
        };
        this.element.addEventListener('animationend', this.animationendHandler);
    }

    /**
     * 展开并挂载新面板
     *
     * @param {PanelView} panelView
     */
    mount(panelView) {
        this.currentView = panelView;
        this.element.innerHTML = '';
        this.element.appendChild(panelView.element);

        this.element.classList.remove('hidden', 'exit');
    }

    /**
     * 已处于展开状态时，无缝直接替换内部内容（不播放外壳开关动画）
     *
     * @param {PanelView} panelView
     */
    change(panelView) {
        this.currentView = panelView;
        this.element.innerHTML = '';
        this.element.appendChild(panelView.element);
    }

    /** 触发退出动画并隐藏 */
    unmount() {
        if (this.element.classList.contains('hidden') || this.element.classList.contains('exit')) {
            return;
        }
        this.element.classList.add('exit');
    }

    /** 获取当前容器的显隐状态 */
    get isVisible() {
        return !this.element.classList.contains('hidden') && !this.element.classList.contains('exit');
    }

    /** @param {PanelView} panelView */
    toggle(panelView) {
        if (panelView === this.currentView) {
            this.unmount();
        } else {
            if (!this.currentView) {
                this.mount(panelView);
            } else {
                this.change(panelView);
            }
        }
    }

    destroy() {
        if (this.animationendHandler) {
            this.element.removeEventListener('animationend', this.animationendHandler);
            this.animationendHandler = null;
        }
        this.element.innerHTML = '';
        this.currentView = null;
    }
}
