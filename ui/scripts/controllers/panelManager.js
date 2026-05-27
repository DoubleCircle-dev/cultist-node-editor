import { ControllerCore } from './controllerCore.js';
import { EventBus } from '../types/eventBus.js';
import { IManager } from './manager.js';
import { NodeTypeRegistry } from '../types/nodeTypes.js';

export class PanelManager extends IManager {
    /**
     * @param {EventBus} bus
     * @param {HTMLElement} viewport
     * @param {HTMLElement} world
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus, viewport, world, coreSpace);

        this.addNodesPanel = null;
        this.findNodesPanel = null;
        this.openFilePanel = null;

        this.helpPanel = null;
        this.shortCutPanel = null;

        this.currentExpandPanel = null;
        this.currentBottomPanel = null;

        this.expandPanel = document.getElementById('expandPanel');
        this.bottomPanel = document.getElementById('bottomPanel');

        this._initPanel();
    }

    /** - 管理器销毁生命周期 依赖基类 IManager 提供的 removeListeners，实现内存的一键清理 */
    destroy() {
        // 一键清理所有通过 registerListener 绑定的事件（包含 DOM 委托与 EventBus 监听）
        this.removeListeners();

        // 如果未来父类实现了 destroy，则级联调用
        if (typeof super.destroy === 'function') {
            super.destroy();
        }
    }

    /** @private */
    _initPanel() {
        this.addNodesPanel = this._createAddNodesPanel();
        this.findNodesPanel = this._createFindNodesPanel();
        this.openFilePanel = this._createOpenFilePanel();
    }

    /** @private */
    _createAddNodesPanel() {
        const panel = document.createElement('div');
        panel.className = 'expand-panel';
        panel.id = 'addNodesPanel';

        // --- panel-header ---
        const header = document.createElement('div');
        header.className = 'panel-header';
        const h3 = document.createElement('h3');
        const spanTitle = document.createElement('span');
        spanTitle.textContent = '📦 添加节点';
        h3.appendChild(spanTitle);
        header.appendChild(h3);

        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'search-wrapper';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'search-input';
        searchInput.id = 'searchInput';
        searchInput.placeholder = '🔍 搜索节点 (名称/描述/类型)...';
        searchInput.autocomplete = 'off';
        searchWrapper.appendChild(searchInput);
        header.appendChild(searchWrapper);
        panel.appendChild(header);

        // --- node-list 容器 ---
        const nodeList = document.createElement('div');
        nodeList.className = 'node-list';
        nodeList.id = 'nodeListContainer';

        const allEntries = Object.entries(NodeTypeRegistry.nodeTypes);

        allEntries.forEach(([typeKey, config]) => {
            if (!config.active) return;
            const node = document.createElement('div');
            node.className = 'node-item';

            // 数据绑定到 dataset
            node.dataset.typeKey = typeKey;

            const displayName = config.label || config.title || typeKey;
            const icon = config.icon || '📦';
            const color = config.color || '#6b7280';
            const description = config.content ? config.content.substring(0, 45) + (config.content.length > 45 ? '…' : '') : '点击添加节点';

            node.innerHTML = `
                <div class="node-color-indicator" style="background: ${color};"></div>
                <div class="node-icon">${icon}</div>
                <div class="node-info">
                    <div class="name">${displayName}<span>${typeKey}</span></div>
                    <div class="desc">${description}</div>
                </div>
            `;
            nodeList.appendChild(node);
        });

        // 使用基类方法绑定事件委托，内部自动 bind(this) 并加入销毁队列
        this.registerListener(nodeList, 'click', (e) => {
            const item = e.target.closest('.node-item');
            if (!item || !item.dataset.typeKey) return;
            // 触发 EventBus
            this.bus.emit('addNode', { type: item.dataset.typeKey });
        });

        panel.appendChild(nodeList);
        return panel;
    }

    /** @private */
    _createFindNodesPanel() {
        const panel = document.createElement('div');
        panel.className = 'expand-panel';
        panel.id = 'findNodesPanel';

        // --- panel-header ---
        const header = document.createElement('div');
        header.className = 'panel-header';
        const h3 = document.createElement('h3');
        const spanTitle = document.createElement('span');
        spanTitle.textContent = '📦 节点库';
        h3.appendChild(spanTitle);
        header.appendChild(h3);

        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'search-wrapper';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'search-input';
        searchInput.id = 'searchInput';
        searchInput.placeholder = '🔍 搜索节点 (名称/描述/类型)...';
        searchInput.autocomplete = 'off';
        searchWrapper.appendChild(searchInput);
        header.appendChild(searchWrapper);
        panel.appendChild(header);

        // --- node-list 容器 ---
        const nodeList = document.createElement('div');
        nodeList.className = 'node-list';
        nodeList.id = 'nodeExampleListContainer';

        this._findNodesListContainer = nodeList;

        // DOM 事件托管
        this.registerListener(nodeList, 'click', (e) => {
            const item = e.target.closest('.node-item');
            if (!item || !item.dataset.nodeId) return;

            const targetNode = this.coreSpace.nodes.find((n) => String(n.id) === item.dataset.nodeId);
            if (targetNode) {
                this.bus.emit('addNode:copy', { node: targetNode });
            }
        });

        // EventBus 事件托管：将总线视作 Target 注册
        this.registerListener(this.bus, 'nodeList:render', this.renderNodesList);

        panel.appendChild(nodeList);
        return panel;
    }

