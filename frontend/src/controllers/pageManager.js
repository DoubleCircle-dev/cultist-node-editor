/**
 * frontend/src/controllers/pageManager.js —— 页面（工作区选项卡）管理
 *
 * 一个编辑器窗口显示一个 mod，tab 栏里的每个页面是**一块独立的画布工作区**：
 * 可以来回切换、改名、拖拽排序、关闭，也可以把其中一块单独存成文件。
 *
 * ## 切换是无损的
 * 页面之间不重建节点，而是把该页的**索引**交给页面记录、把节点与连线 **DOM** 搬进页面
 * 自己的停放容器（`display:none`）。模型、视图、监听器、端口连接、文本变量同步全部原样保留，
 * 切回时搬回画布即可 —— 于是 `core.nodes` 永远只含当前页，页与页互不干扰，切换也几乎没有成本。
 *
 * ## 序列化（快照）只用于两件事
 * 「存成文件」与「刷新后仍在」：`snapshot()` 按值导出（属性值 + 连线两端端口 id），
 * `importDocument()` 反向重建。切换页面不走这条路。
 *
 * 存储键 `nodeEditor.pages`。持久化默认**关闭**（测试与预览模式不该有副作用），
 * 由 `enablePersistence()` 打开（见 frontend/src/index.js）。
 */
import { IManager } from './manager.js';
import { PageModel } from '../models/pageModels/pageModel.js';

/** localStorage 键：页面列表与各自内容 */
const STORAGE_KEY = 'nodeEditor.pages';
/** 存档格式：kind 便于识别，version 便于以后迁移 */
const DOC_KIND = 'node-editor-pages';
const DOC_VERSION = '2.0';
/** 内容变化后延迟回写的毫秒数：打字、拖节点期间不反复序列化 */
const PERSIST_DEBOUNCE = 1500;
/** 页面变化事件（TabBar 订阅） */
const CHANGED_EVENT = 'pages:changed';
/** 触发「内容变了」的 DOM 事件（属性输入框改动不走 EventBus，见 enablePersistence） */
const PERSIST_DOM_EVENTS = ['input', 'change', 'mouseup'];

export class PageManager extends IManager {
    /**
     * @param {import('../types/eventBus.js').EventBus} bus
     * @param {HTMLElement} viewport
     * @param {HTMLElement} world
     * @param {import('./controllerCore.js').ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus, viewport, world, coreSpace);

        /** @type {Map<string, PageModel>} 页面 id → 页面 */
        this.pages = new Map();
        /** @type {string[]} 页面顺序（tab 从左到右） */
        this.order = [];
        /** @type {string | null} 当前激活的页面 id */
        this.activeId = null;

        /** @private 自增序号：页面 id（`page_N`）与默认名（`未命名-N`）共用 */
        this._seq = 0;
        /** @private 是否把页面写进 localStorage */
        this._persistEnabled = false;
        /** @private 上次回写之后内容是否又变过 */
        this._touched = false;
        /** @private 防抖回写定时器 */
        this._saveTimer = null;
        /** @private 防抖回写的 DOM 监听（同一引用，便于移除） */
        this._persistHandler = null;
        /** @private 关页面前的回写 */
        this._onUnload = null;

        // 图内容变化 → 刷新 tab/面板上的计数（+ 延后回写）
        ['create:node:finished', 'delete:node:finished', 'delete:all_node:success', 'change:title:success'].forEach((event) => {
            this.registerListener(this.bus, event, this._onGraphChanged);
        });

