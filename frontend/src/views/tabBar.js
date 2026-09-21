/**
 * frontend/src/views/tabBar.js —— 页面（工作区）选项卡栏
 *
 * 顶部 tab 栏的视图层：渲染页面列表、切换、新建、关闭、双击改名、拖拽排序，
 * 以及右侧「＋」与「🗂️ 页面管理」浮层（逐页保存成文件 / 新建 / 关闭 / 改名）。
 *
 * 本文件不持有任何页面数据：所有动作都转成 `PageManager` 的调用，页面一变
 * （`onChange`）就整栏重绘 —— 页面数量是「人眼级」的规模，重绘比增量同步更不容易出错。
 *
 * 「保存到文件」怎么落地由外部注入（`onSavePage` / `onSaveAll`）：VS Code 里走宿主的保存对话框，
 * 浏览器里退化成下载（见 frontend/src/index.js）。
 */

/** 关闭/清空前确认的默认实现（宿主与浏览器都支持 window.confirm） */
function defaultConfirm(message) {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') return window.confirm(message);
    return true;
}

export class TabBar {
    /**
     * @param {{
     *   pageManager: import('../controllers/pageManager.js').PageManager,
     *   host?: HTMLElement | null,
     *   onSavePage?: ((pageId: string) => void) | null,
     *   onSaveAll?: (() => void) | null,
     *   onStatus?: ((text: string) => void) | null,
     *   confirm?: ((message: string) => boolean) | null,
     * }} options
     */
    constructor({ pageManager, host = null, onSavePage = null, onSaveAll = null, onStatus = null, confirm = null }) {
        this.pageManager = pageManager;
        this.onSavePage = onSavePage;
        this.onSaveAll = onSaveAll;
        this.onStatus = onStatus;
        this.confirm = confirm || defaultConfirm;

        this.host = host || document.querySelector('.tabs-panel');
        /** @type {HTMLElement | null} */
        this.listEl = null;
        /** @type {HTMLElement | null} */
        this.scrollEl = null;
        /** @type {HTMLElement | null} */
        this.actionsEl = null;
        /** @type {HTMLElement | null} */
        this.panelEl = null;
        /** @type {Map<string, HTMLElement>} 页面 id → tab 元素 */
        this.tabs = new Map();

        /** @private 正在拖拽的页面 id */
        this._dragId = null;
        /** @private 取消订阅页面变化 */
        this._unsubscribe = null;
        /** @private 浮层的外部点击/按键关闭 */
        this._outsideHandler = null;
        /** @private */
        this._keyHandler = null;

        if (!this.host) {
            console.warn('[tab] 找不到 .tabs-panel，选项卡栏未启用');
            return;
        }
        this.listEl = /** @type {HTMLElement | null} */ (this.host.querySelector('#pageTabsList'));
        this.scrollEl = /** @type {HTMLElement | null} */ (this.host.querySelector('.tabs-scroll'));
        if (!this.listEl) {
            console.warn('[tab] 找不到 #pageTabsList，选项卡栏未启用');
            return;
        }

        this._buildActions();
        this._bindTabEvents();
        /** @private 取消「页面变化 → 重绘」的订阅（destroy 时调用） */
        this._unsubscribe = this.pageManager.onChange(() => this.render());
        this.render();
    }

    // ========= 渲染 =========

    /** 按当前页面列表整栏重绘（浮层打开时一并刷新） */
    render() {
        if (!this.listEl) return;
        this.listEl.textContent = '';
        this.tabs = new Map();

        this.pageManager.describe().forEach((page) => {
            const tab = this._buildTab(page);
            this.listEl?.appendChild(tab);
            this.tabs.set(page.id, tab);
        });

        this._scrollActiveIntoView();
        if (this.panelEl) this._renderPanel();
    }

    /**
     * @private
     * @param {any} page - PageManager.describe() 的一项
     * @returns {HTMLElement}
     */
    _buildTab(page) {
        const tab = document.createElement('div');
        tab.className = page.active ? 'page-tab active' : 'page-tab';
        tab.dataset.pageId = page.id;
        tab.draggable = true;
        tab.title = `${page.name} · ${page.nodeCount} 个节点 / ${page.connectionCount} 条连线（双击改名，拖动排序）`;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', page.active ? 'true' : 'false');

        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = page.name;

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'tab-close';
        close.title = page.nodeCount || page.connectionCount ? '关闭页面（内容非空，会先确认）' : '关闭页面';
        close.textContent = '✕';

        tab.append(name, close);
        return tab;
    }