    renderNodesList() {
        const nodeList = this._findNodesListContainer;
        if (!nodeList) return;

        nodeList.innerHTML = '';
        this.coreSpace.nodes.forEach((node) => {
            const nodeItem = document.createElement('div');
            nodeItem.className = 'node-item';
            nodeItem.dataset.nodeId = node.id;

            const displayName = node.title + '#' + node.id;
            const icon = node.icon || '📦';
            const color = node.color || '#6b7280';
            const type = node.type;

            nodeItem.innerHTML = `
                <div class="node-color-indicator" style="background: ${color};"></div>
                <div class="node-icon">${icon}</div>
                <div class="node-info">
                    <div class="name">${displayName}<span>${type}</span></div>
                </div>
            `;
            nodeList.appendChild(nodeItem);
        });
    }

    /** @private */
    _createOpenFilePanel() {
        const panel = document.createElement('div');
        panel.className = 'expand-panel';
        panel.id = 'openFilePanel';

        // --- panel-header ---
        const header = document.createElement('div');
        header.className = 'panel-header';
        const h3 = document.createElement('h3');
        const spanTitle = document.createElement('span');
        spanTitle.textContent = '📦 文件库';
        h3.appendChild(spanTitle);
        header.appendChild(h3);

        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'search-wrapper';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'search-input';
        searchInput.id = 'searchInput';
        searchInput.placeholder = '🔍 搜索文件';
        searchInput.autocomplete = 'off';
        searchWrapper.appendChild(searchInput);
        header.appendChild(searchWrapper);
        panel.appendChild(header);

        // 长生命周期的父容器
        const manifestList = document.createElement('div');
        manifestList.className = 'manifest-list';
        manifestList.id = 'manifestListContainer';

        this._manifestListContainer = manifestList;

        // 1. EventBus 事件托管
        this.registerListener(this.bus, 'addFilesTree', this.addFilesTree);

        // 2. 核心修复：统一在长生命周期的父容器 manifestList 上进行事件委托！
        // 这样内部无论如何增删 .list-panel，都不会造成 Detached DOM 内存泄漏
        this.registerListener(manifestList, 'click', (e) => {
            // A. 处理文件夹折叠/展开
            const headerItem = e.target.closest('.dir-category-header');
            if (headerItem) {
                e.stopPropagation();
                const fileList = headerItem.parentElement.querySelector('.dir-file-list');
                if (fileList) {
                    const isOpen = fileList.classList.toggle('open');
                    const icon = headerItem.querySelector('.toggle-icon');
                    if (icon) icon.textContent = isOpen ? '▼' : '▶';
                }
                return;
            }

            // B. 处理文件点击
            const fileItem = e.target.closest('.dir-file-item');
            if (fileItem && fileItem.dataset.path) {
                // 向上寻找所属的 list-panel，检查是否有自定义的 onClick 行为
                const listPanel = fileItem.closest('.list-panel');
                if (listPanel && typeof listPanel._customOnClick === 'function') {
                    listPanel._customOnClick(fileItem.dataset.path);
                } else {
                    // 默认行为
                    this.bus.emit('openFile', { file: fileItem.dataset.path });
                }
            }
        });

        this.addOriginResourcesPanel(manifestList);
        panel.appendChild(manifestList);

        return panel;
    }

    addFilesTree(e) {
        const manifestList = this._manifestListContainer;
        if (!manifestList) return;

        const { filesTree } = e.detail;
        if (!filesTree) return;
        const rootName = e.detail.rootName || 'root';
        manifestList.appendChild(this.createTreePanel(filesTree, rootName));
    }

