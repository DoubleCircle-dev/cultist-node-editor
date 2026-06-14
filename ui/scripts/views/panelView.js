import { PanelModel } from '../models/panelModels/panelModel.js';
import { IView } from '../types/IView.js';

export class PanelView extends IView {
    /** @param {PanelModel} model - 传入上面创建的任意一个 Model 实例 */
    constructor(model) {
        super(model);
        this.model = model;

        this.element = document.createElement('div');
        this.element.className = 'panel-content-wrapper';
        
        this._createSkeleton();

        this._createContent();

        this._initListeners();
    }

    /** @private */
    _createSkeleton() {
        const skeleton = document.createElement('div');
        skeleton.classList.add('panel');
        skeleton.classList.add(this.model.type);
        skeleton.id = this.model.id;

        const header = this._createHeader();
        skeleton.appendChild(header);


        const panelBody = document.createElement('div');
        panelBody.classList.add('panel-body');
        skeleton.appendChild(panelBody);

        this.element.appendChild(skeleton);
    }

    /** @private */
    _createHeader() {
        const header = document.createElement('div');
        header.classList.add('panel-header');
        const h3 = document.createElement('h3');
        const spanTitle = document.createElement('span');
        spanTitle.textContent = this.model.icon + ' ' + this.model.title;
        h3.appendChild(spanTitle);
        header.appendChild(h3);

        if (this.model.hasSearch) {
            const input = document.createElement('input');
            input.className = 'search-input';
            input.id = this.model.id + '-search';
            input.type = 'text';
            input.placeholder = 'Search...';
            input.autocomplete = 'off';
            this.searchInput = input;

            this._searchInputHandler = () => {
                this.model.setSearchQuery(input.value);
            };
            input.addEventListener('input', this._searchInputHandler);

            header.appendChild(input);
        }

        return header;
    }

    /** @private */
    _createContent() {
        if (this.model.dataType === 'list') {
            this._renderDataList(this.model.rawData);
        } else if (this.model.dataType === 'tree') {
            this._renderTree(this.model.rawData);
        } else {
            console.error('Unknown data type');
        }

    }