    /** @private 让激活的 tab 滚进可视区（tab 很多时） */
    _scrollActiveIntoView() {
        const active = Array.from(this.tabs.values()).find((tab) => tab.classList.contains('active'));
        if (active && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    // ========= 动作 =========

    /** 新建页面并切过去 @returns {any} 新页面 */
    newPage() {
        const page = this.pageManager.createPage();
        this._status(`已新建页面「${page.name}」`);
        return page;
    }

    /** @param {string | number} id @returns {boolean} 是否切换成功 */
    switchPage(id) {
        return this.pageManager.switchTo(id);
    }

    /**
     * 请求关闭页面：内容非空先确认（关掉就没了；想留先用「保存此页」存成文件）。
     * 最后一个页面不会被删掉，改成清空内容。
     *
     * @param {string | number} id
     * @returns {boolean} 是否真的移除了页面
     */
    closePage(id) {
        const page = this.pageManager.getPage(id);
        if (!page) return false;

        const isLast = this.pageManager.order.length <= 1;
        if (!page.isEmpty) {
            const what = isLast ? '清空' : '关闭';
            const detail = `${page.nodeCount} 个节点、${page.connectionCount} 条连线`;
            if (!this.confirm(`「${page.name}」里有 ${detail}，${what}后无法恢复。确定${what}？`)) return false;
        }

        const removed = this.pageManager.closePage(page.id);
        this._status(removed ? `已关闭页面「${page.name}」` : `已清空页面「${page.name}」`);
        return removed;
    }

    /**
     * 重命名页面
     *
     * @param {string | number} id
     * @param {string} name
     * @returns {boolean} 名字是否真的变了
     */
    renamePage(id, name) {
        const changed = this.pageManager.renamePage(id, name);
        const page = this.pageManager.getPage(id);
        if (changed && page) this._status(`页面已重命名为「${page.name}」`);
        return changed;
    }

    /** 把某一页存成文件（落地方式由外部注入） @param {string | number} id */
    savePage(id) {
        const page = this.pageManager.getPage(id);
        if (!page) return false;
        if (this.onSavePage) this.onSavePage(page.id);
        else this._status('当前环境不支持保存页面');
        return true;
    }

    // ========= tab 事件（列表上做事件委托） =========

    /** @private */
    _bindTabEvents() {
        const list = this.listEl;
        if (!list) return;

        list.addEventListener('click', (e) => {
            const tab = closestTab(e.target);
            if (!tab || !tab.dataset.pageId) return;
            if (closestByClass(e.target, 'tab-close')) {
                this.closePage(tab.dataset.pageId);
                return;
            }
            this.switchPage(tab.dataset.pageId);
        });

        // 中键关闭（与编辑器里的习惯一致）
        list.addEventListener('auxclick', (e) => {
            const mouse = /** @type {MouseEvent} */ (e);
            if (mouse.button !== 1) return;
            const tab = closestTab(e.target);
            if (!tab || !tab.dataset.pageId) return;
            e.preventDefault();
            this.closePage(tab.dataset.pageId);
        });

        list.addEventListener('dblclick', (e) => {
            const tab = closestTab(e.target);
            if (!tab || !tab.dataset.pageId) return;
            this._startRename(tab.dataset.pageId);
        });

        list.addEventListener('dragstart', (e) => this._onDragStart(e));
        list.addEventListener('dragover', (e) => this._onDragOver(e));
        list.addEventListener('drop', (e) => this._onDrop(e));
        list.addEventListener('dragend', () => this._endDrag());
        list.addEventListener('dragleave', () => this._clearDropMarks());
    }

    /**
     * @private 双击 tab：就地换成输入框改名（回车/失焦提交，Esc 取消）
     * @param {string} id
     */
    _startRename(id) {
        const tab = this.tabs.get(id);
        const page = this.pageManager.getPage(id);
        const nameEl = tab ? tab.querySelector('.tab-name') : null;
        if (!tab || !page || !nameEl) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tab-rename-input';
        input.value = page.name;
        input.setAttribute('aria-label', '页面名称');

        tab.classList.add('editing');
        tab.draggable = false;
        tab.replaceChild(input, nameEl);

        let done = false;
        const finish = (commit) => {
            if (done) return;
            done = true;
            if (commit) this.renamePage(id, input.value);
            // 名字没变时不会有重绘事件，这里统一重绘一次把输入框换回文字
            this.render();
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finish(true);
            else if (e.key === 'Escape') finish(false);
            // 别让画布快捷键抢走输入（Delete / H / G / F …）
            e.stopPropagation();
        });
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('blur', () => finish(true));
        input.focus();
        if (typeof input.select === 'function') input.select();
    }

    /** @private */
    _onDragStart(e) {
        const tab = closestTab(e.target);
        if (!tab || !tab.dataset.pageId) return;
        this._dragId = tab.dataset.pageId;
        tab.classList.add('dragging');
        const transfer = /** @type {DragEvent} */ (e).dataTransfer;
        if (transfer) {
            transfer.effectAllowed = 'move';
            try {
                transfer.setData('text/plain', this._dragId);
            } catch {
                // 个别浏览器只允许 text —— 拖拽状态本来也存在 this._dragId 上
            }
        }
    }

    /** @private */
    _onDragOver(e) {
        if (!this._dragId) return;
        const tab = closestTab(e.target);
        if (!tab || tab.dataset.pageId === this._dragId) return;
        e.preventDefault();
        const transfer = /** @type {DragEvent} */ (e).dataTransfer;
        if (transfer) transfer.dropEffect = 'move';

        const rect = tab.getBoundingClientRect();
        const after = /** @type {MouseEvent} */ (e).clientX > rect.left + rect.width / 2;
        this._clearDropMarks();
        tab.classList.add(after ? 'drop-after' : 'drop-before');
    }

    /** @private */
    _onDrop(e) {
        if (!this._dragId) return;
        const tab = closestTab(e.target);
        if (!tab || !tab.dataset.pageId) return;
        e.preventDefault();

        const movedId = this._dragId;
        const targetId = tab.dataset.pageId;
        const rect = tab.getBoundingClientRect();
        const after = /** @type {MouseEvent} */ (e).clientX > rect.left + rect.width / 2;
        this._endDrag();
        if (targetId === movedId) return;

        const order = this.pageManager.order;
        const from = order.indexOf(movedId);
        const targetIndex = order.indexOf(targetId);
        if (from < 0 || targetIndex < 0) return;

        // 换算成「抽出被拖项之后」的下标（movePage 的行为）
        let index = targetIndex + (after ? 1 : 0);
        if (from < index) index -= 1;
        this.pageManager.movePage(movedId, index);
    }

    /** @private */
    _endDrag() {
        const tab = this._dragId ? this.tabs.get(this._dragId) : null;
        if (tab) tab.classList.remove('dragging');
        this._dragId = null;
        this._clearDropMarks();
    }

    /** @private */
    _clearDropMarks() {
        this.tabs.forEach((tab) => tab.classList.remove('drop-before', 'drop-after'));
    }

    // ========= 「＋ / 页面管理」按钮与浮层 =========

    /** @private 在 tabs 右侧建按钮区 */
    _buildActions() {
        const host = /** @type {HTMLElement} */ (this.host);
        const actions = document.createElement('div');
        actions.className = 'tabs-actions';

        this.addBtn = document.createElement('button');
        this.addBtn.type = 'button';
        this.addBtn.className = 'tabs-add';
        this.addBtn.title = '新建页面（新的一块画布工作区）';
        this.addBtn.textContent = '＋';
        this.addBtn.addEventListener('click', () => this.newPage());

        this.managerBtn = document.createElement('button');
        this.managerBtn.type = 'button';
        this.managerBtn.className = 'page-manager-btn';
        this.managerBtn.title = '页面管理（改名 / 存成文件 / 关闭）';
        this.managerBtn.textContent = '🗂️ 页面管理';
        this.managerBtn.addEventListener('click', () => this.togglePanel());

        actions.append(this.addBtn, this.managerBtn);
        host.appendChild(actions);
        this.actionsEl = actions;
    }

    /** 打开/关闭「页面管理」浮层 @param {boolean} [force] */
    togglePanel(force) {
        const wantOpen = force === undefined ? !this.panelEl : !!force;
        if (wantOpen) this._openPanel();
        else this.closePanel();
    }

    /** 关闭「页面管理」浮层 */
    closePanel() {
        if (this.panelEl) this.panelEl.classList.add('hidden');
        this.managerBtn?.classList.remove('active');
        if (this._outsideHandler) {
            document.removeEventListener('mousedown', this._outsideHandler, true);
            this._outsideHandler = null;
        }
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    }

    /** @private */
    _openPanel() {
        if (!this.panelEl) {
            this.panelEl = this._buildPanel();
            document.body.appendChild(this.panelEl);
        }
        this.panelEl.classList.remove('hidden');
        this.managerBtn?.classList.add('active');
        this._renderPanel();

        if (!this._outsideHandler) {
            this._outsideHandler = (e) => {
                const target = /** @type {Node} */ (e.target);
                if (this.panelEl && this.panelEl.contains(target)) return;
                if (this.managerBtn && this.managerBtn.contains(target)) return;
                this.closePanel();
            };
            document.addEventListener('mousedown', this._outsideHandler, true);
        }
        if (!this._keyHandler) {
            this._keyHandler = (e) => {
                if (e.key === 'Escape') this.closePanel();
            };
            document.addEventListener('keydown', this._keyHandler);
        }
    }

    /**
     * @private 建浮层骨架（列表与底部动作都靠事件委托）
     * @returns {HTMLElement}
     */
    _buildPanel() {
        const panel = document.createElement('div');
        panel.className = 'page-manager-panel';

        const header = document.createElement('div');
        header.className = 'panel-header';
        const title = document.createElement('span');
        title.textContent = '🗂️ 页面管理';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'close-panel';
        closeBtn.title = '关闭面板';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => this.closePanel());
        header.append(title, closeBtn);

        const search = document.createElement('div');
        search.className = 'panel-search';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'page-rename-input';
        input.placeholder = '当前页面名称（回车改名）';
        input.setAttribute('aria-label', '当前页面名称');
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const active = this.pageManager.activePage;
            if (active) this.renamePage(active.id, input.value);
            input.blur();
        });
        search.appendChild(input);

        const list = document.createElement('div');
        list.className = 'file-list page-list';

        const actions = document.createElement('div');
        actions.className = 'panel-actions';
        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.dataset.act = 'new';
        newBtn.textContent = '＋ 新建页面';
        const saveAllBtn = document.createElement('button');
        saveAllBtn.type = 'button';
        saveAllBtn.dataset.act = 'save-all';
        saveAllBtn.textContent = '💾 保存全部';
        actions.append(newBtn, saveAllBtn);

        panel.append(header, search, list, actions);

        panel.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            const actionBtn = closestByClass(target, 'page-item-btn') || closestByDataAct(target);
            const item = closestByClass(target, 'page-item');

            if (actionBtn && item && item.dataset.pageId) {
                const act = actionBtn.dataset.act;
                if (act === 'save') this.savePage(item.dataset.pageId);
                else if (act === 'close') this.closePage(item.dataset.pageId);
                return;
            }
            const act = target.dataset ? target.dataset.act : null;
            if (act === 'new') {
                this.newPage();
                return;
            }
            if (act === 'save-all') {
                this.onSaveAll?.();
                return;
            }
            if (item && item.dataset.pageId) this.switchPage(item.dataset.pageId);
        });

        return panel;
    }

    /** @private 重画浮层里的页面列表与名称输入框 */
    _renderPanel() {
        const panel = this.panelEl;
        if (!panel) return;
        const list = panel.querySelector('.page-list');
        if (!list) return;
        list.textContent = '';

        this.pageManager.describe().forEach((page) => {
            const item = document.createElement('div');
            item.className = page.active ? 'file-item page-item active' : 'file-item page-item';
            item.dataset.pageId = page.id;

            const name = document.createElement('span');
            name.className = 'page-item-name';
            name.textContent = page.name;

            const meta = document.createElement('span');
            meta.className = 'page-item-meta';
            meta.textContent = `${page.nodeCount} 节点 / ${page.connectionCount} 连线`;

            const save = document.createElement('button');
            save.type = 'button';
            save.className = 'page-item-btn';
            save.dataset.act = 'save';
            save.title = '保存此页到文件';
            save.textContent = '💾';

            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'page-item-btn page-item-close';
            close.dataset.act = 'close';
            close.title = '关闭页面';
            close.textContent = '✕';

            item.append(name, meta, save, close);
            list.appendChild(item);
        });

        const input = panel.querySelector('.page-rename-input');
        const active = this.pageManager.activePage;
        if (input && active && document.activeElement !== input) input.value = active.name;
    }

    /** @private */
    _status(text) {
        if (this.onStatus) this.onStatus(text);
    }

    /** 卸载：取消订阅、移除浮层与自己建的按钮区 */
    destroy() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this.closePanel();
        if (this.panelEl) {
            this.panelEl.remove();
            this.panelEl = null;
        }
        if (this.actionsEl) {
            this.actionsEl.remove();
            this.actionsEl = null;
        }
        if (this.listEl) this.listEl.textContent = '';
        this.tabs = new Map();
    }
}

/**
 * @param {EventTarget | null} target
 * @returns {HTMLElement | null} 事件目标所在的 tab 元素
 */
function closestTab(target) {
    return /** @type {HTMLElement | null} */ (closestByClass(target, 'page-tab'));
}

/**
 * @param {EventTarget | null} target
 * @param {string} className
 * @returns {HTMLElement | null}
 */
function closestByClass(target, className) {
    if (!target || typeof (/** @type {Element} */ (target).closest) !== 'function') return null;
    return /** @type {HTMLElement | null} */ (/** @type {Element} */ (target).closest(`.${className}`));
}

/**
 * @param {EventTarget | null} target
 * @returns {HTMLElement | null}
 */
function closestByDataAct(target) {
    if (!target || typeof (/** @type {Element} */ (target).closest) !== 'function') return null;
    return /** @type {HTMLElement | null} */ (/** @type {Element} */ (target).closest('[data-act]'));
}