    addOriginResourcesPanel(manifestList) {
        if (!manifestList || !manifestList.className.includes('manifest-list')) return;

        fetch('./json-manifest.json')
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
                const treePanel = this.createTreePanel(data, 'original resources');
                manifestList.appendChild(treePanel);
            })
            .catch((error) => console.error('读取JSON出错：', error));
    }

    createTreePanel(data, rootName = 'root', onClick = null) {
        const panel = document.createElement('div');
        panel.className = 'list-panel';

        // 如果传入了自定义回调，直接挂载在 DOM 对象属性上。
        // 当 panel 被销毁时，这个属性随之销毁，不会导致外部长生命周期对象引用它。
        if (onClick) {
            panel._customOnClick = onClick;
        }

        // 生成 DOM 结构
        panel.innerHTML = buildTreeHtml(data);

        return panel;

        // ---------- 内部纯净函数 (保持不变) ----------
        function buildTreeHtml(manifest) {
            const categories = Object.keys(manifest);
            if (!categories.length) return '<div>无目录数据</div>';

            let childrenHtml = '';
            for (const category of categories) {
                if (!manifest[category]) continue;
                const files = manifest[category];
                if (!Array.isArray(files) || files.length === 0) continue;
                const basePath = category.includes('/') ? category + '/' : '';

                childrenHtml += `
                    <div class="dir-category">
                        <div class="dir-category-header">
                            <span class="toggle-icon">▶</span>
                            <span class="category-name">📁 ${category} (${files.length})</span>
                        </div>
                        <ul class="dir-file-list">
                `;
                for (const fileName of files) {
                    const safeFileName = escapeHtml(fileName);
                    const safeFullPath = escapeHtml(basePath + fileName);
                    childrenHtml += `
                            <li class="dir-file-item" data-path="${safeFullPath}">
                                📄 ${safeFileName}
                            </li>
                    `;
                }
                childrenHtml += `</ul></div>`;
            }

            if (!childrenHtml) return '<div>无目录数据</div>';

            return `
                <div class="dir-tree">
                    <div class="dir-category">
                        <div class="dir-category-header">
                            <span class="toggle-icon">▼</span>
                            <span class="category-name">📁 ${rootName} (${categories.length})</span>
                        </div>
                        <div class="dir-file-list open">
                            ${childrenHtml}
                        </div>
                    </div>
                </div>
            `;
        }

        function escapeHtml(str) {
            return str.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m] || m);
        }
    }

    /** @param {string} panel */
    togglePanel(panel) {
        switch (panel) {
            case 'addNodesPanel':
                this._toggleExpandPanel(this.addNodesPanel);
                break;
            case 'findNodesPanel':
                this.bus.emit('nodeList:render');
                this._toggleExpandPanel(this.findNodesPanel);
                break;
            case 'openFilePanel':
                this._toggleExpandPanel(this.openFilePanel);
                break;
            case 'testPanel':
                this._toggleBottomPanel(this.testPanel);
                break;
            default:
                console.error('找不到对应面板', panel);
                break;
        }
    }

    toggleCustomPanel(panel, location) {
        switch (location) {
            case 'expand':
                this._toggleExpandPanel(panel);
                break;
            case 'bottom':
                this._toggleBottomPanel(panel);
                break;
            default:
                console.error('找不到对应面板', panel);
                break;
        }
    }

    /**
     * @private
     * @param {HTMLDivElement | null} panel
     */
    _toggleExpandPanel(panel) {
        if (!panel) return;

        if (!this.currentExpandPanel) {
            this.currentExpandPanel = panel;
            this.expandPanel?.appendChild(panel);
            this.expandPanel?.classList.remove('hidden');
            return;
        }

        if (this.currentExpandPanel === panel) {
            if (!this.expandPanel?.classList.contains('hidden')) {
                this._exitExpandPanel();
            } else {
                this.expandPanel?.classList.remove('hidden');
            }
        } else {
            this.currentExpandPanel.remove();
            this.currentExpandPanel = panel;
            this.expandPanel?.appendChild(panel);
            this.expandPanel?.classList.remove('hidden');
        }
    }

    /** @private */
    _exitExpandPanel() {
        if (!this.expandPanel) return;
        const panel = this.expandPanel;

        if (panel.classList.contains('exit')) return;

        panel.classList.add('exit');

        // 动画属于一次性触发清理类事件，使用原生 { once: true } 最为优雅且避免闭包内存存留。
        panel.addEventListener(
            'animationend',
            () => {
                panel.classList.remove('exit');
                panel.classList.add('hidden');
            },
            { once: true }
        );
    }

    /** @private */
    _toggleBottomPanel(panel) {
        if (!panel) return;

        if (!this.currentBottomPanel) {
            this.currentBottomPanel = panel;
            this.bottomPanel?.appendChild(panel);
            this.bottomPanel?.classList.remove('hidden');
            return;
        }

        if (this.currentBottomPanel === panel) {
            if (!this.bottomPanel?.classList.contains('hidden')) {
                this._exitBottomPanel();
            } else {
                this.bottomPanel?.classList.remove('hidden');
            }
        } else {
            this.currentBottomPanel.remove();
            this.currentBottomPanel = panel;
            this.bottomPanel?.appendChild(panel);
            this.bottomPanel?.classList.remove('hidden');
        }
    }

    /** @private */
    _exitBottomPanel() {
        if (!this.bottomPanel) return;
        const panel = this.bottomPanel;

        if (panel.classList.contains('exit')) return;

        panel.classList.add('exit');
        panel.addEventListener(
            'animationend',
            () => {
                panel.classList.remove('exit');
                panel.classList.add('hidden');
            },
            { once: true }
        );
    }
}