    /**
     * @private
     * @param {Object[]} items
     */
    _renderDataList(items) {
        const body = this.element.querySelector('.panel-body');
        if (!items || items.length === 0) {
            body.innerHTML = '<div class="empty-tip">📭 暂无匹配节点</div>';
            return;
        }

        // 纯数据映射为 HTML 字符串（通过 data- 属性向下标定数据，不绑定任何事件）
        body.innerHTML = items
            .map((item) => {
                const color = item.color || '#6b7280';
                const icon = item.icon || '📦';
                const title = this._escapeHtml(item.title || item.label || '');
                const id = this._escapeHtml(item.id || '');
                const type = this._escapeHtml(item.type || '');
                const desc = item.desc || item.description || '';
                const safeDesc = desc ? this._escapeHtml(desc.substring(0, 45) + (desc.length > 45 ? '…' : '')) : '';
                return `
                <div class="node-item" data-action="click-node-item" data-type="${type}" data-id="${id}">
                    <div class="node-color-indicator" style="background: ${color};"></div>
                    <div class="node-icon">${icon}</div>
                    <div class="node-info">
                        <div class="name">
                            ${title} ${id ? `<span>#${id}</span>` : `<span>${type}</span>`}
                        </div>
                        ${safeDesc ? `<div class="desc">${safeDesc}</div>` : ''}
                    </div>
                </div>
            `;
            })
            .join('');
    }

    // ==========================================
    // 🛠️ 核心实现 2：嵌套树形目录渲染（完全状态驱动）
    // ==========================================
    /**
     * @private
     * @param {Object} treeData
     * @param {string} rootName
     */
    _renderTree(treeData, rootName = 'root') {
        const body = this.element.querySelector('.panel-body');
        if (!treeData || Object.keys(treeData).length === 0) {
            body.innerHTML = '<div class="empty-tip">📭 目录无有效数据</div>';
            return;
        }

        const categories = Object.keys(treeData);
        let childrenHtml = '';

        for (const category of categories) {
            const files = treeData[category];
            if (!Array.isArray(files) || files.length === 0) continue;

            const basePath = category.includes('/') ? category + '/' : '';
            const safeCategory = this._escapeHtml(category);

            // 🔥 【架构升级核心】：显隐和图标状态完全从 Model 里的 Set 实时读取！
            const isFolderOpen = this.model.expandedNodes.has(category);
            const toggleIcon = isFolderOpen ? '▼' : '▶';
            const openClass = isFolderOpen ? 'open' : '';

            childrenHtml += `
                <div class="dir-category">
                    <div class="dir-category-header" data-action="toggle-folder" data-path="${safeCategory}">
                        <span class="toggle-icon">${toggleIcon}</span>
                        <span class="category-name">📁 ${safeCategory} (${files.length})</span>
                    </div>
                    <ul class="dir-file-list ${openClass}">
            `;

            for (const fileName of files) {
                const fullPath = basePath + fileName;
                const safeFileName = this._escapeHtml(fileName);
                const safeFullPath = this._escapeHtml(fullPath);

                childrenHtml += `
                    <li class="dir-file-item" data-action="click-file-item" data-path="${safeFullPath}">
                        📄 ${safeFileName}
                    </li>
                `;
            }
            childrenHtml += `</ul></div>`;
        }

        // 检查根节点状态
        const isRootOpen = this.model.expandedNodes.has(rootName);
        const rootIcon = isRootOpen ? '▼' : '▶';
        const rootOpenClass = isRootOpen ? 'open' : '';

        body.innerHTML = `
            <div class="dir-tree">
                <div class="dir-category">
                    <div class="dir-category-header" data-action="toggle-folder" data-path="${this._escapeHtml(rootName)}">
                        <span class="toggle-icon">${rootIcon}</span>
                        <span class="category-name">📁 ${this._escapeHtml(rootName)} (${categories.length})</span>
                    </div>
                    <div class="dir-file-list ${rootOpenClass}">
                        ${childrenHtml}
                    </div>
                </div>
            </div>
        `;
    }
    /** @private */
    _initListeners() {
        // 搜索词变化 → 用过滤后的数据重新渲染
        this.model.addEventListener('search:changed', () => {
            this._refreshContent();
        });

        // 当 rawData 变更时重新渲染内容（保留当前搜索过滤）
        this.model.addEventListener('data:changed', () => {
            this._refreshContent();
        });

        // 数据点击事件处理（事件委托）
        this._initDataActionListener();
    }

    /**
     * @private 根据当前 model 的 rawData 和 dataType 重新渲染内容区
     */
    _refreshContent() {
        const data =
            typeof this.model.getFilteredData === 'function'
                ? this.model.getFilteredData()
                : this.model.rawData;

        if (this.model.dataType === 'list') {
            this._renderDataList(data);
        } else if (this.model.dataType === 'tree') {
            this._renderTree(data);
        }
    }

    /** @private */
    _initDataActionListener() {
        const body = this.element.querySelector('.panel-body');
        if (!body) return;

        this.dataActionClickHandler = (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.getAttribute('data-action');

            // 树节点的折叠/展开由 View 直接处理，不走事件总线
            if (action === 'toggle-folder') {
                const path = target.getAttribute('data-path');
                if (this.model.toggleNodeExpand) {
                    this.model.toggleNodeExpand(path);
                }
                // 重新渲染树以反映折叠状态变化
                this._refreshContent();
                return;
            }

            const eventData = {
                action,
                type: target.getAttribute('data-type'),
                id: target.getAttribute('data-id'),
                path: target.getAttribute('data-path'),
                originalEvent: e,
            };

            // 发送 data:action:click 事件，供 manager 通过 eventBus 处理
            this.model.emit('data:action:click', eventData);
        };

        body.addEventListener('click', this.dataActionClickHandler);
    }

    /**
     * @private 安全防注入 XSS
     * @param {string} str
     */
    _escapeHtml(str) {
        return str.replace(/[&<>"]/g, (m) => {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            return m;
        });
    }

    /** 清理资源并移除事件监听 */
    destroy() {
        const body = this.element.querySelector('.panel-body');
        if (body && this.dataActionClickHandler) {
            body.removeEventListener('click', this.dataActionClickHandler);
        }
        this.dataActionClickHandler = null;

        if (this.searchInput && this._searchInputHandler) {
            this.searchInput.removeEventListener('input', this._searchInputHandler);
        }
        this.searchInput = null;
        this._searchInputHandler = null;

        this.element.innerHTML = '';
    }
}
