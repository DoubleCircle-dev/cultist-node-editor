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
        } else if (this.model.dataType === 'help') {
            this._renderHelp(this.model.rawData);
        } else if (this.model.dataType === 'shortcuts') {
            this._renderShortcuts(this.model.rawData);
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
     * @private 渲染帮助面板内容
     * @param {{ sections: Array<{id: string, title: string, icon?: string, content?: string, items?: Array<{title?: string, desc?: string, key?: string, action?: string}>}> }} helpData
     */
    _renderHelp(helpData) {
        const body = this.element.querySelector('.panel-body');
        if (!helpData || !helpData.sections || helpData.sections.length === 0) {
            body.innerHTML = '<div class="empty-tip">📭 暂无帮助内容</div>';
            return;
        }

        let html = '<div class="help-content">';

        for (const section of helpData.sections) {
            const icon = this._escapeHtml(section.icon || '📄');
            const title = this._escapeHtml(section.title || '');

            html += '<div class="help-section">';
            html += `<div class="help-section-header" data-action="toggle-help-section" data-section="${this._escapeHtml(section.id)}">`;
            html += `<span class="help-section-icon">${icon}</span>`;
            html += `<span class="help-section-title">${title}</span>`;
            html += `<span class="help-section-arrow">▼</span>`;
            html += '</div>';

            html += '<div class="help-section-body">';

            // 纯文本内容
            if (section.content) {
                html += `<div class="help-paragraph">${this._escapeHtml(section.content)}</div>`;
            }

            // 列表项（基础操作、快捷键等）
            if (section.items && section.items.length > 0) {
                html += '<div class="help-items">';
                for (const item of section.items) {
                    if (item.key) {
                        // 快捷键条目
                        html += '<div class="help-item shortcut-item">';
                        html += `<span class="help-key">${this._escapeHtml(item.key)}</span>`;
                        html += `<span class="help-key-desc">${this._escapeHtml(item.action || '')}</span>`;
                        html += '</div>';
                    } else {
                        // 普通说明条目
                        html += '<div class="help-item">';
                        html += `<div class="help-item-title">${this._escapeHtml(item.title || '')}</div>`;
                        if (item.desc) {
                            html += `<div class="help-item-desc">${this._escapeHtml(item.desc)}</div>`;
                        }
                        html += '</div>';
                    }
                }
                html += '</div>';
            }

            html += '</div>'; // .help-section-body
            html += '</div>'; // .help-section
        }

        html += '</div>'; // .help-content

        body.innerHTML = html;
    }

    /**
     * @private 渲染快捷键面板（可编辑）
     * @param {Array<{id: string, key: string, action: string, category: string, editable: boolean}>} shortcuts
     */
    _renderShortcuts(shortcuts) {
        const body = this.element.querySelector('.panel-body');
        if (!shortcuts || shortcuts.length === 0) {
            body.innerHTML = '<div class="empty-tip">⌨️ 暂无可配置快捷键</div>';
            return;
        }

        // 按 category 分组
        const groups = new Map();
        for (const sc of shortcuts) {
            const cat = sc.category || '其他';
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(sc);
        }

        let html = '<div class="shortcuts-content">';

        for (const [category, items] of groups) {
            html += '<div class="shortcuts-category">';
            html += `<div class="shortcuts-category-title">📂 ${this._escapeHtml(category)}</div>`;

            for (const item of items) {
                const safeId = this._escapeHtml(item.id);
                const safeKey = this._escapeHtml(item.key);
                const safeAction = this._escapeHtml(item.action);
                const editable = item.editable !== false;

                html += '<div class="shortcut-row">';
                html += `<span class="shortcut-action-label">${safeAction}</span>`;

                if (editable) {
                    html += `<span class="shortcut-key-badge editable" data-action="edit-shortcut" data-sid="${safeId}" title="点击修改快捷键">${safeKey} ✎</span>`;
                } else {
                    html += `<span class="shortcut-key-badge readonly">${safeKey}</span>`;
                }

                html += '</div>';
            }

            html += '</div>';
        }

        // 保存按钮
        html += '<div class="shortcuts-footer">';
        html += '<button class="btn-save-shortcuts" data-action="save-shortcuts">💾 保存快捷键配置</button>';
        html += '<span class="shortcuts-hint">点击带 ✎ 的按键可重新绑定</span>';
        html += '</div>';

        html += '</div>';

        body.innerHTML = html;

        /** @type {HTMLElement | null} */
        this._editingShortcutEl = null;
        /** @type {string | null} */
        this._editingShortcutId = null;
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
        } else if (this.model.dataType === 'help') {
            this._renderHelp(data);
        } else if (this.model.dataType === 'shortcuts') {
            this._renderShortcuts(data);
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

            // 帮助面板区块的折叠/展开，直接操作 DOM 切换 class
            if (action === 'toggle-help-section') {
                const section = target.closest('.help-section');
                if (section) {
                    section.classList.toggle('collapsed');
                }
                return;
            }

            // 快捷键编辑：点击可编辑的快捷键标签，进入按键捕获模式
            if (action === 'edit-shortcut') {
                this._startShortcutEdit(target);
                return;
            }

            // 保存快捷键配置
            if (action === 'save-shortcuts') {
                this.model.emit('data:action:click', {
                    action: 'save-shortcuts',
                    type: '',
                    id: '',
                    path: '',
                    originalEvent: e,
                });
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
     * @private 开始快捷键编辑捕获模式
     * @param {HTMLElement} target - 被点击的快捷键标签元素
     */
    _startShortcutEdit(target) {
        // 如果已有正在编辑的，先取消
        if (this._editingShortcutEl) {
            this._cancelShortcutEdit();
        }

        const sid = target.getAttribute('data-sid');
        if (!sid) return;

        this._editingShortcutEl = target;
        this._editingShortcutId = sid;

        // 保存原始文本，进入编辑态
        target.classList.add('capturing');
        target.textContent = '按下新按键...';

        /** @param {KeyboardEvent} e */
        this._shortcutKeydownHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                this._cancelShortcutEdit();
                return;
            }

            // 忽略单独的修饰键
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

            // 构建快捷键字符串
            const parts = [];
            if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
            if (e.shiftKey) parts.push('Shift');
            if (e.altKey) parts.push('Alt');

            // 主键名美化
            let mainKey = e.key;
            if (mainKey === ' ') mainKey = 'Space';
            else if (mainKey.length === 1) mainKey = mainKey.toUpperCase();
            else if (mainKey === 'ArrowUp') mainKey = '↑';
            else if (mainKey === 'ArrowDown') mainKey = '↓';
            else if (mainKey === 'ArrowLeft') mainKey = '←';
            else if (mainKey === 'ArrowRight') mainKey = '→';
            parts.push(mainKey);

            const newKey = parts.join('+');

            // 更新 DOM 显示
            if (this._editingShortcutEl) {
                this._editingShortcutEl.classList.remove('capturing');
                this._editingShortcutEl.textContent = newKey + ' ✎';
            }

            // 通知 model 更新数据
            this.model.emit('data:action:click', {
                action: 'shortcut-changed',
                type: '',
                id: this._editingShortcutId,
                path: newKey,
                originalEvent: e,
            });

            this._editingShortcutEl = null;
            this._editingShortcutId = null;
            document.removeEventListener('keydown', this._shortcutKeydownHandler);
            this._shortcutKeydownHandler = null;
        };

        document.addEventListener('keydown', this._shortcutKeydownHandler);

        // 点击其他地方取消编辑
        /** @param {MouseEvent} e */
        this._shortcutBlurHandler = (e) => {
            if (this._editingShortcutEl && !this._editingShortcutEl.contains(e.target)) {
                this._cancelShortcutEdit();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._shortcutBlurHandler);
        }, 0);
    }

    /** @private 取消快捷键编辑 */
    _cancelShortcutEdit() {
        if (this._editingShortcutEl) {
            this._editingShortcutEl.classList.remove('capturing');
            // 从当前 rawData 中恢复原始值
            const data = this.model.rawData;
            if (data && this._editingShortcutId) {
                const item = data.find((s) => s.id === this._editingShortcutId);
                if (item) {
                    this._editingShortcutEl.textContent = (item.editable !== false) ? item.key + ' ✎' : item.key;
                }
            }
        }
        this._editingShortcutEl = null;
        this._editingShortcutId = null;
        if (this._shortcutKeydownHandler) {
            document.removeEventListener('keydown', this._shortcutKeydownHandler);
            this._shortcutKeydownHandler = null;
        }
        if (this._shortcutBlurHandler) {
            document.removeEventListener('click', this._shortcutBlurHandler);
            this._shortcutBlurHandler = null;
        }
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

        // 清理快捷键编辑状态
        if (this._shortcutKeydownHandler) {
            document.removeEventListener('keydown', this._shortcutKeydownHandler);
            this._shortcutKeydownHandler = null;
        }
        if (this._shortcutBlurHandler) {
            document.removeEventListener('click', this._shortcutBlurHandler);
            this._shortcutBlurHandler = null;
        }
        this._editingShortcutEl = null;
        this._editingShortcutId = null;

        this.element.innerHTML = '';
    }
}
