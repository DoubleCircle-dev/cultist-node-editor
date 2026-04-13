import { ControllerCore } from "./controllerCore.js";
import { EventBus } from "./eventBus.js";
import { IManager } from "./manager.js";
import { NodeTypeRegistry } from "../types/nodeTypes.js";

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

        this.expandPanel = document.getElementById("expandPanel");
        this.bottomPanel = document.getElementById("bottomPanel");

        this._initPanel();
    }

    _initPanel() {
        this.addNodesPanel = this._createAddNodesPanel();

        this.findNodesPanel = this._createFindNodesPanel();

        this.openFilePanel = this._createOpenFilePanel();


    }

    _createAddNodesPanel() {
        // 根容器 div.add-nodes-panel
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

            let html = '';
            const displayName = config.label || config.title || typeKey;
            const icon = config.icon || '📦';
            const color = config.color || '#6b7280';
            const description = config.content ? config.content.substring(0, 45) + (config.content.length > 45 ? '…' : '') : '点击添加节点';

            html += `
                        <div class="node-color-indicator" style="background: ${color};"></div>
                        <div class="node-icon">${icon}</div>
                        <div class="node-info">
                            <div class="name">
                                ${displayName}
                                <span>${typeKey}</span>
                            </div>
                            <div class="desc">${description}</div>
                        </div>
                `;

            node.innerHTML = html;

            node.addEventListener('click', () => {
                this.bus.emit('addNode', { type: typeKey });
            })

            nodeList.appendChild(node);
        })

        // 内部注释可以忽略，动态渲染时填充内容
        panel.appendChild(nodeList);

        return panel;
    }

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

        this.bus.on('nodeList:render', this.renderNodesList.bind(this, nodeList))        

        panel.appendChild(nodeList);

        return panel;
    }

    renderNodesList(nodeList){
        nodeList.innerHTML = '';
        this.coreSpace.nodes.forEach((node) => {
            const nodeItem = document.createElement('div');
            nodeItem.className = 'node-item';

            let html = '';
            const displayName = node.title + '#' + node.id;
            const icon = node.icon || '📦';
            const color = node.color || '#6b7280';
            const type = node.type;

            html += `
                        <div class="node-color-indicator" style="background: ${color};"></div>
                        <div class="node-icon">${icon}</div>
                        <div class="node-info">
                            <div class="name">
                                ${displayName}
                                <span>${type}</span>
                            </div>
                        </div>
                `;

            nodeItem.innerHTML = html;

            nodeItem.addEventListener('click', () => {
                this.bus.emit('addNode:copy', { node: node });
            })

            nodeList.appendChild(nodeItem);
        })
    }

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

        const manifestList = document.createElement('div');
        manifestList.className = 'manifest-list';
        manifestList.id = 'manifestListContainer';
        this.bus.addEventListener('addFilesTree', this.addFilesTree.bind(this, manifestList))

        this.addOriginResourcesPanel(manifestList);

        panel.appendChild(manifestList);

        return panel;
    }

    addNodesList() {
        this.coreSpace.nodes.forEach((node) => {
            const onClick = ((file) => {
                this.bus.emit('addNode:copy', { node: node });
            });
        })
    }

    addFilesTree(manifestList, e) {
        const { filesTree } = e.detail;
        if (!filesTree) return;
        const rootName = e.detail.rootName || 'root';
        manifestList.appendChild(this.createTreePanel(filesTree, rootName))
    }

    addOriginResourcesPanel(manifestList) {
        if (!manifestList) return;
        if (!manifestList.className.includes('manifest-list')) return;


        fetch('./json-manifest.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误！状态码：${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                return Object.keys(data)
                    .filter(key => key in NodeTypeRegistry.nodeTypes)
                    .reduce((obj, key) => {
                        obj[key] = data[key];
                        return obj;
                    }, {});
            })
            .then(data => {
                const treePanel = this.createTreePanel(data, 'original resources');
                manifestList.appendChild(treePanel);
            })
            .catch(error => {
                console.error('读取JSON出错：', error);
            });

    }

    createTreePanel(data, rootName = 'root', onClick = null) {

        const panel = document.createElement('div');
        panel.className = 'list-panel';

        const treeHtml = buildTreeHtml(data);
        panel.innerHTML = treeHtml;

        if (!onClick) {
            const onFileClick = (file) => {
                this.bus.emit('openFile', { file: file });
            };
            attachToggleEvents(panel, onFileClick);
        } else {
            attachToggleEvents(panel, onClick);
        }

        return panel;
        // ---------- 内部函数 ----------
        function buildTreeHtml(manifest) {
            const categories = Object.keys(manifest);
            if (!categories.length) return '<div>无目录数据</div>';

            // 1. 先构建所有子文件夹（分类）的 HTML
            let childrenHtml = '';
            for (const category of categories) {
                if (!manifest[category]) continue;

                const files = manifest[category];
                if (!Array.isArray(files) || files.length === 0) continue;

                const basePath = category.includes('/') ? category + '/' : '';

                // 子文件夹默认折叠：图标 ▶，文件列表无 open 类
                childrenHtml += `
                    <div class="dir-category">
                        <div class="dir-category-header">
                            <span class="toggle-icon">▶</span>
                            <span class="category-name">📁 ${category} (${files.length})</span>
                        </div>
                        <ul class="dir-file-list">
                `;
                for (const fileName of files) {
                    const fullPath = basePath + fileName;
                    const safeFileName = escapeHtml(fileName);
                    const safeFullPath = escapeHtml(fullPath);
                    childrenHtml += `
                            <li class="dir-file-item" data-path="${safeFullPath}">
                                📄 ${safeFileName}
                            </li>
                    `;
                }
                childrenHtml += `</ul></div>`;
            }

            if (!childrenHtml) return '<div>无目录数据</div>';

            // 2. 用根文件夹 "origin resource" 包装所有子文件夹
            let html = '<div class="dir-tree">';
            html += `
                <div class="dir-category">
                    <div class="dir-category-header">
                        <span class="toggle-icon">▼</span>
                        <span class="category-name">📁 ${rootName} (${categories.length})</span>
                    </div>
                    <div class="dir-file-list open">
                        ${childrenHtml}
                    </div>
                </div>
            `;
            html += '</div>';
            return html;
        }

        function attachToggleEvents(container, onFileClick) {
            // 折叠/展开事件
            const headers = container.querySelectorAll('.dir-category-header');
            headers.forEach(header => {
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const fileList = header.parentElement.querySelector('.dir-file-list');
                    if (fileList) {
                        // 切换 open 类
                        const isOpen = fileList.classList.toggle('open');
                        // 更新图标
                        const icon = header.querySelector('.toggle-icon');
                        icon.textContent = isOpen ? '▼' : '▶';
                    }
                });
            });

            // 文件点击事件（事件委托）
            container.addEventListener('click', (e) => {
                const fileItem = e.target.closest('.dir-file-item');
                if (fileItem && fileItem.dataset.path && onFileClick) {
                    onFileClick(fileItem.dataset.path);
                }
            });
        }

        function escapeHtml(str) {
            return str.replace(/[&<>]/g, function (m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
            });
        }
    }

    /**
     * @param {string} panel
     */
    togglePanel(panel) {
        switch (panel) {
            case "addNodesPanel":
                this._toggleExpandPanel(this.addNodesPanel);
                break;
            case "findNodesPanel":
                this.bus.emit('nodeList:render');
                this._toggleExpandPanel(this.findNodesPanel);
                break;
            case "openFilePanel":
                this._toggleExpandPanel(this.openFilePanel);
                break;
            default:
                console.error('找不到对应面板', panel);
                break;
        }
    }

    /**
     * @param {HTMLDivElement | null} panel
     */
    _toggleExpandPanel(panel) {
        if (panel) {
            if (!this.currentExpandPanel) {
                this.currentExpandPanel = panel;
                this.expandPanel?.appendChild(panel);
                this.expandPanel?.classList.remove('hidden');
                return;
            }

            if (this.currentExpandPanel === panel) {
                this.expandPanel?.classList.toggle('hidden');
            } else {
                this.currentExpandPanel.remove();
                this.currentExpandPanel = panel;
                this.expandPanel?.appendChild(panel);
                this.expandPanel?.classList.remove('hidden');
            }
        }
    }

    _toggleBottomPanel() {

    }

}