        this.createPage();
    }

    // ========= 查询 =========

    /** @returns {PageModel | null} 当前页面 */
    get activePage() {
        return this.activeId ? this.pages.get(this.activeId) || null : null;
    }

    /**
     * @param {string | number} id
     * @returns {PageModel | null}
     */
    getPage(id) {
        return this.pages.get(String(id)) || null;
    }

    /** @returns {PageModel[]} 页面列表（按 tab 顺序） */
    get pageList() {
        return this.order.map((id) => this.pages.get(id)).filter(Boolean);
    }

    /**
     * 页面列表快照（渲染 tab 与「页面管理」面板用）
     *
     * @returns {Array<{ id: string, name: string, active: boolean, nodeCount: number, connectionCount: number }>}
     */
    describe() {
        return this.order.map((id) => {
            const page = this.pages.get(id);
            return {
                id: page.id,
                name: page.name,
                active: page.id === this.activeId,
                nodeCount: page.nodeCount,
                connectionCount: page.connectionCount,
            };
        });
    }

    /**
     * 订阅页面变化（列表 / 顺序 / 激活页 / 计数），返回取消订阅函数
     *
     * @param {(pages: Array<any>) => void} callback
     * @returns {() => void}
     */
    onChange(callback) {
        if (typeof callback !== 'function') return () => {};
        const handler = () => callback(this.describe());
        this.bus.on(CHANGED_EVENT, handler);
        return () => this.bus.off(CHANGED_EVENT, handler);
    }

    // ========= 页面生命周期 =========

    /**
     * 新建页面并切过去
     *
     * @param {string} [name] - 页面名，缺省「未命名-N」
     * @param {string} [desiredId] - 指定 id（导入存档时沿用原 id），被占用时另分配
     * @returns {PageModel}
     */
    createPage(name, desiredId) {
        const id = this._nextPageId(desiredId);
        const page = new PageModel(id, name || `未命名-${this._seq}`);
        this.pages.set(id, page);
        this.order.push(id);
        this.switchTo(id);
        this._emitChanged();
        this._scheduleSave();
        return page;
    }

    /**
     * 切换页面：收起当前页（索引换手 + DOM 搬进停放容器），展开目标页
     *
     * @param {string | number} id
     * @returns {boolean} 是否切换成功（id 不存在时 false；已在该页时也为 true）
     */
    switchTo(id) {
        const target = this.getPage(id);
        if (!target) {
            console.warn(`[页面] 找不到页面：${id}`);
            return false;
        }
        if (this.activeId === target.id) return true;

        const current = this.activePage;
        if (current) this._deactivate(current);
        this._activate(target);
        this._scheduleSave();
        return true;
    }

    /**
     * 关闭页面。
     *
     * 最后一个页面不删（不存在「一个页面都没有」的状态），改为清空内容：
     * 返回值说明实际做了什么 —— `true` 页面已移除；`false` 只清了内容。
     *
     * @param {string | number} id
     * @returns {boolean}
     */
    closePage(id) {
        const page = this.getPage(id);
        if (!page) return false;
        if (this.order.length <= 1) {
            this.clearPage(page.id);
            return false;
        }

        const index = this.order.indexOf(page.id);
        const wasActive = page.id === this.activeId;
        if (wasActive) {
            // 激活页先让位：索引交还给页面记录（DOM 不用搬，马上要销毁）
            page.nodeState = this.coreSpace.nodeManager.detachPageState();
            page.connectionState = this.coreSpace.connectionManager.detachPageState();
            this.activeId = null;
        }
        this.pages.delete(page.id);
        this.order.splice(index, 1);
        this._disposePage(page);

        if (wasActive) {
            this.switchTo(this.order[Math.min(index, this.order.length - 1)]);
        }
        this._emitChanged();
        this._scheduleSave();
        return true;
    }

    /**
     * 清空某一页的内容（页面本身保留）
     *
     * @param {string | number} id
     * @returns {boolean}
     */
    clearPage(id) {
        const page = this.getPage(id);
        if (!page) return false;
        if (!page.isEmpty) {
            this._withPageState(page, () => {
                this.coreSpace.connectionManager.clear();
                this.coreSpace.nodeManager.clear();
            });
            this._reserveIds();
            this._syncPlaceholder();
            this.coreSpace.historyManager.clear();
        }
        this._emitChanged();
        this._scheduleSave();
        return true;
    }

    /**
     * 重命名页面
     *
     * @param {string | number} id
     * @param {string} name
     * @returns {boolean} 名字是否真的变了
     */
    renamePage(id, name) {
        const page = this.getPage(id);
        if (!page) return false;
        const next = String(name == null ? '' : name).trim();
        if (!next || next === page.name) return false;
        page.name = next;
        this._emitChanged();
        this._scheduleSave();
        return true;
    }

    /**
     * 调整页面顺序（tab 拖拽排序）
     *
     * @param {string | number} id
     * @param {number} index - 目标下标（0 起）
     * @returns {boolean}
     */
    movePage(id, index) {
        const page = this.getPage(id);
        if (!page) return false;
        const from = this.order.indexOf(page.id);
        const to = Math.max(0, Math.min(this.order.length - 1, Math.round(Number(index))));
        if (from < 0 || from === to) return false;
        this.order.splice(from, 1);
        this.order.splice(to, 0, page.id);
        this._emitChanged();
        this._scheduleSave();
        return true;
    }

    // ========= 快照 / 导入 =========

    /**
     * 取「用来铺图」的页面：当前页还是空的就直接用，已经有内容就新开一页。
     *
     * 读 mod / 预览 json 是「换一个数据集」，不该把节点堆进正在编辑的页面里；
     * 新页面的名字用数据来源（如 `Mod:xxx`），tab 上就能看出这一页是哪个 mod。
     * 已经有同名页面时（把同一个 mod 再读一次）切回去用，免得开出一堆同名 tab。
     *
     * @param {string} [name] - 新页面名（缺省「未命名-N」）
     * @returns {PageModel}
     */
    pageForImport(name) {
        const active = this.activePage;
        if (active && active.isEmpty) {
            // 空的默认页顺手改成数据来源的名字（用户自己改过名的不动）
            if (name && /^未命名-\d+$/.test(active.name)) this.renamePage(active.id, name);
            return active;
        }

        const sameName = name ? this.pageList.find((page) => page.name === name) : null;
        if (sameName) {
            this.switchTo(sameName.id);
            return sameName;
        }
        return this.createPage(name);
    }

    /**
     * 导出页面（「💾 保存」与刷新后恢复用）
     *
     * @param {{ pageId?: string | number, activeOnly?: boolean }} [opts] -
     *   pageId：只导出该页（「保存此页到文件」）；activeOnly：只导出当前页
     * @returns {any} 文档：`{ kind, version, metadata, pages }`
     */
    snapshot(opts = {}) {
        const ids = opts.pageId != null ? [String(opts.pageId)] : opts.activeOnly ? [this.activeId] : this.order;
        const pages = ids.filter(Boolean).map((id) => this.snapshotPage(id)).filter(Boolean);
        return {
            kind: DOC_KIND,
            version: DOC_VERSION,
            metadata: {
                created: new Date().toISOString(),
                activePageId: this.activeId,
                pageCount: pages.length,
            },
            pages,
        };
    }

    /**
     * 导出单个页面（非激活页会临时借用活索引取数）
     *
     * @param {string | number} id
     * @returns {any | null}
     */
    snapshotPage(id) {
        const page = this.getPage(id);
        if (!page) return null;
        const graph = this._withPageState(page, () => ({
            nodes: this.coreSpace.nodeManager.snapshotNodes(),
            connections: this.coreSpace.connectionManager.snapshotConnections(),
        }));
        const active = page.id === this.activeId;
        return {
            id: page.id,
            name: page.name,
            view: active ? { ...this.coreSpace.canvasManager.transform } : { ...page.view },
            mode: active ? this.coreSpace.canvasManager.mode : page.mode,
            nodes: graph.nodes,
            connections: graph.connections,
        };
    }

    /**
     * 导入文档：宿主「📂 加载」回发的 graphLoaded、浏览器选文件、localStorage 恢复都走这里。
     *
     * 兼容两种形状：`{ pages: [...] }`（本模块导出的）与旧的 `{ nodes, connections }`（当单页处理）。
     * 导入是**整体替换**：先把现有页面全部丢弃。
     *
     * @param {any} doc
     * @returns {{ pages: number, nodes: number, connections: number }}
     */
    importDocument(doc) {
        /** @type {{ pages: number, nodes: number, connections: number }} */
        const stats = { pages: 0, nodes: 0, connections: 0 };
        if (!doc || typeof doc !== 'object') {
            console.warn('[页面] 导入的内容不是一个对象');
            return stats;
        }
        const rawPages =
            Array.isArray(doc.pages) && doc.pages.length
                ? doc.pages
                : [{ id: null, name: '导入的页面', nodes: doc.nodes, connections: doc.connections }];

        this._clearAllPages();

        rawPages.forEach((raw, index) => {
            const page = this.createPage((raw && raw.name) || `未命名-${index + 1}`, raw && raw.id);
            stats.pages += 1;
            // 新建的页面就是当前页，直接往活索引里恢复
            stats.nodes += this.coreSpace.nodeManager.restoreNodes(raw && raw.nodes);
            stats.connections += this.coreSpace.connectionManager.restoreConnections(raw && raw.connections);
            if (raw && raw.view) {
                Object.assign(this.coreSpace.canvasManager.transform, raw.view);
                this.coreSpace.canvasManager.updateTransform();
            }
            if (raw && raw.mode) this.coreSpace.canvasManager.setMode(raw.mode);
        });

        const wantedActive = doc.metadata && doc.metadata.activePageId;
        if (wantedActive && this.pages.has(String(wantedActive))) {
            this.switchTo(String(wantedActive));
        }

        this._syncPlaceholder();
        this._emitChanged();
        this._scheduleSave();
        return stats;
    }

    // ========= 持久化（刷新后仍在） =========

    /**
     * 打开「刷新后仍在」：先按存档恢复页面，再订阅变化自动回写。
     *
     * 默认关闭（测试与预览模式不该有副作用），由 frontend/src/index.js 在正式启动时调用一次。
     *
     * ⚠️ 节点属性输入框里的改动不会经过 EventBus（那是节点模型自己的事件），所以除总线事件外，
     * 还在 document 上以捕获阶段听 input / change / mouseup，用防抖回写兜住这类改动。
     *
     * @returns {this}
     */
    enablePersistence() {
        if (this._persistEnabled) return this;
        this._persistEnabled = true;
        this.restoreFromStorage();

        this._persistHandler = () => this._scheduleSave();
        PERSIST_DOM_EVENTS.forEach((type) => document.addEventListener(type, this._persistHandler, true));
        this._onUnload = () => this.save();
        window.addEventListener('beforeunload', this._onUnload);
        return this;
    }

    /**
     * 立即把全部页面写进 localStorage
     *
     * @returns {boolean} 是否写入成功（未开启持久化时 false）
     */
    save() {
        if (!this._persistEnabled || typeof localStorage === 'undefined') return false;
        this._touched = false;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot()));
            return true;
        } catch (error) {
            console.warn('[页面] 写入 localStorage 失败:', error);
            return false;
        }
    }

    /**
     * 从 localStorage 恢复页面（没有存档时什么都不做）
     *
     * @returns {{ pages: number, nodes: number, connections: number } | null}
     */
    restoreFromStorage() {
        if (typeof localStorage === 'undefined') return null;
        let raw = null;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
        } catch {
            return null;
        }
        if (!raw) return null;
        try {
            const stats = this.importDocument(JSON.parse(raw));
            console.log(`[页面] 已恢复 ${stats.pages} 个页面 / ${stats.nodes} 个节点`);
            return stats;
        } catch (error) {
            console.warn('[页面] 存档解析失败，已忽略:', error);
            return null;
        }
    }

    /** 清掉 localStorage 存档（重置页面用） @returns {boolean} */
    clearStorage() {
        if (typeof localStorage === 'undefined') return false;
        try {
            localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch {
            return false;
        }
    }

    // ========= 内部实现 =========

    /** @private 图内容变化：刷新计数并延后回写 */
    _onGraphChanged() {
        this._emitChanged();
        this._scheduleSave();
    }

    /** @private 通知订阅者 */
    _emitChanged() {
        this.bus.emit(CHANGED_EVENT, { pages: this.describe(), activeId: this.activeId });
    }

    /** @private 延后回写（防抖；没有变化就不写） */
    _scheduleSave() {
        if (!this._persistEnabled) return;
        this._touched = true;
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            if (this._touched) this.save();
        }, PERSIST_DEBOUNCE);
    }

    /**
     * @private 收起当前页：记住视图与模式 → 索引换手 → 节点/连线 DOM 搬进停放容器
     * @param {PageModel} page
     */
    _deactivate(page) {
        const nm = this.coreSpace.nodeManager;
        const cm = this.coreSpace.connectionManager;

        page.view = { ...this.coreSpace.canvasManager.transform };
        page.mode = this.coreSpace.canvasManager.mode;

        // 先把 DOM 搬进停放容器，再交出索引 —— 索引一换手，管理器里就没有这些节点/连线了
        const parking = this._parkingFor(page);
        cm.moveLinesTo(parking);
        nm.moveNodeViewsTo(parking);

        page.nodeState = nm.detachPageState();
        page.connectionState = cm.detachPageState();

        this.activeId = null;
    }

    /**
     * @private 展开目标页：索引装回 → DOM 搬回画布 → 视图/模式复位 → 重新测量
     * @param {PageModel} page
     */
    _activate(page) {
        const nm = this.coreSpace.nodeManager;
        const cm = this.coreSpace.connectionManager;

        // 新页面还没有索引：把管理器当前的（空）索引直接绑到它身上，
        // 这样「激活页的 nodeState 就是活索引」，页面的节点数/连线数永远是最新的
        if (!page.nodeState) page.nodeState = nm.detachPageState();
        if (!page.connectionState) page.connectionState = cm.detachPageState();

        nm.attachPageState(page.nodeState);
        cm.attachPageState(page.connectionState);
        // 先搬连线再搬节点：节点 DOM 排在连线之后，保持「节点压在连线之上」的层序
        cm.moveLinesTo(cm.SVG_layer);
        nm.moveNodeViewsTo(this.coreSpace.world);

        // 别的页面还占着自己的 id，别让新节点分到重号
        this._reserveIds();

        Object.assign(this.coreSpace.canvasManager.transform, page.view);
        this.coreSpace.canvasManager.updateTransform();
        if (page.mode) this.coreSpace.canvasManager.setMode(page.mode);

        // 撤销栈不跨页面：否则 Ctrl+Z 会把别的页面的节点恢复出来
        this.coreSpace.historyManager.clear();

        // 停放期间 DOM 不参与布局，回到画布后重新测量尺寸并重算连线端点
        page.nodeState?.nodeViews.forEach((view) => view.onMounted());
        cm.refreshAllConnections();

        this.activeId = page.id;
        this._syncPlaceholder();
        this.bus.emit('page:switched', { id: page.id, name: page.name });
        this._emitChanged();
    }

    /**
     * @private 丢弃一页的全部内容：先拆连线（含 SVG 与监听），再销毁节点（释放 id / 视图 / 模型）
     * @param {PageModel} page
     */
    _disposePage(page) {
        this._withPageState(page, () => {
            this.coreSpace.connectionManager.clear();
            this.coreSpace.nodeManager.discardNodes(this.coreSpace.nodeManager.nodes.values());
        });
        page.nodeState = null;
        page.connectionState = null;
        if (page.parking) {
            page.parking.remove();
            page.parking = null;
        }
    }

    /**
     * @private 丢弃全部页面（导入前清场 / 整体重置）
     * @returns {number} 丢弃的页面数
     */
    _clearAllPages() {
        const active = this.activePage;
        if (active) {
            // 激活页的活索引先交还给页面记录，再统一销毁
            active.nodeState = this.coreSpace.nodeManager.detachPageState();
            active.connectionState = this.coreSpace.connectionManager.detachPageState();
            this.activeId = null;
        }
        const count = this.order.length;
        this.order.forEach((id) => {
            const page = this.pages.get(id);
            if (page) this._disposePage(page);
        });
        this.pages.clear();
        this.order = [];
        this._seq = 0;
        this.coreSpace.canvasManager.reset();
        this.coreSpace.historyManager.clear();
        this._syncPlaceholder();
        return count;
    }

    /**
     * @private 借用活索引执行一段操作。
     *
     * 管理器只有一套活索引，「操作非激活页」只能把它的索引临时装回去：先把当前活索引摘到一边，
     * 装上目标页的，跑完再把活索引放回去。目标页正好是激活页时两边是同一批 Map，结果等价，
     * 因此调用方不需要区分页面是不是激活的。
     *
     * @template T
     * @param {PageModel} page
     * @param {() => T} action
     * @returns {T}
     */
    _withPageState(page, action) {
        const nm = this.coreSpace.nodeManager;
        const cm = this.coreSpace.connectionManager;
        const spareNodes = nm.detachPageState();
        const spareConnections = cm.detachPageState();
        nm.attachPageState(page.nodeState);
        cm.attachPageState(page.connectionState);
        try {
            return action();
        } finally {
            nm.detachPageState();
            cm.detachPageState();
            nm.attachPageState(spareNodes);
            cm.attachPageState(spareConnections);
        }
    }

    /**
     * @private 取页面自己的 DOM 停放容器（第一次切出时创建）
     * @param {PageModel} page
     * @returns {HTMLElement}
     */
    _parkingFor(page) {
        if (!page.parking) {
            const el = document.createElement('div');
            el.className = 'page-parking';
            el.dataset.pageId = page.id;
            el.hidden = true; // 停放期间不参与渲染与布局
            this.coreSpace.world.appendChild(el);
            page.parking = el;
        }
        return page.parking;
    }

    /** @private 占位提示（「从左侧面板添加节点…」）只在空页面上显示 */
    _syncPlaceholder() {
        const ui = this.coreSpace.uiManager;
        const page = this.activePage;
        if (!ui || !ui.placeHolder) return;
        if (page && page.nodeCount > 0) ui.removePlaceHolder();
        else ui.addPlaceHolder();
    }

    /** @private 把所有页面持有的 id/uid 重新占位（清空画布会 reset 生成器） */
    _reserveIds() {
        const nm = this.coreSpace.nodeManager;
        this.pages.forEach((page) => {
            nm.reserveIds(page.nodeState ? page.nodeState.nodes.values() : []);
        });
    }

    /**
     * @private 取一个未被占用的页面 id（沿用存档 id 时同步推进序号）
     * @param {any} [desiredId]
     * @returns {string}
     */
    _nextPageId(desiredId) {
        const wanted = desiredId == null ? '' : String(desiredId);
        if (wanted && !this.pages.has(wanted)) {
            const matched = wanted.match(/(\d+)$/);
            const n = matched ? Number(matched[1]) : NaN;
            if (Number.isFinite(n)) this._seq = Math.max(this._seq, n);
            return wanted;
        }
        let id = '';
        do {
            this._seq += 1;
            id = `page_${this._seq}`;
        } while (this.pages.has(id));
        return id;
    }

    destroy() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        if (this._persistHandler) {
            PERSIST_DOM_EVENTS.forEach((type) => document.removeEventListener(type, this._persistHandler, true));
            this._persistHandler = null;
        }
        if (this._onUnload) {
            window.removeEventListener('beforeunload', this._onUnload);
            this._onUnload = null;
        }
        if (this._persistEnabled) this.save();

        // 非激活页的节点/连线不在管理器索引里，这里单独释放；激活页交给各管理器自己的 destroy
        const active = this.activePage;
        this.pageList.forEach((page) => {
            if (page !== active) this._disposePage(page);
        });
        this.pages.clear();
        this.order = [];
        this.activeId = null;

        super.destroy();
    }
}
