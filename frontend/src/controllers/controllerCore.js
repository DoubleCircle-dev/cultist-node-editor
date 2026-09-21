import { EditorConfig } from './constant.js';
import { BaseNodeModel } from '../models/nodeModels/baseNodeModel.js';
import { NodeManager } from './nodeManager.js';
import { CanvasManager } from './canvasManager.js';
import { UIManager } from './uiManager.js';
import { NodeActionManager } from './nodeActionManager.js';
import { ConnectionManager } from './connectionManager.js';
import { EventBus } from '../types/eventBus.js';
import { PanelManager } from './panelManager.js';
import { PageManager } from './pageManager.js';
import { HistoryManager } from './historyManager.js';
import { MenuManager } from './MenuManager.js';
import { StandardMessage } from '../types/standardDetail.js';
import { NodeTypeRegistry } from '../types/nodeTypes.js';
import { DataSelector } from '../views/dataSelector.js';
import { ModDataRegistry } from '../modDataRegistry.js';
import { PortProp } from '../models/propModels/portProp.js';
import { ViewProp } from '../models/propModels/viewProp.js';
import { HubProp } from '../models/propModels/hubProp.js';
import { entryOf, locate } from '../dataProvider.js';
import { collectVariableFields } from '../variableNodes.js';
import { computeFlowLayout } from '../layout/flowLayout.js';

/** 容器节点视图状态的本地存储键（成员 / 收起态 / 背景框尺寸 / 转发端口） */
const CONTAINERS_STORAGE_KEY = 'nodeEditor.containers';

/** 合并成容器时，背景框在成员外扩多少 px */
const CONTAINER_PADDING = 26;

/** 背景框 title 栏高度：合并时给成员上方留出的空间 */
const CONTAINER_TITLE_HEIGHT = 40;

/** 背景框（展开态）的默认 / 最小尺寸 */
const CONTAINER_DEFAULT_WIDTH = 320;
const CONTAINER_MIN_WIDTH = 220;
const CONTAINER_MIN_HEIGHT = 120;

/** 成员在框内的最小留白（夹位置时用） */
const CONTAINER_MEMBER_INSET = 12;

/** 新成员放进框内时，与已有成员之间的间距 */
const CONTAINER_MEMBER_GAP = 16;

/** 引用副本节点类型：只读副本，只提供端口用于布线（连线落在原节点上） */
const REF_NODE_TYPE = 'ref';

/** 引用副本记账的本地存储键（刷新后还能认出「哪个副本代理哪个原节点」） */
const REF_NODES_STORAGE_KEY = 'nodeEditor.refNodes';

/**
 * 造一个「透传代理属性」：值住在外层成员节点的真实属性里，这里只是能双向同步的代理
 *
 * 视图（输入框 / 表格）与普通属性完全一致；在容器上改动会写回成员节点（连带历史 / 撤销），
 * 成员节点里的值被别处改了（如文本变量同步）也会回流到这里。
 *
 * @param {any} frame - 容器节点模型（代理的宿主）
 * @param {any} member - 来源成员节点模型
 * @param {{ kind: 'variable' | 'tool'; prop: any }} source - 来源属性
 * @returns {any} 代理属性（`PortProp` 或 `ViewProp`）
 */
function createPassthroughProxy(frame, member, source) {
    const id = `${frame.id}:passthrough:${member.id}:${source.prop.id}`;
    const label = source.prop.label || source.prop.name || '值';
    /** @type {any} */
    let proxy;

    if (source.prop instanceof ViewProp) {
        proxy = new ViewProp(
            id,
            label,
            source.prop.type,
            source.prop.value,
            source.prop.columns || [],
            source.prop.rows || []
        );
        // 透传不是端口：去掉隐式输入口，也不占左右槽位
        proxy.inputPort = null;
        proxy.layout = PortProp.layoutTypes.ignorePort;
    } else {
        proxy = new PortProp(id, label, source.prop.type, source.prop.value, {
            name: source.prop.name,
            placeholder: source.prop.placeholder,
            layout: PortProp.layoutTypes.ignorePort,
        });
    }

    proxy.passthroughSourceId = String(member.id);
    proxy.passthroughSourcePropId = String(source.prop.id);
    proxy.passthroughKind = source.kind;
    return proxy;
}

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
            layoutRowLimit: 24, // 整理布局：一行最多放几个节点（超出换行）
            // 节点属性档位（最低/标准/全部）：只调常驻属性数量，被裁掉的进「修改可选属性」池
            propertyLevel: 'standard',
            // 引用副本的属性区排布：
            // - `copy`（默认）：按原节点复制（hub 结构 / 可变属性分组 / 端口位置都照搬，只读）；
            // - `spread`：属性压平成只读值，所有端口集中到副本左右两侧（方便布线）
            refPropertyLayout: 'copy',
            // 额外解析：把宿主字段里的 list/dict 值解析成列表 / 字典变量节点（table / list）并连线
            // （默认关：开启后节点数会明显增加，见 agent-scratch/design/20260920-tool-nodes-and-composite.md）
            // ⚠️ 旧 key `extraParseTools` 仍被读取，免得升级后丢掉已保存的设置
            extraParseListVariables:
                typeof localStorage !== 'undefined' &&
                (localStorage.getItem('nodeEditor.extraParseListVariables') === '1' ||
                    localStorage.getItem('nodeEditor.extraParseTools') === '1'),
            // 悬空端口：给画布上指向「画布外目标」的引用建占位节点（只有端口，点击可跳转）
            showDanglingPorts: true,
            // 容器节点：把后端拆出来的内联子节点（`node.inline.hostUid`）自动合并成容器（默认关，
            // 容器节点由用户右键「合并为容器节点」手动创建；开也只是多个自动步骤）
            inlineAutoMerge: false,
            // 容器收起态透传什么：文本变量 / 列表·字典变量（table、list）可分别开关
            passthroughVariables: true,
            passthroughListVariables: true,
            // Hub 可选标签的样式：bar = 标签栏，corner = 右下角图标
            hubLabelMode: 'bar',
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

        // 页面（工作区选项卡）管理器必须最后建：它构造时就会激活第一个页面，
        // 而「激活」要用到上面全部管理器的索引与 DOM。
        this.pageManager = new PageManager(this.bus, this.viewport, this.world, this);

        /**
         * 侧边栏「查找节点」面板点条目时会 emit `findNode`，定位由这里负责。
         *
         * @private
         * @type {(e: CustomEvent) => void}
         */
        this._findNodeHandler = (e) => {
            const id = e && e.detail ? e.detail.id : null;
            if (id != null) this.focusNode(id);
        };
        this.bus.on('findNode', this._findNodeHandler);

        /**
         * 「额外解析」生成的列表 / 字典变量节点记账：`${宿主节点 id}:${字段名}` → 变量节点 id
         *
         * 供幂等重建 / 一次性清理用（`attachVariableNodes` / `detachVariableNodes`）。
         *
         * @type {Map<string, any>}
         */
        this.variableNodes = new Map();

        /**
         * 悬空端口记账：`${目标类别}:${目标 id}` → 悬空端口节点 id
         *
         * @type {Map<string, any>}
         */
        this.danglingPorts = new Map();

        /**
         * 复合内联节点记账：宿主节点 id → `{ collapsed, children: string[], forwardPorts: any[] }`
         *
         * 宿主 + `node.inline.hostUid` 指向它的子节点 = 一个完整对象，默认折叠。
         *
         * @type {Map<string, { collapsed: boolean; children: string[]; forwardPorts: any[] }>}
         */
        this.containerNodes = new Map();

        /**
         * 内联归属：子节点 id → 直接宿主节点 id（可**多层嵌套**，子节点自己也可以是宿主）
         *
         * 显隐要按这个链递归算：只要有一个祖先宿主是折叠态，这个节点就不该出现在画布上。
         *
         * @type {Map<string, string>}
         */
        this.containerMemberOf = new Map();

        /**
         * 悬空端口双击 → 在前端数据里定位目标（见 `jumpToTarget`）。
         *
         * @private
         * @type {(e: CustomEvent) => void}
         */
        this._jumpTargetHandler = (e) => {
            const detail = (e && e.detail) || {};
            this.jumpToTarget(detail.category, detail.targetId);
        };
        this.bus.on('jump:target', this._jumpTargetHandler);

        /**
         * 节点右键菜单：由 NodeManager 在右键 mousedown 时转发过来
         *
         * @private
         * @type {(e: CustomEvent) => void}
         */
        this._nodeContextMenuHandler = (e) => {
            const detail = (e && e.detail) || {};
            if (detail.nodeId == null) return;
            // 右键没选中这个节点时先选上它（选中多个 = 把它们一起合并成一个容器）
            const node = this.nodeManager.nodes.get(String(detail.nodeId));
            if (node && !node.selected) {
                // 两种情况下**保留**已有选中，否则信息就丢了：
                //  - 右键的是容器：「加入选中节点」要拿它们当候选；
                //  - 选中里已有容器成员：要能看到「已在容器内不能直接合并」的说明（而不是被清成只剩一个）。
                const isContainer = this.containerNodes.has(String(detail.nodeId));
                const hasMemberSelected = this.selectedNodes.some((item) => this.containerMemberOf.has(String(item.id)));
                if (!isContainer && !hasMemberSelected) {
                    this.nodes.forEach((item) => item !== node && item.setSelected(false));
                }
                node.setSelected(true);
            }
            const position = detail.position || null;
            const items = this._nodeContextMenuItems(String(detail.nodeId), position);
            if (!items.length) return;
            this.menuManager?.showContextMenu?.(items, position);
        };
        this.bus.on('node:contextmenu', this._nodeContextMenuHandler);

        /**
         * 画布空白处右键（视图操作：粘贴 / 整理布局 / 适应视图 / 隐藏连接 / 清空）
         *
         * 节点上的右键在 `NodeView` 里已经 `stopPropagation`，不会落到这里。
         *
         * @private
         * @type {(e: MouseEvent) => void}
         */
        this._canvasContextMenuHandler = (e) => {
            if (e.target instanceof Element && e.target.closest('.node')) return;
            e.preventDefault();
            const position = { x: e.clientX, y: e.clientY };
            const items = this._canvasContextMenuItems(position);
            if (!items.length) return;
            this.menuManager?.showContextMenu?.(items, position);
        };
        this.viewport.addEventListener('contextmenu', this._canvasContextMenuHandler);

        /**
         * 引用副本：点标题栏的 ⌖ → 跳到原节点
         *
         * @private
         * @type {(e: CustomEvent) => void}
         */
        this._refFocusHandler = (e) => {
            const detail = (e && e.detail) || {};
            const refId = detail.refId != null ? String(detail.refId) : detail.node ? String(detail.node.id) : '';
            const sourceId = this.refNodes.get(refId);
            // 记账里没有 / 源节点已被删：都要提示（不然点了没反应）
            if (!sourceId || !this.nodeManager.nodes.get(sourceId)) {
                this._notify('这个引用副本的原节点已不在画布上');
                return;
            }
            this.focusNode(sourceId);
        };
        this.bus.on('ref:focus', this._refFocusHandler);

        /**
         * 拖动容器时被临时并进选中集合的成员（拖完 / 拖空要恢复原状态）
         *
         * @private
         * @type {any[]}
         */
        this._containerDragAdded = [];

        /**
         * 拖动中补选的监听（`NodeManager` 会在 `drag:node:success` 时清掉选中，这里补回来）
         *
         * @private
         * @type {(() => void) | null}
         */
        this._containerDragReselect = null;

        /**
         * 节点剪贴板（「复制节点」把规格记进来，画布空白处右键「粘贴」用它）
         *
         * @private
         * @type {{ type: string; title: string; values: Array<{ key: string; value: any }> } | null}
         */
        this.nodeClipboard = null;

        /**
         * 引用副本记账：副本节点 id → 源节点 id
         *
         * 副本端口上拖出的连线会换回源节点端口（`resolveRefPort`），所以副本不进数据，
         * 可以随便摆位 / 随便删。
         *
         * @private
         * @type {Map<string, string>}
         */
        this.refNodes = new Map();

        /**
         * 引用副本的「预览属性 + 同步监听」记账：副本 id → `{ props, bindings, nodeBindings }`
         *
         * - `props`：源节点属性的**只读代理**（值随源节点同步），重建 / 删除副本时要摘掉；
         * - `bindings`：源**属性**上的监听（值变化 → 代理跟着变）；
         * - `nodeBindings`：源**节点**上的监听（切模式 / 结构变化 → 整份预览重建，「可变属性」跟着同步）。
         *
         * @private
         * @type {Map<string, { props: any[]; bindings: Array<{ source: any; onSourceChange: (e: any) => void }>; nodeBindings: Array<{ node: any; event: string; handler: (e: any) => void }> }>}
         */
        this.refExtras = new Map();

        /**
         * 副本重建的防重入标记（源节点结构变化 → 重建副本 → 又碰到源节点事件时用）
         *
         * @private
         */
        this._refSyncing = false;

        /**
         * 当前编辑的命名空间（读 mod / 预览时由 `index.js` 设入）
         *
         * 只读判定用：`source === 'origin'` 一律只读；`source === 'mod'` 且命名空间与它不同
         * = 「**其他 mod**」也是只读（`isProtectedSource`）。没设置时只保护 origin。
         *
         * @type {string | null}
         */
        this.editingNamespace = null;

        // 拖动：容器带着成员一起走（`drag:node:start`），过程中把成员夹在框内（`drag:node:running`）
        this.bus.on('drag:node:start', this._containerDragStartHandler);
        this.bus.on('drag:node:running', this._containerDragMoveHandler);
        this.bus.on('drag:node:end', this._containerDragEndHandler);
        this.bus.on('drag:node:failed', this._containerDragEndHandler);

        this._bindShortCut();
    }

    /**
     * 按当前配色表刷新画布上已有节点的颜色（改配色后调用）
     *
     * 节点颜色在创建时由 `config.color` 拷进模型，改配色不会自动回流：这里逐个换色后
     * 让节点自己重绘（`NodeView.redraw` 会重建 DOM 并重新渲染属性 —— 端口点颜色也会跟着变），
     * 新 DOM 带的就是新颜色，不必再强制整块画布重绘；
     * 最后让侧边栏里带色条的列表面板（添加节点 / 查找节点）也重新渲染。
     *
     * @returns {number} 刷新了几个节点
     */
    applyNodeColors() {
        const nodes = this.nodes || [];
        nodes.forEach((node) => {
            node.color = NodeTypeRegistry.getColor(node.type);
            node.emit('redraw');
        });
        this.panelManager?.refreshColorPanels?.();
        return nodes.length;
    }

    /**
     * 定位到某个节点：选中它、把视野移到它身上（缩放夹在可读区间内），并闪一下提示。
     * 「搜索节点」框与侧边栏「查找节点」面板点条目时都走这里。
     *
     * @param {string | number} nodeId - 节点的内部 id 或界面上的 uid（`#12` 里的 12）
     * @param {{ select?: boolean, flash?: boolean, minScale?: number, maxScale?: number }} [opts]
     * @returns {boolean} 是否找到并定位
     */
    focusNode(nodeId, opts = {}) {
        if (nodeId == null) return false;
        const key = String(nodeId);
        const node = this.nodes.find((item) => String(item.id) === key || String(item.uid) === key);
        if (!node) return false;

        if (opts.select !== false) {
            this.nodes.forEach((item) => {
                if (item !== node && item.selected) item.setSelected(false);
            });
            node.setSelected(true);
        }

        // 缩放：太远看不清、太近只看得到一个节点，都夹到可读区间
        const minScale = opts.minScale ?? 0.5;
        const maxScale = opts.maxScale ?? 1;
        const current = this.canvasManager.transform.scale || 1;
        const scale = Math.min(maxScale, Math.max(minScale, current));
        const width = node.width || 300;
        const height = node.height || 240;
        this.canvasManager.centerOn(node.x + width / 2, node.y + height / 2, { scale });

        if (opts.flash !== false) {
            const view = this.nodeManager.nodeViews.get(String(node.id));
            const dom = view ? view.element : null;
            if (dom) {
                dom.classList.remove('found-flash');
                // 强制重排，保证连续定位同一个节点也能重新播放动画
                void dom.offsetWidth;
                dom.classList.add('found-flash');
                setTimeout(() => dom.classList.remove('found-flash'), 3000);
            }
        }
        return true;
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
     * 「额外解析」（设置 `extraParseListVariables`）：把**当前画布**上数据节点的 `list` / `dict` 字段
     * 解析成列表 / 字典**变量节点**（`list` / `table`）并连线。
     *
     * - 只处理画布上已有节点（前端只负责当前页面；设置里的开关默认关）——
     *   后端服务层就绪后，数据来源从本地数据池换成后端查询，本方法逻辑不变；
     * - 幂等：先清掉上次生成的（`detachVariableNodes`），再按 `${宿主节点 id}:${字段名}` 重新记账；
     * - 模板没给该字段建端口的（例如扩展字段）连不上宿主 → 跳过并计数。
     *
     * @param {number} [minItems] - 字段至少要几个条目才值得解析（默认见 `variableNodes.MIN_VARIABLE_ITEMS`）
     * @returns {{ created: number; linked: number; skipped: number }} 统计（便于日志/状态栏）
     */
    attachVariableNodes(minItems) {
        this.detachVariableNodes();
        const stats = { created: 0, linked: 0, skipped: 0 };
        if (!this.setting.extraParseListVariables) return stats;

        this.nodes.forEach((model) => {
            const entry = model && model.dataId ? entryOf(model.type, model.dataId) : null;
            if (!entry) return; // 变量 / 手工节点没有来源，跳过

            collectVariableFields(entry, minItems).forEach((field, index) => {
                const hostPort = findFieldPort(model, field.name);
                if (!hostPort) {
                    stats.skipped++;
                    return;
                }
                const built = this._createToolNode(model, field, index, hostPort);
                if (!built) {
                    stats.skipped++;
                    return;
                }
                stats.created++;
                if (built.linked) stats.linked++;
                this.variableNodes.set(`${model.id}:${field.name}`, built.model.id);
            });
        });

        return stats;
    }

    /**
     * 清掉「额外解析」生成的列表 / 字典变量节点（连带断开它们的连线）
     *
     * @returns {number} 删除的节点数
     */
    detachVariableNodes() {
        if (!this.variableNodes || !this.variableNodes.size) return 0;
        const ids = Array.from(this.variableNodes.values());
        this.variableNodes.clear();
        this.nodeManager.deleteNodes(ids);
        return ids.length;
    }

    /**
     * 「悬空端口」（设置 `showDanglingPorts`，默认开）：给画布上指向**画布外目标**的引用
     * 建占位节点 —— 只有端口，别的什么都没有；hover 看被谁引用，点击跳转（P3）。
     *
     * - 只处理画布上已有宿主的引用（与额外解析同一策略：前端只负责当前页面）；
     * - 同一目标（`类别:id`）只建一个节点，多个宿主字段连到它上面；
     * - 幂等：先 `detachDanglingPorts()` 再重建。
     *
     * @returns {{ created: number; linked: number; skipped: number }} 统计
     */
    attachDanglingPorts() {
        this.detachDanglingPorts();
        const stats = { created: 0, linked: 0, skipped: 0 };
        if (!this.setting.showDanglingPorts) return stats;

        /** @type {Map<string, any>} 画布上的宿主：**契约 uid** → 节点模型（同时登记画布 uid 兜底） */
        const byUid = new Map();
        this.nodes.forEach((model) => {
            if (!model) return;
            const entry = model.dataId ? entryOf(model.type, model.dataId) : null;
            if (entry && entry.uid) byUid.set(String(entry.uid), model);
            if (model.uid != null) byUid.set(String(model.uid), model);
        });

        ModDataRegistry.allExternals().forEach((item) => {
            const refs = (item.refs || []).filter((ref) => ref && byUid.has(String(ref.uid)));
            if (!refs.length) return; // 宿主没铺到画布上 → 这个悬空目标先不建

            const built = this._createDanglingPort(item, refs, byUid);
            if (!built) {
                stats.skipped++;
                return;
            }
            stats.created++;
            stats.linked += built.linked;
            this.danglingPorts.set(item.key, built.model.id);
        });

        return stats;
    }

    /**
     * 清掉悬空端口节点（连带断开连线）
     *
     * @returns {number} 删除的节点数
     */
    detachDanglingPorts() {
        if (!this.danglingPorts || !this.danglingPorts.size) return 0;
        const ids = Array.from(this.danglingPorts.values());
        this.danglingPorts.clear();
        this.nodeManager.deleteNodes(ids);
        return ids.length;
    }

    /**
     * @private 拖动开始：碰的是**展开的容器**时，把它的成员并进本次拖动
     *
     * 成员要真的进「选中集合」才会跟着动 —— 拖动逻辑在第一次有效移动时会用
     * `selectedNodes` 重新取一次集合（`nodeActionManager._onDragMove`）。
     * ⚠️ 但 `NodeManager` 会在 `drag:node:success` 时把选中清成「只选被点的那个」，
     * 所以这里紧跟着注册一个同事件的补选（它注册得更晚 → 后执行 → 补选有效），
     * 之后的重新取集合就能拿到成员。顺带把「撤销 / 重做」也带上了（历史按选中节点组记录）。
     *
     * @param {any} e - `drag:node:start` 事件
     * @returns {void}
     */
    _containerDragStartHandler = (e) => {
        const list = e && e.detail ? e.detail.selectedNodes : null;
        if (!Array.isArray(list)) return;
        this._containerDragAdded = [];

        list.forEach((node) => {
            const record = this.containerNodes.get(String(node.id));
            if (!record || record.collapsed) return;
            record.members.forEach((memberId) => {
                const member = this.nodeManager.nodes.get(String(memberId));
                if (!member || list.includes(member)) return;
                list.push(member);
                if (!member.selected) {
                    member.setSelected(true);
                    this._containerDragAdded.push(member);
                }
            });
        });

        if (!this._containerDragAdded.length) return;
        this._containerDragReselect = () => {
            (this._containerDragAdded || []).forEach((member) => member.setSelected(true));
        };
        this.bus.on('drag:node:success', this._containerDragReselect);
    };

    /**
     * @private 拖动中：把成员夹回容器内（拖到边上就贴边，出不去）
     *
     * @param {any} e - `drag:node:running` 事件
     * @returns {void}
     */
    _containerDragMoveHandler = (e) => {
        const nodeIds = (e && e.detail ? e.detail.nodeIds : null) || [];
        this._clampContainerMembers(nodeIds);
    };

    /**
     * @private 拖动结束 / 拖空：取消补选监听、恢复原来没选中的成员、再夹一次
     *
     * @returns {void}
     */
    _containerDragEndHandler = () => {
        if (this._containerDragReselect) {
            this.bus.off('drag:node:success', this._containerDragReselect);
            this._containerDragReselect = null;
        }
        this._clampContainerMembers(Array.from(this.containerMemberOf.keys()));
        (this._containerDragAdded || []).forEach((member) => member.setSelected(false));
        this._containerDragAdded = [];
    };

    /**
     * @private 容器 header（标题行 + label 行）的实际高度
     *
     * 成员的可放范围要**从 header 下面开始** —— 标题栏下面还有一排 label 输入框，
     * 用常数（40）会算少，成员会盖住 label。量不到（jsdom / 未渲染）才退到常数。
     *
     * @param {string} containerId - 容器节点 id
     * @returns {number} header 高度（px）
     */
    _containerHeaderHeight(containerId) {
        const view = this.nodeManager.nodeViews.get(String(containerId));
        const header = view && view.element ? view.element.querySelector('.node-header') : null;
        const measured = header ? header.offsetHeight : 0;
        return Math.max(CONTAINER_TITLE_HEIGHT, measured || 0);
    }

    /**
     * @private 成员的实际占位尺寸
     *
     * ⚠️ 模型上的 `width/height` 是**上一次测量**的结果，属性变多 / 图片加载后可能偏小，
     * 偏差会让「包住成员」算少 → 真实 DOM 比模型大时以 DOM 为准。
     *
     * @param {any} member - 成员节点模型
     * @returns {{ w: number; h: number }} 宽高（都至少 1）
     */
    _memberSizeOf(member) {
        const view = this.nodeManager.nodeViews.get(String(member.id));
        const domW = view && view.element ? view.element.offsetWidth : 0;
        const domH = view && view.element ? view.element.offsetHeight : 0;
        return {
            w: Math.max(1, member.width || 0, domW || 0) || 300,
            h: Math.max(1, member.height || 0, domH || 0) || 200,
        };
    }

    /**
     * @private 容器需要多大才能**完全包住**所有成员（类似「适应视图」的那个尺寸）
     *
     * 以容器当前的左上角为基准：右侧到最右成员的外边 + 内边距，下方到最下成员的外边 + 内边距。
     *
     * @param {string} containerId - 容器节点 id
     * @returns {{ w: number; h: number } | null} 需要的最小尺寸（容器 / 成员缺失时 null）
     */
    _containerContentBounds(containerId) {
        const record = this.containerNodes.get(String(containerId));
        const frame = this.nodeManager.nodes.get(String(containerId));
        if (!record || !frame) return null;

        let right = (frame.x || 0) + CONTAINER_MIN_WIDTH;
        let bottom = (frame.y || 0) + CONTAINER_MIN_HEIGHT;
        record.members.forEach((memberId) => {
            const member = this.nodeManager.nodes.get(String(memberId));
            if (!member) return;
            const size = this._memberSizeOf(member);
            right = Math.max(right, (member.x || 0) + size.w + CONTAINER_MEMBER_INSET);
            bottom = Math.max(bottom, (member.y || 0) + size.h + CONTAINER_MEMBER_INSET);
        });

        return {
            w: Math.round(right - (frame.x || 0)),
            h: Math.round(bottom - (frame.y || 0)),
        };
    }

    /**
     * @private 容器尺寸绝不能小于「包住全部成员」的尺寸
     *
     * 缩放句柄拖到底也只能到这里（视图每帧都会拿 `minSize` 夹一下），
     * 另外它也是自动撑大（`_fitContainerToMembers`）的判定依据。
     *
     * @param {string} containerId - 容器节点 id
     * @returns {{ w: number; h: number }} 最小尺寸
     */
    _resizeMinSize(containerId) {
        const bounds = this._containerContentBounds(containerId);
        if (!bounds) return { w: CONTAINER_MIN_WIDTH, h: CONTAINER_MIN_HEIGHT };
        return { w: Math.max(CONTAINER_MIN_WIDTH, bounds.w), h: Math.max(CONTAINER_MIN_HEIGHT, bounds.h) };
    }

    /**
     * @private 容器装不下成员时自动撑大（只长不缩，免得跟用户手调的框尺寸打架）
     *
     * @param {string} containerId - 容器节点 id
     * @returns {boolean} 是否长大过
     */
    _fitContainerToMembers(containerId) {
        const record = this.containerNodes.get(String(containerId));
        const frame = this.nodeManager.nodes.get(String(containerId));
        if (!record || !frame || record.collapsed) return false;

        const need = this._resizeMinSize(containerId);
        const width = Math.max(frame.width || 0, need.w);
        const height = Math.max(frame.height || 0, need.h);
        if (width === (frame.width || 0) && height === (frame.height || 0)) return false;

        frame.setRect(Math.round(width), Math.round(height));
        record.rect = { w: Math.round(width), h: Math.round(height) };
        const view = this.nodeManager.nodeViews.get(String(containerId));
        if (view && view._containerState) view._containerState.rect = record.rect;
        return true;
    }

    /**
     * @private 保证成员的可放范围在「标题栏 + label 行」**下面**
     *
     * 合并时容器还没渲染，量不到 header 真实高度（label 输入框那一行就漏算了），
     * 成员会压在 label 上。这里把**框往上提**同样的量（成员世界坐标一步不动），
     * 视觉上就是内容区从 label 下面开始。幂等：修好后再调 `need <= 0` 直接返回。
     *
     * @param {string} containerId - 容器节点 id
     * @returns {boolean} 是否调整过
     */
    _ensureHeaderSpace(containerId) {
        const record = this.containerNodes.get(String(containerId));
        const frame = this.nodeManager.nodes.get(String(containerId));
        if (!record || !frame || record.collapsed) return false;
        if (!record.members.length) return false;
        if (!frame.width || !frame.height) return false; // jsdom / 未测量：没有可用的框尺寸

        let top = Infinity;
        record.members.forEach((memberId) => {
            const member = this.nodeManager.nodes.get(String(memberId));
            if (member) top = Math.min(top, member.y || 0);
        });
        if (!Number.isFinite(top)) return false;

        const barrier = (frame.y || 0) + this._containerHeaderHeight(String(containerId)) + CONTAINER_MEMBER_INSET;
        const need = barrier - top;
        if (need <= 0) return false;

        frame.setPosition(frame.x || 0, Math.round((frame.y || 0) - need));
        frame.setRect(Math.round(frame.width), Math.round(frame.height + need));
        record.rect = { w: Math.round(frame.width), h: Math.round(frame.height) };
        return true;
    }

    /**
     * @private 把成员节点夹回它所属容器的框内（只处理展开态的容器）
     *
     * 拖动是按帧送增量（`moveBy(dx,dy)`），所以每帧夹一次就能实现「贴边不放行」：
     * 节点顶到边界后停在边界上，后续帧的增量带不动它。
     *
     * @param {Array<string | number | any>} nodeIdsOrModels - 要检查的节点（可传 id 或模型）
     * @returns {number} 夹回位置的节点数
     */
    _clampContainerMembers(nodeIdsOrModels) {
        let clamped = 0;
        (nodeIdsOrModels || []).forEach((item) => {
            const id = item && typeof item === 'object' ? item.id : item;
            const member = this.nodeManager.nodes.get(String(id));
            if (!member) return;
            const containerId = this.containerMemberOf.get(String(id));
            if (!containerId) return;
            const record = this.containerNodes.get(containerId);
            const frame = this.nodeManager.nodes.get(containerId);
            if (!record || !frame || record.collapsed) return;
            if (!frame.width || !frame.height) return; // jsdom / 未测量：没有可用的框尺寸

            const size = this._memberSizeOf(member);
            const headerHeight = this._containerHeaderHeight(containerId);
            const minX = (frame.x || 0) + CONTAINER_MEMBER_INSET;
            const minY = (frame.y || 0) + headerHeight + CONTAINER_MEMBER_INSET;
            const maxX = (frame.x || 0) + frame.width - size.w - CONTAINER_MEMBER_INSET;
            const maxY = (frame.y || 0) + frame.height - size.h - CONTAINER_MEMBER_INSET;
            const nextX = Math.round(Math.min(Math.max(member.x, minX), Math.max(minX, maxX)));
            const nextY = Math.round(Math.min(Math.max(member.y, minY), Math.max(minY, maxY)));
            if (nextX === member.x && nextY === member.y) return;
            member.setPosition(nextX, nextY);
            clamped++;
        });
        if (clamped) {
            // 夹完可能又贴到边界了，顺手确认框还装得下
            Array.from(this.containerNodes.keys()).forEach((id) => this._fitContainerToMembers(id));
            this.connectionManager.refreshAllConnections();
        }
        return clamped;
    }

    /**
     * 把若干节点**合并成一个容器节点**（containerNode）
     *
     * 容器 = 一个大背景框（展开态）+ 一张卡片（收起态）：
     * - 背景框半透明、可缩放（右下角），成员节点就在框里、位置由用户自由调；
     * - 收起后只留**转发端口**与**透传属性**（变量节点，设置里可开关）。
     *
     * @param {Array<string | number>} nodeIds - 要合并的节点 id
     * @param {{ title?: string; collapsed?: boolean }} [opts] - 默认展开（合并后先看到背景框）
     * @returns {any | null} 容器节点模型
     */
    mergeToContainer(nodeIds, opts = {}) {
        const members = [...new Set((Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id)))].filter(
            (id) => this.nodeManager.nodes.has(id) && !this.containerNodes.has(id)
        );
        if (!members.length) return null;

        // 已在容器里的节点不能和容器外的节点直接合并：否则成员会被“抢”进新容器，
        // 旧容器空掉 / 画布上凭空多出第二个容器（用户报的就是这个）。
        // 要往里加节点请用容器的「加入选中节点」（`addToContainer`）。
        const inside = members.filter((id) => this.containerMemberOf.has(id));
        if (inside.length) {
            const onlyInside = inside.length === members.length;
            this._notify(
                onlyInside
                    ? '选中的节点已经在容器里了；要再包一层请先「从容器移出」'
                    : '已在容器内的节点不能和容器外的节点直接合并；请用容器节点的「加入选中节点」'
            );
            return null;
        }

        const models = members.map((id) => this.nodeManager.nodes.get(id));
        const minX = Math.min(...models.map((model) => model.x || 0));
        const minY = Math.min(...models.map((model) => model.y || 0));
        const maxX = Math.max(...models.map((model) => (model.x || 0) + (model.width || 300)));
        const maxY = Math.max(...models.map((model) => (model.y || 0) + (model.height || 200)));

        const frame = this.nodeManager.addToolNode('container', {
            title: opts.title || '容器节点',
            x: Math.round(minX - CONTAINER_PADDING),
            y: Math.round(minY - CONTAINER_TITLE_HEIGHT - CONTAINER_PADDING),
            properties: [],
        });
        if (!frame) return null;

        const width = Math.round(maxX - minX + CONTAINER_PADDING * 2);
        const height = Math.round(
            maxY - minY + CONTAINER_PADDING * 2 + this._containerHeaderHeight(String(frame.id))
        );
        this.containerNodes.set(String(frame.id), {
            members,
            collapsed: opts.collapsed === true,
            rect: { w: width, h: height },
            forwardPorts: [],
            passthroughHubs: [],
            passthrough: [],
        });
        members.forEach((id) => this.containerMemberOf.set(id, String(frame.id)));
        frame.setRect(width, height);

        this._refreshContainerViews(String(frame.id));
        this._refreshContainerVisibility();
        this.saveContainers();
        return frame;
    }

    /**
     * 拆开一个容器节点：成员节点原地保留，容器自身删掉（连带它承载的连线）
     *
     * @param {any} containerId - 容器节点 id
     * @returns {boolean} 是否拆掉
     */
    splitContainer(containerId) {
        const key = String(containerId);
        const record = this.containerNodes.get(key);
        if (!record) return false;

        record.members.forEach((memberId) => {
            this.containerMemberOf.delete(memberId);
            const memberView = this.nodeManager.nodeViews.get(String(memberId));
            if (!memberView) return;
            memberView.element?.classList.remove('node-container-member-hidden');
            if (typeof memberView.setMemberTag === 'function') memberView.setMemberTag(null);
        });
        this.containerNodes.delete(key);

        const frameView = this.nodeManager.nodeViews.get(key);
        if (frameView && typeof frameView.clearContainerView === 'function') frameView.clearContainerView();
        this.nodeManager.deleteNodes([key]);
        this._refreshContainerVisibility();
        this.saveContainers();
        return true;
    }

    /**
     * 某个节点是不是容器节点
     *
     * @param {any} nodeId - 节点 id
     * @returns {boolean}
     */
    isContainer(nodeId) {
        return this.containerNodes.has(String(nodeId));
    }

    /**
     * 容器里的成员节点 id
     *
     * @param {any} containerId - 容器节点 id
     * @returns {string[]} 成员 id（没有 = 空数组）
     */
    containerMembers(containerId) {
        const record = this.containerNodes.get(String(containerId));
        return record ? [...record.members] : [];
    }

    /**
     * @private 某个节点的祖先容器链（近 → 远）
     *
     * @param {any} nodeId - 节点 id
     * @returns {string[]} 祖先容器 id
     */
    _ancestorContainersOf(nodeId) {
        const chain = [];
        const guard = new Set();
        let cursor = this.containerMemberOf.get(String(nodeId));
        while (cursor && !guard.has(cursor)) {
            guard.add(cursor);
            chain.push(cursor);
            cursor = this.containerMemberOf.get(cursor);
        }
        return chain;
    }

    /**
     * @private 哪些节点现在可以加进这个容器（菜单计数与实际加入共用同一套校验）
     *
     * 不合格的：容器自己、已在容器里的、已属于**别的**容器的、以及是容器祖先的（会成环）。
     *
     * @param {any} containerId - 容器节点 id
     * @param {Array<string | number | any>} nodeIds - 候选节点（id 或模型）
     * @returns {{ ok: string[]; blocked: Array<{ id: string; reason: string }> }}
     */
    _collectAddableToContainer(containerId, nodeIds) {
        const key = String(containerId);
        const ancestors = this._ancestorContainersOf(key);
        /** @type {string[]} */
        const ok = [];
        /** @type {Array<{ id: string; reason: string }>} */
        const blocked = [];

        (nodeIds || []).forEach((item) => {
            const id = String(item && typeof item === 'object' ? item.id : item);
            if (id === key || ok.includes(id)) return;
            if (!this.nodeManager.nodes.has(id)) return;
            if (this.containerNodes.has(key) && this.containerMembers(key).includes(id)) return; // 已经在里面了
            const owner = this.containerMemberOf.get(id);
            if (owner) {
                blocked.push({ id, reason: owner === key ? '已在容器里' : '已在其它容器里' });
                return;
            }
            if (ancestors.includes(id)) {
                blocked.push({ id, reason: '它是这个容器的父级（会成环）' });
                return;
            }
            ok.push(id);
        });
        return { ok, blocked };
    }

    /**
     * 把节点**加进已有容器**（右键容器 →「加入选中节点」）
     *
     * 不在框内的新成员会先被摆进内容区（排在现有成员下方），再让框长到装得下；
     * 容器收起时自动展开，否则新成员加进去了却看不见。
     *
     * @param {any} containerId - 容器节点 id
     * @param {Array<string | number | any>} nodeIds - 要加入的节点（id 或模型）
     * @returns {number} 实际加进去几个
     */
    addToContainer(containerId, nodeIds) {
        const key = String(containerId);
        const record = this.containerNodes.get(key);
        const frame = this.nodeManager.nodes.get(key);
        if (!record || !frame) return 0;

        const { ok, blocked } = this._collectAddableToContainer(key, nodeIds);
        if (blocked.length) {
            // 整体拒绝：避免“只加一半”，也让用户知道为什么
            const first = blocked[0];
            const node = this.nodeManager.nodes.get(first.id);
            this._notify(`「${(node && node.title) || first.id}」${first.reason}，没有加入任何节点`);
            return 0;
        }
        if (!ok.length) return 0;

        if (record.collapsed) this._applyContainerCollapsed(key, false);

        // 已在内容区内的不动；不在的排到现有成员下方（避免新节点被框裁掉，也不盖住老成员）
        const headerHeight = this._containerHeaderHeight(key);
        const contentLeft = Math.round((frame.x || 0) + CONTAINER_MEMBER_INSET);
        const contentTop = Math.round((frame.y || 0) + headerHeight + CONTAINER_MEMBER_INSET);
        const frameRight = Math.round((frame.x || 0) + (frame.width || 0) - CONTAINER_MEMBER_INSET);
        const frameBottom = Math.round((frame.y || 0) + (frame.height || 0) - CONTAINER_MEMBER_INSET);

        let stackY = contentTop;
        record.members.forEach((memberId) => {
            const member = this.nodeManager.nodes.get(String(memberId));
            if (!member) return;
            const size = this._memberSizeOf(member);
            stackY = Math.max(stackY, Math.round((member.y || 0) + size.h + CONTAINER_MEMBER_GAP));
        });
        if (!record.members.length) stackY = contentTop;

        ok.forEach((id) => {
            const node = this.nodeManager.nodes.get(id);
            const size = this._memberSizeOf(node);
            const inside =
                (node.x || 0) >= contentLeft &&
                (node.y || 0) >= contentTop &&
                (node.x || 0) + size.w <= frameRight &&
                (node.y || 0) + size.h <= frameBottom;
            if (!inside) {
                node.setPosition(contentLeft, stackY);
                stackY += size.h + CONTAINER_MEMBER_GAP;
            }
            record.members.push(id);
            this.containerMemberOf.set(id, key);
        });

        this._refreshContainerViews(key);
        this._refreshContainerVisibility();
        this._fitContainerToMembers(key);
        this._clampContainerMembers(record.members);
        this.saveContainers();
        this._notify(`已向「${frame.title || key}」加入 ${ok.length} 个节点`);
        return ok.length;
    }

    /**
     * 把节点移出它所在的容器（成员右键 →「从容器移出」）：节点留在原地，容器不删
     *
     * @param {any} nodeId - 成员节点 id
     * @returns {boolean} 是否移出成功（不在容器里 = false）
     */
    removeFromContainer(nodeId) {
        const id = String(nodeId);
        const containerId = this.containerMemberOf.get(id);
        if (!containerId) return false;
        const record = this.containerNodes.get(containerId);
        if (!record) {
            this.containerMemberOf.delete(id);
            return false;
        }

        this.containerMemberOf.delete(id);
        record.members = record.members.filter((memberId) => String(memberId) !== id);

        // 松手后与 `splitContainer` 一致：摘浮标、去掉隐藏类（否则收起态里移出的节点还是看不到）
        const view = this.nodeManager.nodeViews.get(id);
        if (view) {
            view.element?.classList.remove('node-container-member-hidden');
            if (typeof view.setMemberTag === 'function') view.setMemberTag(null);
        }

        this._refreshContainerViews(containerId);
        this._refreshContainerVisibility();
        this._fitContainerToMembers(containerId);
        this.saveContainers();
        return true;
    }

    /**
     * @private 重建容器的「透传属性」：每个能透传的成员一个带标签的 Hub
     *
     * 能透传的成员由设置决定：文本变量（`passthroughVariables`）与列表 / 字典变量（`table` / `list`，
     * `passthroughListVariables`）。代理属性与来源属性双向同步：在容器上改等于改里面的节点。
     *
     * @param {string} containerId - 容器节点 id
     * @returns {number} 重建了几个透传 hub
     */
    _refreshContainerPassthrough(containerId) {
        const record = this.containerNodes.get(String(containerId));
        const frame = this.nodeManager.nodes.get(String(containerId));
        const frameView = this.nodeManager.nodeViews.get(String(containerId));
        if (!record || !frame) return 0;

        // 先解绑上一轮的同步监听，再摘掉旧的透传 hub（转发端口在 inputs / outputs 里，不受影响）
        (record.passthrough || []).forEach(({ proxy, source, onProxyChange, onSourceChange }) => {
            if (proxy && typeof proxy.removeEventListener === 'function') proxy.removeEventListener('change:property', onProxyChange);
            if (source && typeof source.removeEventListener === 'function') {
                source.removeEventListener('update', onSourceChange);
                source.removeEventListener('change:property', onSourceChange);
            }
        });
        (record.passthroughHubs || []).forEach((hub) => frame.removeProperty(hub));

        const hubs = [];
        const bindings = [];
        record.members.forEach((memberId) => {
            const member = this.nodeManager.nodes.get(String(memberId));
            const source = this._passthroughSourceOf(member);
            if (!source) return;

            const proxy = createPassthroughProxy(frame, member, source);
            const onProxyChange = (/** @type {any} */ e) => {
                const next = e && e.detail ? e.detail.newValue : undefined;
                if (next === undefined || source.prop.value === next) return;
                source.prop.changeValue(next);
            };
            const onSourceChange = (/** @type {any} */ e) => {
                const next = e && e.detail ? e.detail.value : undefined;
                if (next === undefined || proxy.value === next) return;
                proxy.updateValue(next);
            };
            proxy.addEventListener('change:property', onProxyChange);
            // 来源侧两种改法都要回流：`updateValue()` → `update`，`changeValue()` → `change:property`
            source.prop.addEventListener('update', onSourceChange);
            source.prop.addEventListener('change:property', onSourceChange);

            const hub = new HubProp(`${frame.id}:passthrough:${memberId}`, member.title || String(memberId), [proxy], 'single');
            hub.showLabel = true; // 可选标签：按设置画成标签栏 / 右下角图标
            hub.containerPassthrough = true;
            proxy.parentNode = new WeakRef(frame);

            hubs.push(hub);
            bindings.push({ proxy, source: source.prop, onProxyChange, onSourceChange });
        });

        record.passthroughHubs = hubs;
        record.passthrough = bindings;
        if (hubs.length) frame.appendProps(hubs);
        if (frameView && typeof frameView.redraw === 'function') frameView.redraw();
        return hubs.length;
    }

    /**
     * @private 一个成员节点能不能透传，能的话是哪个属性
     *
     * @param {any} member - 成员节点模型
     * @returns {{ kind: 'variable' | 'tool'; prop: any } | null}
     */
    _passthroughSourceOf(member) {
        if (!member) return null;
        const props = member.detailProperties || [];

        if (member.type === 'text' && this.setting.passthroughVariables) {
            const prop = props.find((item) => item && (item.type === 'text' || item.type === 'textarea-preview'));
            return prop ? { kind: 'variable', prop } : null;
        }
        if ((member.type === 'table' || member.type === 'list') && this.setting.passthroughListVariables) {
            const prop = props.find((item) => item && item.type === 'table-preview');
            return prop ? { kind: 'tool', prop } : null;
        }
        return null;
    }

    /**
     * @private 节点右键菜单的菜单项（**数据描述**，交给 `MenuManager.showContextMenu` 呈现）
     *
     * 分组顺序：容器专属 → 节点操作（复制 / 重命名 / 删除）→ 容器归属（合并 / 加入 / 移出 / 拆开）
     * → 连线（断开 / 隐藏）→ 属性（修改可选属性）。
     *
     * @param {string} nodeId - 右键点中的节点 id
     * @param {{ x: number; y: number } | null} [position] - 右键屏幕坐标（属性面板要摆在那附近）
     * @returns {any[]} 菜单项
     */
    _nodeContextMenuItems(nodeId, position = null) {
        const key = String(nodeId);
        const node = this.nodeManager.nodes.get(key);
        if (!node) return [];

        const isContainer = this.containerNodes.has(key);
        const owner = this.containerMemberOf.get(key);
        const picked = this.selectedNodes.filter((item) => !this.containerNodes.has(String(item.id)));
        const pickedIds = (picked.length ? picked : [node]).filter(Boolean).map((item) => String(item.id));
        const links = this._connectionsOfNode(key).length;
        const hidden = this._connectionsHidden();

        /** 连线 + 属性：两类节点都有 @type {any[]} */
        const common = [
            {
                separator: true,
                id: 'disconnect',
                icon: '✂',
                label: links ? `断开全部连线（${links} 条）` : '断开全部连线',
                hint: links ? '' : '当前没有连线',
                disabled: links === 0,
                onSelect: () => this.disconnectNode(key),
            },
            {
                id: 'toggle-connections',
                icon: '👁',
                label: hidden ? '显示连接线' : '隐藏连接线',
                checked: hidden,
                onSelect: () => this.toggleConnectionsVisible(),
            },
        ];

        const extendProps = /** @type {any} */ (node).extendedProperties;
        const hasExtendProps = Boolean(extendProps && (extendProps.pool || extendProps.active));
        if (hasExtendProps) {
            common.push({
                separator: true,
                id: 'extend-props',
                icon: '⚙',
                label: '修改可选属性',
                hint: '勾选 / 取消这个节点的可选属性',
                onSelect: ({ position: pos }) => this.openExtendPropertyPanel(key, pos || position),
            });
        }

        if (isContainer) {
            const record = this.containerNodes.get(key);
            const addable = this._collectAddableToContainer(key, this.selectedNodes).ok;
            return [
                {
                    id: 'toggle-container',
                    icon: record.collapsed ? '▣' : '▢',
                    label: record.collapsed ? '展开容器' : '收起容器',
                    hint: record.collapsed ? '显示内部的节点' : '只留转发端口与透传属性',
                    onSelect: () => this.toggleContainer(key),
                },
                addable.length
                    ? {
                          id: 'add-members',
                          icon: '＋',
                          label: `加入选中节点（${addable.length} 个）`,
                          hint: '不在框内的会排到成员下方',
                          onSelect: () => this.addToContainer(key, addable),
                      }
                    : { note: '选中一些容器外的节点，再右键这里就能把它们加进来' },
                {
                    separator: true,
                    id: 'forward-port',
                    icon: '⇥',
                    label: '添加转发端口',
                    hint: '收起态也能看到的对外端口',
                    onSelect: () => this.addForwardPortByMenu(key),
                },
                {
                    id: 'split-container',
                    icon: '⤨',
                    label: '拆开容器节点',
                    hint: '成员节点留在原地，容器本身删除',
                    onSelect: () => this.splitContainer(key),
                },
                ...common,
            ];
        }

        if (node.type === REF_NODE_TYPE) {
            const sourceId = this.refNodes.get(key) || null;
            const source = sourceId ? this.nodeManager.nodes.get(sourceId) : null;
            return [
                {
                    id: 'ref-focus',
                    icon: '⌖',
                    label: '定位原节点',
                    hint: source ? `跳转到「${source.title || source.type}」` : '原节点已不在画布上',
                    disabled: !source,
                    onSelect: () => source && this.focusNode(sourceId),
                },
                {
                    id: 'ref-delete',
                    icon: '🗑',
                    label: '删除引用副本',
                    hint: '原节点与连在原节点上的线不受影响',
                    danger: true,
                    onSelect: () => this.removeRefNode(key),
                },
                ...common,
            ];
        }

        /** 节点操作 + 容器归属 @type {any[]} */
        const items = [
            {
                id: 'duplicate',
                icon: '⧉',
                label: '复制节点',
                hint: '建一个同类型副本（往右下错开）',
                onSelect: () => this.duplicateNode(key),
            },
            {
                id: 'create-ref',
                icon: '⎘',
                label: '创建引用副本',
                hint: '只读副本，只提供端口用于布线（连线落在原节点上）',
                onSelect: () => this.createRefNode(key),
            },
            { id: 'rename', icon: '✎', label: '重命名', onSelect: () => this.renameNode(key) },
            {
                id: 'delete',
                icon: '🗑',
                label: '删除节点',
                danger: true,
                onSelect: () => this.nodeManager.deleteNode(key),
            },
        ];

        if (owner) {
            const ownerFrame = this.nodeManager.nodes.get(owner);
            const ownerTitle = (ownerFrame && ownerFrame.title) || owner;
            items.push({
                separator: true,
                id: 'remove-from-container',
                icon: '↗',
                label: '从容器移出',
                hint: `离开「${ownerTitle}」（节点留在原地）`,
                onSelect: () => {
                    if (this.removeFromContainer(key)) this._notify(`已从「${ownerTitle}」移出`);
                },
            });
            items.push({ note: '已在容器内的节点不能直接与容器外的节点合并' });
        } else if (pickedIds.some((id) => this.containerMemberOf.has(id))) {
            // 混合选中：不提供合并（否则会凭空多出第二个容器），告诉用户正确做法
            items.push({ separator: true, note: '选中的节点里有已在容器内的：请用那个容器的「加入选中节点」' });
        } else {
            items.push({
                separator: true,
                id: 'merge-to-container',
                icon: '🗂',
                label: `合并为容器节点（${pickedIds.length} 个）`,
                hint: '包进一个半透明背景容器；收起只留转发端口与透传属性',
                onSelect: () => this.mergeToContainer(pickedIds),
            });
        }

        return [...items, ...common];
    }

    /**
     * @private 画布空白处的右键菜单（视图操作）
     *
     * @param {{ x: number; y: number } | null} [position] - 右键屏幕坐标（粘贴要落在鼠标处）
     * @returns {any[]} 菜单项
     */
    _canvasContextMenuItems(position = null) {
        const clip = this.nodeClipboard;
        const hidden = this._connectionsHidden();
        return [
            {
                id: 'paste',
                icon: '📋',
                label: clip ? `粘贴「${clip.title || clip.type}」` : '粘贴',
                hint: clip ? '在鼠标处新建一个副本' : '剪贴板是空的：先对节点执行「复制节点」',
                disabled: !clip,
                onSelect: () => this.pasteNode(position),
            },
            {
                separator: true,
                id: 'organize',
                icon: '▦',
                label: '整理布局',
                hint: '自动排版（容器当作一个整体）',
                onSelect: () => this.organizeLayout(),
            },
            {
                id: 'fit-view',
                icon: '⤢',
                label: '适应视图',
                hint: '把全部节点压进视口',
                onSelect: () => this.canvasManager.fitView(),
            },
            {
                id: 'toggle-connections',
                icon: '👁',
                label: hidden ? '显示连接线' : '隐藏连接线',
                checked: hidden,
                onSelect: () => this.toggleConnectionsVisible(),
            },
            {
                separator: true,
                id: 'clear-canvas',
                icon: '🧹',
                label: '清空画布',
                hint: '删掉当前页所有节点',
                danger: true,
                onSelect: () => this.clearCanvas(),
            },
        ];
    }

    /**
     * 建一个「引用副本」：把某个节点的端口复制成只读副本，专门用来布线
     *
     * 样式与容器节点的展开态一致（虚线 + 半透明底色 + 标题栏），但内部不可编辑、不可缩放。
     * 关键语义：**副本端口上拖出的连线落在原节点端口上**（`resolveRefPort` +
     * `ConnectionManager.tryCreateConnection`），所以副本只影响画布布局、不进数据 ——
     * 可以随便摆位、随便删；删副本也不会删掉那些线（它们本来就记在原节点上）。
     *
     * @param {any} sourceNodeId - 源节点 id
     * @param {{ x?: number; y?: number }} [opts] - 副本位置（缺省摆在源节点右侧）
     * @returns {any | null} 副本节点模型
     */
    createRefNode(sourceNodeId, opts = {}) {
        const key = String(sourceNodeId);
        const source = this.nodeManager.nodes.get(key);
        if (!source) return null;
        if (this.containerNodes.has(key)) {
            this._notify('容器节点不支持创建引用副本');
            return null;
        }
        if (source.type === REF_NODE_TYPE) {
            this._notify('引用副本不再生成第二层副本');
            return null;
        }

        const x = Math.round(opts.x != null ? opts.x : (source.x || 0) + (source.width || 300) + 120);
        const y = Math.round(opts.y != null ? opts.y : source.y || 0);
        const ref = this.nodeManager.addToolNode(REF_NODE_TYPE, {
            title: `${source.title || source.type}（引用）`,
            x,
            y,
            properties: [],
        });
        if (!ref) return null;

        this.refNodes.set(String(ref.id), key);
        this._buildRefContent(String(ref.id));
        this.saveRefNodes();

        // ⚠️ 视图在 `addToolNode` 时就建好了（那时端口与预览属性都还没造）→ **必须重绘**，
        // 否则副本是个空壳：端口不渲染（拖不出线）、内容也看不见。
        const view = this.nodeManager.nodeViews.get(String(ref.id));
        if (view && typeof view.redraw === 'function') view.redraw();
        if (view && typeof view.onMounted === 'function') view.onMounted();
        this._notify(`已创建「${source.title || source.type}」的引用副本`);
        return ref;
    }

    /**
     * @private 造副本的全部内容：只读预览属性（含 hub 结构）+ 代理端口
     *
     * 排布由设置 `setting.refPropertyLayout` 决定：
     * - `copy`（默认，**按原节点复制**）：属性区就是源节点属性区的只读翻版 —— 嵌套 hub、「可变属性」
     *   hub 原样保留，端口也留在原来的位置（`inputs` / `outputs` 的端口本来就摆在节点左右两侧）；
     * - `spread`（**端口集中到两侧**）：属性压成一行行只读值，**所有**端口（属性列表里的、
     *   嵌套 hub 里的、可变属性 hub 里的、扩展属性 hub 里的）都收到副本左右两侧，
     *   标签带上 hub 名（`卡牌·性相`）—— 布线时不用在属性区里找点。
     *
     * 两种模式都遵守：
     * - 值是**代理**（`createPassthroughProxy`）：源节点改了 → 副本跟着变；反向不生效
     *   （控件由 `NodeView` 锁成只读）；
     * - **连不上的端口不渲染**（`_refPortUsable`）：容量已满、受保护来源的输出 / reverse 输入，
     *   在副本上拉也拉不出线，留着只会误导；
     * - 按钮类交互件不进预览；源节点切模式 / 结构变化（`update:mode` / `redraw`）→ 整份重建。
     *
     * @param {string} refId - 副本节点 id
     * @returns {{ props: number; ports: number }} 建了几个预览属性 / 端口
     */
    _buildRefContent(refId) {
        const key = String(refId);
        const ref = this.nodeManager.nodes.get(key);
        const sourceId = this.refNodes.get(key);
        const source = sourceId ? this.nodeManager.nodes.get(sourceId) : null;

        // 源节点没了：把上一轮的预览与端口全摘掉（副本只剩壳；端口一律拒绝连接，见 `checkConnectionAllowed`）
        if (!ref || !source) {
            this._releaseRefExtras(key);
            if (ref) this._clearRefPorts(ref);
            return { props: 0, ports: 0 };
        }

        // 重建时先把上一轮的预览属性、端口与监听清掉（幂等）
        this._releaseRefExtras(key);
        this._clearRefPorts(ref);

        /** @type {any[]} */
        const props = [];
        /** @type {Array<{ source: any; onSourceChange: (e: any) => void }>} */
        const bindings = [];
        /** @type {Array<{ node: any; event: string; handler: (e: any) => void }>} */
        const nodeBindings = [];
        const spread = this.setting.refPropertyLayout === 'spread';
        /** 端口 id 在每个方向内独立编号（必须唯一，否则按 id 找属性会找错） */
        const seq = { input: 0, output: 0 };
        let portCount = 0;

        /** 造一个代理端口；**连不上**（容量满 / 受保护来源阻断）就返回 null（不渲染） */
        const buildPort = (/** @type {any} */ sourcePort, /** @type {'input' | 'output'} */ side, /** @type {string} */ group, /** @type {boolean} */ edge) => {
            if (!this._refPortUsable(source, sourcePort, side)) return null;
            const prop = this._createRefPort(ref, String(sourceId), sourcePort, side, seq[side], group, edge);
            seq[side] += 1;
            portCount += 1;
            return prop;
        };

        /** 递归镜像一个属性（hub 结构保留；端口按能否连接过滤；值走只读代理） */
        const mirrorProp = (/** @type {any} */ prop, /** @type {string} */ group) => {
            if (!prop) return null;
            if (prop instanceof HubProp) {
                const hub = new HubProp(`${ref.id}:refHub:${prop.id}`, prop.label, [], prop.layout || 'single');
                if (prop.showLabel) /** @type {any} */ (hub).showLabel = true;
                (prop.properties || []).forEach((/** @type {any} */ child) => {
                    const mirrored = mirrorProp(child, group);
                    if (mirrored) hub.addProp(mirrored);
                });
                // 子项全被过滤（端口连不上 / 空 hub）→ 这个 hub 也没必要渲染
                return hub.properties.length ? hub : null;
            }
            if (prop.type === 'port') return buildPort(prop, this._portSideOf(prop), group, false);
            if (prop.type === 'button' || prop.type === 'table-button') return null;
            return this._mirrorRefProp(ref, source, prop, bindings);
        };

        // 预览首行：写明「引用自谁」（类型 · 标题 · uid）—— 一眼看出这是对哪个节点的引用
        props.push(this._refInfoRow(ref, source));

        if (spread) {
            // 端口集中到两侧：属性区只留一行行只读值
            ((/** @type {any} */ (source)).detailProperties || []).forEach((/** @type {any} */ prop) => {
                if (!prop || prop instanceof HubProp) return;
                if (prop.type === 'port' || prop.type === 'button' || prop.type === 'table-button') return;
                const proxy = this._mirrorRefProp(ref, source, prop, bindings);
                if (proxy) props.push(proxy);
            });
            this._collectSourcePorts(source).forEach(({ port, side, group }) => {
                const built = buildPort(port, side, group, true);
                if (built) this._hubForSide(ref, side).addProp(built);
            });
        } else {
            // 按原节点复制：属性区照源节点的样子镜像（hub 结构、端口位置都保留），
            // 只有顶层 `inputs` / `outputs` 的端口摆到副本左右两侧
            ((/** @type {any[]} */ (/** @type {any} */ (source).properties)) || []).forEach((/** @type {any} */ prop) => {
                if (!prop || prop === /** @type {any} */ (source).portHub) return;
                const mirrored = mirrorProp(prop, '');
                if (mirrored) props.push(mirrored);
            });
            /** @type {Array<['input' | 'output', any]>} */
            const edgeHubs = [
                ['input', /** @type {any} */ (source).inputs],
                ['output', /** @type {any} */ (source).outputs],
            ];
            edgeHubs.forEach(([side, hub]) => {
                ((hub && hub.properties) || []).forEach((/** @type {any} */ sourcePort) => {
                    if (!sourcePort || sourcePort.type !== 'port') return;
                    const built = buildPort(sourcePort, side, '', true);
                    if (built) this._hubForSide(ref, side).addProp(built);
                });
            });
        }

        // 源节点**结构**变化：「可变属性」换了一组（切模式），或扩展属性增减 / 结构重绘
        // → 整份预览（属性 + 端口）重建。这就是「可变节点 / 可变属性也要同步」的关键：
        // 不跟着重建，副本会一直显示上一组可变属性，端口也对不上。
        const onSourceStructure = () => this._refreshRefsOfSource(String(sourceId));
        ['update:mode', 'redraw'].forEach((event) => {
            source.addEventListener(event, onSourceStructure);
            nodeBindings.push({ node: source, event, handler: onSourceStructure });
        });

        if (props.length) ref.appendProps(props);
        this.refExtras.set(key, { props, bindings, nodeBindings });
        return { props: props.length, ports: portCount };
    }

    /**
     * @private 副本预览的首行：「引用自 `<类型> · <标题> · uid <源 uid>`」
     *
     * @param {any} ref - 副本节点模型
     * @param {any} source - 源节点模型
     * @returns {any} 只读的 `ViewProp`
     */
    _refInfoRow(ref, source) {
        const info = new ViewProp(
            `${ref.id}:refSource`,
            '引用自',
            'text',
            `${source.type} · ${source.title || '(无标题)'} · uid ${/** @type {any} */ (source).uid}`,
            [],
            []
        );
        const infoAny = /** @type {any} */ (info);
        infoAny.readonly = true;
        infoAny.inputPort = null;
        infoAny.layout = PortProp.layoutTypes.ignorePort;
        return info;
    }

    /**
     * @private 把一个**值属性**镜像成只读代理（并登记「源 → 副本」单向同步）
     *
     * @param {any} ref - 副本节点模型
     * @param {any} source - 源节点模型
     * @param {any} prop - 源节点上的属性
     * @param {any[]} bindings - 监听登记（重建 / 删除时解除绑定）
     * @returns {any} 代理属性
     */
    _mirrorRefProp(ref, source, prop, bindings) {
        const kind = source.type === 'table' || source.type === 'list' ? 'tool' : 'variable';
        const proxy = createPassthroughProxy(ref, source, { kind, prop });
        const proxyAny = /** @type {any} */ (proxy);
        proxyAny.readonly = true; // 渲染后由 NodeView 锁成只读
        proxy.parentNode = new WeakRef(ref);

        // 下拉框（含「可变属性」的模式开关）：把选项带过去，否则渲染成空的禁用下拉，看着像坏了
        if (prop.config && prop.config.opts) {
            proxyAny.config = { ...(proxyAny.config || {}), opts: prop.config.opts };
        }
        // ⚠️ 模式开关的值取 `currentMode`：程序化切模式（`switchMode`）时开关自己的值不一定跟着走
        if (prop.isModeSwitcher) {
            const mode = /** @type {any} */ (source).currentMode;
            if (mode != null) proxyAny.value = String(mode);
        }

        // 只绑「源 → 副本」单向：副本是只读预览，不需要写回
        const onSourceChange = (/** @type {any} */ e) => {
            const next = e && e.detail ? e.detail.value : undefined;
            if (next === undefined || proxy.value === next) return;
            proxy.updateValue(next);
        };
        prop.addEventListener('update', onSourceChange);
        prop.addEventListener('change:property', onSourceChange);
        bindings.push({ source: prop, onSourceChange });

        return proxy;
    }

    /**
     * @private 这个源端口**能不能在副本上真的连出一条线**（连不上就不渲染）
     *
     * 副本的用途就是连接，渲染一个拉不出线的点只会误导用户。判据：
     * 1. **容量满了**（`maxLinks` 用尽，如单连接的 `inherits` / `slots`）：再加一条会失败；
     * 2. **源节点是受保护来源**（origin / 其他 mod）：
     *    - 输出端口：线记在源节点上 → 一定被 `checkConnectionAllowed` 拦掉；
     *    - `reverse` 的输入端口：语义主体在对端（= 源节点）→ 同样被拦；
     *    - 普通输入端口仍然好用 —— 线写在**对端**节点上，指向 origin 是合法的，所以保留。
     *
     * @param {any} source - 源节点模型
     * @param {any} sourcePort - 源端口属性
     * @param {'input' | 'output'} side - 方向
     * @returns {boolean} 能否连接（false → 副本上不建这个端口）
     */
    _refPortUsable(source, sourcePort, side) {
        if (!sourcePort) return false;
        const portModel = side === 'output' ? sourcePort.outputPort : sourcePort.inputPort;
        if (portModel && typeof portModel.canConnected === 'function' && !portModel.canConnected()) return false;
        if (this.isProtectedSource(source)) {
            if (side === 'output') return false;
            if (sourcePort.reverse === true) return false;
        }
        return true;
    }

    /**
     * @private 副本某个方向的端口 hub（`inputs` / `outputs`）
     *
     * @param {any} ref - 副本节点模型
     * @param {'input' | 'output'} side - 方向
     * @returns {any} 端口 hub
     */
    _hubForSide(ref, side) {
        const refAny = /** @type {any} */ (ref);
        return side === 'input' ? refAny.inputs : refAny.outputs;
    }

    /**
     * @private 清空副本左右两个端口 hub（重建 / 源节点消失时用）
     *
     * @param {any} ref - 副本节点模型
     * @returns {void}
     */
    _clearRefPorts(ref) {
        const refAny = /** @type {any} */ (ref);
        [refAny.inputs, refAny.outputs].forEach((/** @type {any} */ hub) => {
            if (hub && Array.isArray(hub.properties)) hub.properties.splice(0, hub.properties.length);
        });
    }

    /**
     * @private 重建副本的属性区（幂等）
     *
     * @param {string} refId - 副本节点 id
     * @returns {number} 建了几个预览属性
     */
    _buildRefProps(refId) {
        return this._buildRefContent(refId).props;
    }

    /**
     * @private 重建副本的端口（幂等）
     *
     * @param {string} refId - 副本节点 id
     * @returns {number} 建了几个端口
     */
    _buildRefPorts(refId) {
        return this._buildRefContent(refId).ports;
    }

    /**
     * @private 源节点结构变化 → 重建**所有**代理它的副本（带防重入）
     *
     * 监听挂在源节点上（`update:mode` / `redraw`），重建过程中又会读写源节点，
     * 防重入标记避免「重建 → 触发源事件 → 再重建」的自激循环。
     *
     * @param {string} sourceId - 源节点 id
     * @returns {number} 刷新了几个副本
     */
    _refreshRefsOfSource(sourceId) {
        if (this._refSyncing) return 0;
        this._refSyncing = true;
        try {
            return this.refreshRefNodesOf(sourceId);
        } finally {
            this._refSyncing = false;
        }
    }

    /**
     * @private 摘掉副本的预览属性并解绑它的同步监听（重建 / 删除时用）
     *
     * @param {string} refId - 副本节点 id
     * @returns {void}
     */
    _releaseRefExtras(refId) {
        const record = this.refExtras.get(String(refId));
        if (!record) return;
        const ref = this.nodeManager.nodes.get(String(refId));
        record.bindings.forEach(({ source, onSourceChange }) => {
            if (source && typeof source.removeEventListener === 'function') {
                source.removeEventListener('update', onSourceChange);
                source.removeEventListener('change:property', onSourceChange);
            }
        });
        // 源**节点**上的结构监听也要摘掉（否则源节点一重绘就去找已删的副本）
        (record.nodeBindings || []).forEach(({ node, event, handler }) => {
            if (node && typeof node.removeEventListener === 'function') node.removeEventListener(event, handler);
        });
        if (ref) record.props.forEach((prop) => ref.removeProperty(prop));
        this.refExtras.delete(String(refId));
    }

    /**
     * @private 收集源节点上**所有**可连线的端口（含「可变属性」hub 里的）
     *
     * 端口在模板里有三处：`inputs` / `outputs`、属性列表里直接声明的 `type: 'port'`、
     * 以及嵌套 hub（属性 hub、**可变属性** `modeProperties` hub、扩展属性 hub）里的端口。
     * 顺序保持声明顺序；`group` 就是端口所在 hub 的标签（顶层输入 / 输出端口为空串），
     * 副本上用来把「这一堆是哪个可变属性里的」标出来。
     *
     * ⚠️ 只有**当前模式**的 hub 在 `properties` 里（其余模式不在树上、连不了线），所以这里天然
     * 只收当前那一组可变属性 —— 切模式由 `_refreshRefsOfSource` 重建。
     *
     * @param {any} source - 源节点模型
     * @returns {Array<{ port: any; side: 'input' | 'output'; group: string }>} 端口清单
     */
    _collectSourcePorts(source) {
        /** @type {Array<{ port: any; side: 'input' | 'output'; group: string }>} */
        const found = [];
        /** @param {any[]} props @param {string} group */
        const walk = (props, group) => {
            (props || []).forEach((prop) => {
                if (!prop) return;
                if (prop instanceof HubProp) {
                    // 端口 hub（`portHub`）与它的两个子 hub（输入 / 输出端口）都不算分组：
                    // 它们的端口本来就摆在节点左右两侧，再加前缀只会变啰嗦
                    const isEdgeHub = prop === source.portHub || prop === source.inputs || prop === source.outputs;
                    const childGroup = isEdgeHub ? group : prop.label || prop.name || group;
                    walk(prop.properties, childGroup || '');
                    return;
                }
                if (prop.type !== 'port') return;
                found.push({ port: prop, side: this._portSideOf(prop), group: group || '' });
            });
        };
        walk(/** @type {any[]} */ (/** @type {any} */ (source).properties), '');
        return found;
    }

    /**
     * @private 端口的输入 / 输出方向
     *
     * 有 `outputPort` 而没有 `inputPort` → 输出；其余（含 `direction: 'both'`，两个都有）按输入算。
     *
     * @param {any} port - 源节点的端口属性
     * @returns {'input' | 'output'}
     */
    _portSideOf(port) {
        const anyProp = /** @type {any} */ (port);
        if (anyProp.outputPort && !anyProp.inputPort) return 'output';
        return 'input';
    }

    /**
     * @private 造一个副本上的「代理端口」
     *
     * @param {any} ref - 副本节点模型
     * @param {string} sourceId - 源节点 id
     * @param {any} sourcePort - 源节点的端口属性
     * @param {'input' | 'output'} side - 方向
     * @param {number} index - 该方向内的序号（拼端口 id 用）
     * @param {string} group - 端口所在 hub 的标签（空 = 顶层输入 / 输出端口）
     * @returns {any} 代理端口（`PortProp`）
     */
    _createRefPort(ref, sourceId, sourcePort, side, index, group, edge = true) {
        const isInput = side === 'input';
        const portId = `${ref.id}:${side}-${index}`;
        const baseLabel = sourcePort.label || sourcePort.name || '端口';
        const dotConfig = (isInput ? sourcePort.inputPort : sourcePort.outputPort) || {};

        const prop = new PortProp(
            portId,
            // 来自「可变属性」/ 嵌套 hub 的端口带上所在 hub 的名字：一眼看出这是哪一组
            group ? `${group}·${baseLabel}` : baseLabel,
            'port',
            '',
            {
                name: sourcePort.name,
                // 贴边的端口（inputs / outputs）强制单侧点；留在属性区的保留源端口的 layout，
                // 这样「按原节点复制」模式里端口还在原来的位置、也是原来的样子
                layout: edge
                    ? isInput
                        ? PortProp.layoutTypes.noRight
                        : PortProp.layoutTypes.noLeft
                    : sourcePort.layout || PortProp.layoutTypes.normal,
                // 反向记录（alt / linked / alternativerecipes / inductions / induces）要一并复制：
                // 受保护来源判定按它算「语义主体在对端」
                reverse: sourcePort.reverse === true,
                valueType: '', // 纯端口：没有值输入框 → 副本内部不可编辑
                ...(isInput
                    ? {
                          inputPort: {
                              id: `${portId}_dot`,
                              dataType: dotConfig.dataType || 'any',
                              maxLinks: dotConfig.maxLinks || Infinity,
                          },
                      }
                    : {
                          outputPort: {
                              id: `${portId}_dot`,
                              dataType: dotConfig.dataType || 'any',
                              maxLinks: dotConfig.maxLinks || Infinity,
                          },
                      }),
            }
        );
        prop.description = sourcePort.description; // 悬停说明跟着源端口（识别端口用）
        prop.parentNode = new WeakRef(ref);
        /**
         * 指回源节点的端口（`resolveRefPort` 用）
         *
         * `propId` 是精确回指（端口 id 唯一），`name` / `side` 是刷新恢复后的回退
         * （`refProxy` 不进节点快照，见 `saveRefNodes`）。
         */
        /** @type {any} */ (prop).refProxy = {
            nodeId: sourceId,
            side,
            name: sourcePort.name,
            propId: String(sourcePort.id),
        };
        return prop;
    }

    /**
     * @private 在源节点上找端口：先按 `propId` 精确匹配，再按方向 + 名字回退
     *
     * @param {any} source - 源节点模型
     * @param {{ propId?: string | null; side?: 'input' | 'output' | null; name?: string | null }} key - 线索
     * @returns {{ port: any; side: 'input' | 'output'; group: string } | null} 命中的端口
     */
    _findSourcePort(source, key = {}) {
        const ports = this._collectSourcePorts(source);
        if (key.propId) {
            const exact = ports.find((item) => String(item.port.id) === String(key.propId));
            if (exact) return exact;
        }
        if (key.name == null) return null;
        return ports.find((item) => item.port.name === key.name && (!key.side || item.side === key.side)) || null;
    }

    /**
     * 重建某个引用副本的端口（幂等）：源节点端口结构变了时调用
     *
     * @param {any} refId - 副本节点 id
     * @returns {number} 重建了几个端口
     */
    refreshRefPorts(refId) {
        if (!this.refNodes.has(String(refId))) return 0;
        const count = this._buildRefContent(String(refId)).ports;
        // 端口是画在 DOM 里的：改完模型必须重绘，否则界面上还是老的那几个点
        const view = this.nodeManager.nodeViews.get(String(refId));
        if (view && typeof view.redraw === 'function') view.redraw();
        return count;
    }

    /**
     * 重建副本的**预览属性**（源节点属性结构变了时调用；幂等）
     *
     * @param {any} refId - 副本节点 id
     * @returns {number} 重建了几个预览属性
     */
    refreshRefProps(refId) {
        if (!this.refNodes.has(String(refId))) return 0;
        const count = this._buildRefContent(String(refId)).props;
        const view = this.nodeManager.nodeViews.get(String(refId));
        if (view && typeof view.redraw === 'function') view.redraw();
        return count;
    }

    /**
     * 重建**全部**引用副本（幂等）：副本排布设置（`refPropertyLayout`）变了时调用
     *
     * @returns {number} 重建了几个副本
     */
    refreshAllRefs() {
        let count = 0;
        this.refNodes.forEach((_sourceId, refId) => {
            this._buildRefContent(refId);
            const view = this.nodeManager.nodeViews.get(refId);
            if (view && typeof view.redraw === 'function') view.redraw();
            count += 1;
        });
        return count;
    }

    /**
     * 源节点端口结构变化后，刷新**所有**代理它的引用副本（幂等）
     *
     * @param {any} sourceId - 源节点 id
     * @returns {number} 刷新了几个副本
     */
    refreshRefNodesOf(sourceId) {
        const key = String(sourceId);
        let count = 0;
        this.refNodes.forEach((srcId, refId) => {
            if (srcId !== key) return;
            // 属性与端口一起重建（统一构建器，幂等）
            if (this._buildRefContent(refId).ports) count += 1;
            const view = this.nodeManager.nodeViews.get(refId);
            if (view && typeof view.redraw === 'function') view.redraw();
        });
        return count;
    }

    /**
     * 删掉一个引用副本（**不动**原节点，也不动连在原节点上的线）
     *
     * @param {any} refId - 副本节点 id
     * @returns {boolean} 是否删掉
     */
    removeRefNode(refId) {
        const key = String(refId);
        if (!this.refNodes.has(key)) return false;
        this._releaseRefExtras(key);
        this.refNodes.delete(key);
        this.nodeManager.deleteNode(key);
        this.saveRefNodes();
        this._notify('已删除引用副本（原节点与连线不受影响）');
        return true;
    }

    /**
     * 副本节点的源节点 id
     *
     * @param {any} refId - 副本节点 id
     * @returns {string | null} 源节点 id（不是副本 = null）
     */
    refSourceOf(refId) {
        return this.refNodes.get(String(refId)) || null;
    }

    /**
     * 把引用副本记账写进 localStorage（刷新后副本还能认出原节点）
     *
     * ⚠️ 端口上的 `refProxy` **不进**节点快照（`PortProp.toJSON` 没有它），所以恢复只拿回
     * 「谁代理谁」，端口靠 `resolveRefPort` 的「按名字回退」重新对上。
     *
     * @returns {boolean} 是否写入成功
     */
    saveRefNodes() {
        try {
            if (typeof localStorage === 'undefined') return false;
            localStorage.setItem(REF_NODES_STORAGE_KEY, JSON.stringify([...this.refNodes.entries()]));
            return true;
        } catch (error) {
            console.warn('[引用副本] 写入 localStorage 失败:', error);
            return false;
        }
    }

    /**
     * 从 localStorage 恢复引用副本记账（只恢复两边都还在画布上的）
     *
     * @returns {number} 恢复了几条
     */
    restoreRefNodes() {
        if (typeof localStorage === 'undefined') return 0;
        let raw = null;
        try {
            raw = JSON.parse(localStorage.getItem(REF_NODES_STORAGE_KEY) || 'null');
        } catch (error) {
            raw = null;
        }
        if (!Array.isArray(raw)) return 0;

        let restored = 0;
        raw.forEach((pair) => {
            if (!Array.isArray(pair) || pair.length < 2) return;
            const refId = String(pair[0]);
            const sourceId = String(pair[1]);
            if (!this.nodeManager.nodes.has(refId) || !this.nodeManager.nodes.has(sourceId)) return;
            this.refNodes.set(refId, sourceId);
            restored += 1;
        });
        return restored;
    }

    /**
     * 把「副本端口」解析成它代理的原节点端口（不是副本端口就原样返回）
     *
     * @param {any} node - 端口所属节点
     * @param {any} port - 端口（`PortProp`）
     * @returns {{ node: any; port: any }} 真正的两端（解析不到时原样返回）
     */
    resolveRefPort(node, port) {
        if (!node || !port || node.type !== REF_NODE_TYPE) return { node, port };
        // ⚠️ 拖拽链路传下来的是 **PortModel**（`PortProp` 里的 `inputPort` / `outputPort`），
        // `refProxy` 存在它所属的 `PortProp` 上 → 经 `parentProp` 找回去（也兼容直接传 PortProp）
        const prop = /** @type {any} */ (port).parentProp || port;
        const proxy = /** @type {any} */ (prop).refProxy;
        // 优先信端口自带的 refProxy；刷新恢复后它不在（不进快照）→ 按记账 + 端口名回退
        const sourceId = (proxy && proxy.nodeId) || this.refNodes.get(String(node.id));
        if (!sourceId) return { node, port };

        const source = this.nodeManager.nodes.get(String(sourceId));
        if (!source) return { node, port };

        // 方向：先信 refProxy；没有就信端口模型自己的 `direction`（拖拽链路里就是它）；再兜底按 `direction` 字段
        const incoming = /** @type {any} */ (port).direction;
        const side =
            (proxy && proxy.side) ||
            (incoming === 'input' || incoming === 'output' ? incoming : null) ||
            (prop.direction === 'input' ? 'input' : 'output');
        const name = (proxy && proxy.name) || prop.name;

        // ⚠️ 端口**不只**在 inputs / outputs 里：属性列表里的端口、嵌套 hub 与「可变属性」hub
        // 里的端口（elements 的性相 / 卡槽 / 触发器…）都要能回指到，否则那些端口连不上线
        const hit = this._findSourcePort(source, { propId: proxy && proxy.propId, side, name });
        if (!hit) return { node, port };

        // 返回**源节点的端口模型**：调用方要用它建连接（连线落在原节点上）
        const sourcePort = hit.side === 'output' ? hit.port.outputPort : hit.port.inputPort;
        return { node: source, port: sourcePort || hit.port };
    }

    /**
     * 节点的命名空间（uid 的前缀，如 `mymod:recipes:r1` → `mymod`）
     *
     * @param {any} node - 节点模型
     * @returns {string} 命名空间（取不到 = 空串）
     */
    namespaceOf(node) {
        const uid = String(/** @type {any} */ (node && node.uid) || '');
        return uid.includes(':') ? uid.split(':')[0] : '';
    }

    /**
     * 节点是否属于「受保护来源」：**origin** 或其他 mod（它们的 JSON 不该被改）
     *
     * - `source === 'origin'` → 只读；
     * - `source === 'mod'` 且命名空间 ≠ 当前编辑的命名空间（`editingNamespace`）→ 其他 mod，只读；
     *   ⚠️ 没设 `editingNamespace` 时**只保护 origin**（否则在读到 mod 之前，所有 mod 数据都会被判只读）；
     * - 前端新建的节点 / 变量节点 / 工具节点没有来源 → 可写。
     *
     * @param {any} node - 节点模型
     * @returns {boolean} 是否受保护
     */
    isProtectedSource(node) {
        const source = /** @type {any} */ (node && node.source);
        if (source === 'origin') return true;
        if (source !== 'mod') return false;
        if (!this.editingNamespace) return false;
        return this.namespaceOf(node) !== this.editingNamespace;
    }

    /**
     * 连接前的判定：引用副本解析 + 受保护来源拦截
     *
     * 「会动到谁的 JSON」按两个端算（契约里的 `reverse` 正好说明它们可能不是同一端）：
     * - **书写端**：`output` 端口的关系声明在本端（写本端 JSON），`input` 端口声明在对端 ——
     *   调用方已把起始端口统一成 output，所以书写端 = 起始节点；
     * - **语义主体端**：`reverse` 端口（`alt` / `linked` / `alternativerecipes` / `inductions` / `induces`）
     *   的「是否跳转 / 能否触发」由**对端** recipe 自己的定义决定 → 主体在对端。
     *
     * 这两端**任一**是受保护来源就拒绝（origin / 其他 mod 的 JSON 不该被改）。
     *
     * @param {any} fromNode - 起始节点（output 侧）
     * @param {any} fromPort - 起始端口
     * @param {any} toNode - 目标节点
     * @param {any} toPort - 目标端口
     * @returns {{ ok: boolean; reason?: string; from: { node: any; port: any }; to: { node: any; port: any } }}
     */
    checkConnectionAllowed(fromNode, fromPort, toNode, toPort) {
        const from = this.resolveRefPort(fromNode, fromPort);
        const to = this.resolveRefPort(toNode, toPort);

        // 副本端口解析不到源端口（原节点被删 / 端口改名）→ 不能连：
        // 否则连线会记在副本上，污染数据（导出时多出一个不存在的节点）
        if (fromNode && fromNode.type === REF_NODE_TYPE && from.node === fromNode) {
            return { ok: false, reason: '引用副本的原节点已不在画布上，这条线无处所属', from, to };
        }

        const writer = from.node;
        // ⚠️ `reverse`（反向记录）存在**端口属性**上：拖拽链路传下来的是端口模型（`PortModel`），
        // 所以经 `parentProp` 找回它的 `PortProp` 再读 —— 直接读 `fromPort.reverse` 永远是 undefined。
        const fromProp = /** @type {any} */ (fromPort && (((/** @type {any} */ (fromPort)).parentProp) || fromPort));
        const subject = fromProp && fromProp.reverse ? to.node : writer;
        const blocked = this.isProtectedSource(writer) ? writer : this.isProtectedSource(subject) ? subject : null;
        if (!blocked) return { ok: true, from, to };

        const who = blocked.title || blocked.type || String(blocked.id);
        const owner = /** @type {any} */ (blocked).source === 'origin' ? 'origin（随游戏本体，只读）' : '其他 mod（只读）';
        return {
            ok: false,
            reason: `「${who}」属于 ${owner}，连这条线会动到它的 JSON，已阻止`,
            from,
            to,
        };
    }

    /**
     * 把被阻止的连接告知用户（状态栏 + 控制台：这是错误，要看得见）
     *
     * @param {string} reason - 阻止原因
     * @returns {void}
     */
    reportBlockedConnection(reason) {
        if (!reason) return;
        console.error('[连接被阻止]', reason);
        this._notify(`⛔ ${reason}`);
    }

    /**
     * 复制节点：建一个同类型副本（属性值按属性 id 的**后缀**对齐拷贝）
     *
     * 副本位置往右下错开，同时把副本规格记进剪贴板 —— 之后可以在画布空白处右键「粘贴」。
     * 容器节点不复制（成员归属没有意义），要复制请先「拆开容器节点」。
     *
     * @param {any} nodeId - 源节点 id
     * @param {{ x?: number; y?: number }} [offset] - 副本相对原节点的偏移
     * @returns {any | null} 副本节点模型
     */
    duplicateNode(nodeId, offset = { x: 48, y: 48 }) {
        const key = String(nodeId);
        const src = this.nodeManager.nodes.get(key);
        if (!src) return null;
        if (this.containerNodes.has(key)) {
            this._notify('容器节点不支持复制（可先「拆开容器节点」）');
            return null;
        }

        const spec = this._nodeSpecOf(src);
        this.nodeClipboard = spec;
        const copy = this._createNodeFromSpec(
            spec,
            Math.round((src.x || 0) + (offset.x || 0)),
            Math.round((src.y || 0) + (offset.y || 0))
        );
        if (copy) this._notify(`已复制「${src.title || src.type}」`);
        return copy;
    }

    /**
     * 在指定屏幕位置粘贴剪贴板里的节点（复制节点时会记进去）
     *
     * @param {{ x: number; y: number } | null} [position] - 屏幕坐标（不传 = 视图中心）
     * @returns {any | null} 新节点模型
     */
    pasteNode(position = null) {
        const spec = this.nodeClipboard;
        if (!spec) {
            this._notify('剪贴板是空的：先对节点执行「复制节点」');
            return null;
        }
        const world = position ? this.viewportToWorld(position.x, position.y) : this.ViewCenter;
        const created = this._createNodeFromSpec(spec, Math.round(world.x), Math.round(world.y));
        if (created) this._notify(`已粘贴「${spec.title || spec.type}」`);
        return created;
    }

    /**
     * @private 按规格建节点并套用标题 / 属性值
     *
     * @param {{ type: string; title?: string; values?: Array<{ key: string; value: any }> }} spec - 节点规格
     * @param {number} x
     * @param {number} y
     * @returns {any | null} 新节点模型
     */
    _createNodeFromSpec(spec, x, y) {
        if (!spec || !spec.type) return null;
        const before = new Set(this.nodes.map((item) => String(item.id)));
        this.nodeManager.addNode(spec.type, x, y);
        const created = this.nodes.find((item) => !before.has(String(item.id)));
        if (!created) return null;
        this._applySpecToNode(spec, created);
        created.setSelected(true);
        return created;
    }

    /**
     * @private 抽出一份「可复制的节点规格」
     *
     * 属性 id 里含节点 id（如 `12_input-0`），副本的 id 不同，所以值要按**去掉节点 id 前缀的后缀**对齐。
     *
     * @param {any} node - 源节点模型
     * @returns {{ type: string; title: string; values: Array<{ key: string; value: any }> }}
     */
    _nodeSpecOf(node) {
        const nid = String(node.id);
        return {
            type: node.type,
            title: node.title || '',
            values: (node.detailProperties || []).map((prop) => ({
                key: this._propKeyOf(prop.id, nid),
                value: prop.value,
            })),
        };
    }

    /**
     * @private 属性 id 去掉节点 id 前缀后的「后缀」（用来在新旧节点之间对齐属性）
     *
     * @param {any} propId - 属性 id
     * @param {any} nodeId - 所属节点 id
     * @returns {string} 后缀
     */
    _propKeyOf(propId, nodeId) {
        const id = String(propId);
        const prefix = String(nodeId);
        return id.startsWith(prefix) ? id.slice(prefix.length) : id;
    }

    /**
     * @private 把规格里的标题与属性值套到新节点上（对不上的属性跳过，不报错）
     *
     * @param {{ title?: string; values?: Array<{ key: string; value: any }> }} spec - 节点规格
     * @param {any} node - 目标节点模型
     * @returns {number} 成功套用几个属性值
     */
    _applySpecToNode(spec, node) {
        if (!spec || !node) return 0;
        if (spec.title) node.title = spec.title;
        if (!Array.isArray(spec.values) || !spec.values.length) {
            if (spec.title) node.emit('redraw', {});
            return 0;
        }

        const nid = String(node.id);
        const targets = new Map((node.detailProperties || []).map((prop) => [this._propKeyOf(prop.id, nid), prop]));
        let applied = 0;
        spec.values.forEach(({ key, value }) => {
            const target = targets.get(key);
            if (!target || typeof target.updateValue !== 'function') return;
            target.updateValue(value);
            applied += 1;
        });
        if (spec.title) node.emit('redraw', {});
        return applied;
    }

    /**
     * 重命名节点：直接把光标送进标题输入框并全选（不改数据模型）
     *
     * @param {any} nodeId - 节点 id
     * @returns {boolean} 是否聚焦成功
     */
    renameNode(nodeId) {
        const view = this.nodeManager.nodeViews.get(String(nodeId));
        const input = /** @type {HTMLInputElement | null} */ (
            view && view.element ? view.element.querySelector('.node-title-input') : null
        );
        if (!input || typeof input.focus !== 'function') {
            this._notify('找不到这个节点的标题输入框');
            return false;
        }
        input.focus();
        if (typeof input.select === 'function') input.select();
        return true;
    }

    /**
     * 打开「修改可选属性」面板（等价于点节点上的那个按钮）
     *
     * @param {any} nodeId - 节点 id
     * @param {{ x: number; y: number } | null} [position] - 面板弹出的屏幕坐标
     * @returns {boolean} 是否打开
     */
    openExtendPropertyPanel(nodeId, position = null) {
        const node = this.nodeManager.nodes.get(String(nodeId));
        const extendProps = node && /** @type {any} */ (node).extendedProperties;
        const pool = extendProps && extendProps.pool;
        if (!node || !pool) {
            this._notify('这个节点没有可选属性');
            return false;
        }
        // 面板由 NodeManager 接到 `append:property` 后建（与节点上的按钮同一条链路）
        node.emit('append:property', {
            props: pool.properties,
            position: position || { x: 0, y: 0 },
        });
        return true;
    }

    /**
     * @private 菜单里的「添加转发端口」：自动起一个没被占用的名字
     *
     * @param {any} containerId - 容器节点 id
     * @returns {any | null} 转发端口记录
     */
    addForwardPortByMenu(containerId) {
        const record = this.containerNodes.get(String(containerId));
        if (!record) return null;

        let index = record.forwardPorts.length + 1;
        let name = `forward${index}`;
        while (record.forwardPorts.some((item) => item.key === `input:${name}`)) {
            index += 1;
            name = `forward${index}`;
        }

        const entry = this.addForwardPort(String(containerId), { side: 'input', name, label: `转发端口 ${index}` });
        if (entry) this._notify(`已添加转发端口「${entry.label}」`);
        return entry;
    }

    /**
     * @private 与某个节点相连的连线
     *
     * @param {any} nodeId - 节点 id
     * @returns {any[]} 连线对象
     */
    _connectionsOfNode(nodeId) {
        const key = String(nodeId);
        /** @type {any[]} */
        const out = [];
        this.connectionManager?.connections?.forEach((conn) => {
            if (!conn) return;
            if (String(conn.fromNodeId) === key || String(conn.toNodeId) === key) out.push(conn);
        });
        return out;
    }

    /**
     * 断开某个节点的全部连线
     *
     * @param {any} nodeId - 节点 id
     * @returns {number} 断开几条
     */
    disconnectNode(nodeId) {
        const ids = this._connectionsOfNode(nodeId).map((conn) => conn.id);
        if (!ids.length) return 0;
        this.connectionManager.deleteConnections(ids);
        this._notify(`已断开 ${ids.length} 条连线`);
        return ids.length;
    }

    /**
     * @private 连线当前是否被隐藏（`ConnectionManager` 用 SVG 层上的 `hidden` 类表示）
     *
     * @returns {boolean} 是否隐藏
     */
    _connectionsHidden() {
        const layer = this.connectionManager && this.connectionManager.SVG_layer;
        return Boolean(layer && layer.classList.contains('hidden'));
    }

    /**
     * 全局切换连线显隐（工具栏「隐藏连接」按钮同款）
     *
     * @returns {boolean} 切换后是否处于隐藏状态
     */
    toggleConnectionsVisible() {
        this.connectionManager?.toggleConnections?.();
        return this._connectionsHidden();
    }

    /**
     * 「自动建容器」：后端把宿主节点拆成了若干内联子节点（`node.inline.hostUid`）时，
     * 按设置把它们**合并成一个容器节点**（宿主 + 子节点 = 一个容器）。
     *
     * ⚠️ 默认**不合并**（`setting.inlineAutoMerge === false`）：容器节点是用户右键
     * 「合并为容器节点」手动做的；后端拆出来的子节点只当普通节点显示，
     * 仅由布局把它们与宿主排在同一区域。
     *
     * @returns {{ containers: number; members: number; collapsed: number }} 统计
     */
    attachInlineContainers() {
        this.detachContainers();
        if (!this.setting.inlineAutoMerge) return { containers: 0, members: 0, collapsed: 0 };

        /** @type {Map<string, any[]>} */
        const groups = new Map();
        this.nodes.forEach((model) => {
            const inline = model && model.inline;
            if (!inline || !inline.hostUid) return;
            const host = this._findCanvasNodeByUid(inline.hostUid);
            if (!host) return; // 宿主没铺到当前页 → 子节点留在画布上
            const key = String(host.id);
            if (!groups.has(key)) groups.set(key, [host]);
            groups.get(key).push(model);
        });

        let containers = 0;
        let members = 0;
        groups.forEach((models) => {
            const frame = this.mergeToContainer(models.map((model) => model.id), {
                title: models[0].title,
                collapsed: true,
            });
            if (!frame) return;
            containers++;
            members += models.length;
        });
        return { containers, members, collapsed: containers };
    }

    /**
     * 切换某个内联宿主的折叠态（只影响它这一层，嵌套的子宿主保留自己的折叠态）
     *
     * @param {any} hostId - 宿主节点 id
     * @returns {boolean} 切换后的折叠态
     */
    toggleContainer(hostId) {
        const record = this.containerNodes.get(String(hostId));
        if (!record) return false;
        const next = !record.collapsed;
        this._applyContainerCollapsed(String(hostId), next);
        return next;
    }

    /**
     * 拆掉画布上所有容器节点（成员节点原地保留，只是不再归组）
     *
     * @returns {number} 拆掉的容器数
     */
    detachContainers() {
        if (!this.containerNodes || !this.containerNodes.size) return 0;
        const ids = Array.from(this.containerNodes.keys());
        let count = 0;
        ids.forEach((id) => {
            if (this.splitContainer(id)) count++;
        });
        return count;
    }

    /**
     * @private 应用折叠态：容器视图（背景框 / 卡片）、成员与它们连线的显隐
     *
     * 收起前先记住背景框尺寸，展开时按原尺寸恢复（收起态的卡片高度是内容决定的，量不回来）。
     *
     * @param {string} hostId - 容器节点 id
     * @param {boolean} collapsed - 是否收起
     * @returns {boolean} 是否应用成功
     */
    _applyContainerCollapsed(hostId, collapsed) {
        const record = this.containerNodes.get(String(hostId));
        if (!record) return false;
        const frame = this.nodeManager.nodes.get(String(hostId));

        if (collapsed && frame) {
            record.rect = { w: frame.width || CONTAINER_DEFAULT_WIDTH, h: frame.height || CONTAINER_TITLE_HEIGHT };
        }
        record.collapsed = Boolean(collapsed);

        this._refreshContainerViews(String(hostId));
        this._refreshContainerVisibility();
        // 展开后成员要在框内（框可能被缩过，成员也可能被拖到边上过）
        if (!record.collapsed) this._clampContainerMembers(record.members);

        // 收起 / 展开后容器高度差很大：重新测量，避免端口与连线停在旧位置上
        const frameView = this.nodeManager.nodeViews.get(String(hostId));
        if (frameView && typeof frameView.onMounted === 'function') frameView.onMounted();
        if (this.connectionManager) this.connectionManager.refreshAllConnections();
        this.saveContainers();
        return true;
    }

    /**
     * @private 逐个容器刷视图：容器本体（背景框 / 卡片 / 计数徽标）+ 成员的归属浮标
     *
     * @param {string} [onlyHostId] - 只刷这一个容器（不传 = 全部）
     * @returns {void}
     */
    _refreshContainerViews(onlyHostId = null) {
        const ids = onlyHostId ? [String(onlyHostId)] : Array.from(this.containerNodes.keys());
        ids.forEach((containerId) => {
            const record = this.containerNodes.get(containerId);
            if (!record) return;
            const frame = this.nodeManager.nodes.get(containerId);
            const frameView = this.nodeManager.nodeViews.get(containerId);

            // 自愈：容器 / 成员被删掉后，把记账里的死条目摘掉（避免刷视图时炸）
            if (!frame) {
                this.containerNodes.delete(containerId);
                return;
            }
            const alive = record.members.filter((id) => this.nodeManager.nodes.has(String(id)));
            if (alive.length !== record.members.length) {
                record.members.forEach((id) => {
                    if (!alive.includes(id)) this.containerMemberOf.delete(String(id));
                });
                record.members = alive;
            }

            // 透传属性（变量节点的值）就是容器自己的属性，收起态展示
            this._refreshContainerPassthrough(containerId);

            if (frame && frameView && typeof frameView.setContainerView === 'function') {
                // 先保证装得下（只长不缩），再把尺寸交给视图 —— 缩放句柄也按这个最小值夹
                this._ensureHeaderSpace(containerId);
                this._fitContainerToMembers(containerId);
                frameView.setContainerView({
                    collapsed: record.collapsed,
                    rect: record.rect,
                    memberCount: record.members.length,
                    level: this._containerLevelOf(containerId),
                    minSize: this._resizeMinSize(containerId),
                    // 缩放时每帧现算最小尺寸：鼠标越过所有成员右下角就不再缩，免得把布局挤坏
                    minSizeFn: () => this._resizeMinSize(containerId),
                    // 缩放句柄要按画布的平移 / 缩放换算，才能像拖节点一样跟手
                    toWorld: (x, y) => this.viewportToWorld(x, y),
                    onToggle: () => this.toggleContainer(containerId),
                    // 缩放结束：把框尺寸记下来，并把跑到框外的成员夹回来
                    onResizeEnd: (size) => {
                        record.rect = { w: size.width, h: size.height };
                        this._clampContainerMembers(record.members);
                        this._fitContainerToMembers(containerId);
                        this.saveContainers();
                    },
                });
                // 背景框 / 卡片一进一出，容器高度差很大：重新测量，避免端口与连线停在旧位置
                if (typeof frameView.onMounted === 'function') frameView.onMounted();

                // 兜底：刚合并的那一瞬间元素可能还没布局（量不到 header / 框尺寸），
                // 等视图测量完再校正一次 —— 幂等，正常情况下第二次不会再动
                if (this._ensureHeaderSpace(containerId)) {
                    this._fitContainerToMembers(containerId);
                    if (typeof frameView.onMounted === 'function') frameView.onMounted();
                }
            }

            // 成员挂「↳ 容器标题」浮标，一眼看出它属于哪个容器
            const title = (frame && (frame.title || frame.label)) || containerId;
            record.members.forEach((memberId) => {
                const memberView = this.nodeManager.nodeViews.get(String(memberId));
                if (!memberView || typeof memberView.setMemberTag !== 'function') return;
                memberView.setMemberTag({
                    text: `↳ ${title}`,
                    title: `属于容器节点「${title}」`,
                    level: this._containerLevelOf(memberId),
                });
            });
        });
    }

    /**
     * @private 递归显隐：成员可见 ⇔ **它的所有祖先容器都处于展开态**
     *
     * 容器可以嵌套：父容器收起 → 它的全部后代（含孙辈）收起；
     * 父容器展开但子容器自己收起 → 只有孙辈收起。连线按「两端都可见才显示」处理。
     *
     * @returns {void}
     */
    _refreshContainerVisibility() {
        if (!this.containerMemberOf.size) return;
        const hidden = new Set();
        this.containerMemberOf.forEach((_parent, childId) => {
            if (this._hiddenByContainers(childId)) hidden.add(childId);
        });

        this.containerMemberOf.forEach((_parent, childId) => {
            const view = this.nodeManager.nodeViews.get(String(childId));
            if (!view || !view.element) return;
            view.element.classList.toggle('node-container-member-hidden', hidden.has(childId));
        });

        this._toggleHiddenConnections(hidden);
    }

    /**
     * @private 某个节点的祖先链里有没有收起着的容器
     *
     * @param {string} nodeId - 节点 id
     * @returns {boolean} 是否该被祖先收起
     */
    _hiddenByContainers(nodeId) {
        let cursor = this.containerMemberOf.get(String(nodeId));
        let guard = 0;
        while (cursor && guard++ < 32) {
            const record = this.containerNodes.get(cursor);
            if (record && record.collapsed) return true;
            cursor = this.containerMemberOf.get(cursor);
        }
        return false;
    }

    /**
     * @private 内联层级：顶层内联节点 = 1，嵌在别的内联节点里 = 2、3……
     *
     * @param {string} nodeId - 节点 id
     * @returns {number} 层级
     */
    _containerLevelOf(nodeId) {
        let level = 1;
        let cursor = this.containerMemberOf.get(String(nodeId));
        let guard = 0;
        while (cursor && guard++ < 32) {
            level++;
            cursor = this.containerMemberOf.get(cursor);
        }
        return level;
    }

    /**
     * @private 与看不见的节点相连的连线一起隐藏（否则线会指向空处）
     *
     * @param {Set<string>} hidden - 被收起的节点 id
     * @returns {void}
     */
    _toggleHiddenConnections(hidden) {
        if (!this.connectionManager) return;
        this.connectionManager.connections.forEach((conn) => {
            if (!conn) return;
            const involved = hidden.has(String(conn.fromNodeId)) || hidden.has(String(conn.toNodeId));
            const el = document.getElementById(conn.id);
            if (el) el.classList.toggle('connection-hidden', involved);
        });
    }

    /**
     * 给复合宿主加一个「转发端口」：把内部节点的某个端口暴露到宿主上（可增可删）。
     *
     * 端口是真的 PortProp：折叠态只留它在属性区（`.prop-forward`），展开态与普通属性一起显示。
     * ⚠️ 目前只做「按需显示 / 增删 / 快照」；外部连线与内部端口的自动镜像（透传）留待下一步。
     *
     * @param {any} hostId - 宿主节点 id
     * @param {{ side?: 'input'|'output'; name?: string; label?: string; innerUid?: string; innerPortKey?: string }} [spec]
     * @returns {{ key: string; label: string; side: string; innerUid: string; innerPortKey: string } | null} 转发端口记录
     */
    addForwardPort(hostId, spec = {}) {
        const host = this.nodeManager.nodes.get(String(hostId));
        const record = this.containerNodes.get(String(hostId));
        if (!host || !record || !this.nodeManager.nodeViews) return null;

        const side = spec.side === 'output' ? 'output' : 'input';
        const name = String(spec.name || spec.innerPortKey || 'forward');
        const key = `${side}:${name}`;
        const exist = record.forwardPorts.find((item) => item.key === key);
        if (exist) return exist;

        const hub = side === 'input' ? host.inputs : host.outputs;
        if (!hub || typeof hub.addProp !== 'function') return null;

        const index = record.forwardPorts.length;
        const portId = `${host.id}:forward_port-${index}`;
        const prop = new PortProp(
            `${host.id}:forward-${index}`,
            spec.label || name,
            'port',
            '',
            {
                name,
                forward: true,
                layout: side === 'input' ? PortProp.layoutTypes.noRight : PortProp.layoutTypes.noLeft,
                ...(side === 'input'
                    ? { inputPort: { id: portId, dataType: 'any', maxLinks: Infinity } }
                    : { outputPort: { id: portId, dataType: 'any', maxLinks: Infinity } }),
            }
        );
        prop.parentNode = new WeakRef(host);
        hub.addProp(prop);

        const entry = {
            key,
            label: spec.label || name,
            side,
            innerUid: spec.innerUid || '',
            innerPortKey: spec.innerPortKey || '',
        };
        record.forwardPorts.push(entry);

        // 端口是新加的：重建宿主视图，再按当前折叠态重新应用显示
        const view = this.nodeManager.nodeViews.get(String(hostId));
        if (view && typeof view.redraw === 'function') view.redraw();
        this._applyContainerCollapsed(String(hostId), record.collapsed);
        this.saveContainers();
        return entry;
    }

    /**
     * 删掉一个转发端口（连同它承载的连线）
     *
     * @param {any} hostId - 宿主节点 id
     * @param {string} key - 转发端口 key（`<side>:<名字>`）
     * @returns {boolean} 是否删掉
     */
    removeForwardPort(hostId, key) {
        const host = this.nodeManager.nodes.get(String(hostId));
        const record = this.containerNodes.get(String(hostId));
        if (!host || !record) return false;
        const index = record.forwardPorts.findIndex((item) => item.key === key);
        if (index < 0) return false;

        const entry = record.forwardPorts[index];
        const target = (host.detailProperties || []).find((p) => p && p.forward && String(p.name) === String(entry.key.slice(entry.key.indexOf(':') + 1)));
        if (target) {
            const port = target.inputPort || target.outputPort;
            if (port && port.links && port.links.length && this.connectionManager) {
                // 断掉该端口上的线（ConnectionManager 监听端口断开事件自己清理索引）
                [...port.links].forEach((peer) => port.remove(peer));
            }
            if (host.inputs) host.inputs.extractProp(target.id);
            if (host.outputs) host.outputs.extractProp(target.id);
        }

        record.forwardPorts.splice(index, 1);
        const view = this.nodeManager.nodeViews.get(String(hostId));
        if (view && typeof view.redraw === 'function') view.redraw();
        this._applyContainerCollapsed(String(hostId), record.collapsed);
        this.saveContainers();
        return true;
    }

    /**
     * 某个宿主的转发端口列表
     *
     * @param {any} hostId - 宿主节点 id
     * @returns {any[]} 转发端口记录
     */
    listForwardPorts(hostId) {
        const record = this.containerNodes.get(String(hostId));
        return record ? [...record.forwardPorts] : [];
    }

    /**
     * 把容器的成员、收起态、背景框尺寸与转发端口存进 localStorage
     *
     * 键独立于页面快照（`nodeEditor.pages`）：它只是视图状态，丢了也不影响数据。
     *
     * @returns {boolean} 是否写入成功
     */
    saveContainers() {
        if (typeof localStorage === 'undefined') return false;
        try {
            const data = Array.from(this.containerNodes.entries()).map(([containerId, record]) => ({
                containerId,
                members: record.members,
                collapsed: Boolean(record.collapsed),
                rect: record.rect || null,
                forwardPorts: record.forwardPorts,
            }));
            localStorage.setItem(CONTAINERS_STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (error) {
            console.warn('[容器节点] 写入 localStorage 失败:', error);
            return false;
        }
    }

    /**
     * 从 localStorage 恢复容器（页面快照恢复出节点之后调）
     *
     * 容器节点与成员都是页面快照里的普通节点，这里只把「谁属于谁」的记账接回去；
     * 找不到的条目直接忽略（数据没加载 / 节点被删）。
     *
     * @returns {number} 恢复的容器数
     */
    restoreContainers() {
        if (typeof localStorage === 'undefined') return 0;
        let list = [];
        try {
            const raw = localStorage.getItem(CONTAINERS_STORAGE_KEY);
            list = raw ? JSON.parse(raw) : [];
        } catch {
            return 0;
        }
        if (!Array.isArray(list)) return 0;

        let count = 0;
        list.forEach((item) => {
            if (!item || item.containerId == null) return;
            const key = String(item.containerId);
            if (!this.nodeManager.nodes.has(key)) return; // 容器本身不在画布上→忽略
            const members = (item.members || []).map((id) => String(id)).filter((id) => this.nodeManager.nodes.has(id));
            if (!members.length) return;

            const record = this.containerNodes.get(key) || {
                members: [],
                collapsed: item.collapsed !== false,
                rect: item.rect || null,
                forwardPorts: [],
                passthroughHubs: [],
                passthrough: [],
            };
            record.members = members;
            record.collapsed = item.collapsed !== false;
            if (item.rect) record.rect = item.rect;
            this.containerNodes.set(key, record);
            members.forEach((id) => this.containerMemberOf.set(id, key));
            (item.forwardPorts || []).forEach((port) => {
                this.addForwardPort(key, {
                    side: port.side,
                    name: port.key ? port.key.slice(port.key.indexOf(':') + 1) : port.label,
                    label: port.label,
                    innerUid: port.innerUid,
                    innerPortKey: port.innerPortKey,
                });
            });
            this._refreshContainerViews(key);
            count++;
        });
        this._refreshContainerVisibility();
        return count;
    }

    /**
     * @private 在当前画布上按**契约 uid** 找节点（子节点记的 `inline.hostUid` 就是它）
     *
     * @param {string} uid - 契约 uid（如 `test-ns:recipes:r1`）
     * @returns {any|null} 节点模型
     */
    _findCanvasNodeByUid(uid) {
        const want = String(uid);
        /** @type {any|null} */
        let hit = null;
        this.nodes.forEach((model) => {
            if (hit || !model) return;
            const entry = model.dataId ? entryOf(model.type, model.dataId) : null;
            if (entry && entry.uid && String(entry.uid) === want) hit = model;
        });
        return hit;
    }

    /**
     * @private 建一个列表 / 字典变量节点并把它接回宿主字段端口
     *
     * 连线方向按宿主端口的实际方向定：宿主是 output → 变量节点用 input，反之用 output
     * （模板端口方向可能与 mapping 声明不一致，所以不看声明）。
     *
     * @param {any} hostModel - 宿主节点
     * @param {{ name: string; kind: 'table'|'list'; rows: any[]; columns: any[] }} field - 待解析字段
     * @param {number} index - 同类字段序号（纵向排开）
     * @param {any} hostPort - 宿主字段端口（PortModel）
     * @returns {{ model: any; linked: boolean } | null}
     */
    _createToolNode(hostModel, field, index, hostPort) {
        const hostW = hostModel.width || 300;
        const x = (hostModel.x || 0) + hostW + 140;
        const y = (hostModel.y || 0) + index * 220;

        const model = this.nodeManager.addToolNode(field.kind, {
            title: field.name,
            label: field.name,
            rows: field.rows,
            columns: field.columns,
            x,
            y,
        });
        if (!model) return null;

        let linked = false;
        // 入/出端口分别在两个属性上（模板里各一条），要各自找，不能只取第一条
        const props = model.detailProperties || [];
        const toolInput = props.map((p) => p && p.inputPort).find(Boolean) || null;
        const toolOutput = props.map((p) => p && p.outputPort).find(Boolean) || null;
        if (this.connectionManager) {
            const hostIsOutput = hostPort.direction === 'output';
            const toolPort = hostIsOutput ? toolInput : toolOutput;
            if (toolPort) {
                try {
                    linked = Boolean(
                        hostIsOutput
                            ? this.connectionManager.createProgrammaticConnection(hostModel, hostPort, model, toolPort)
                            : this.connectionManager.createProgrammaticConnection(model, toolPort, hostModel, hostPort)
                    );
                } catch (error) {
                    console.error('[额外解析] 连线失败:', error);
                }
            }
        }

        return { model, linked };
    }

    /**
     * @private 建一个悬空端口节点并把它接回画布上的引用方
     *
     * @param {{ key: string; targetId: string; category: string; status: string }} item - 合并后的文件外目标
     * @param {any[]} refs - 引用它的宿主字段（已过滤到「画布上存在」）
     * @param {Map<string, any>} byUid - 画布上的宿主：uid → 节点模型
     * @returns {{ model: any; linked: number } | null}
     */
    _createDanglingPort(item, refs, byUid) {
        const host = byUid.get(String(refs[0].uid));
        if (!host) return null;
        const hostW = host.width || 300;

        const model = this.nodeManager.addToolNode('danglingPort', {
            title: item.targetId,
            x: (host.x || 0) + hostW + 140,
            y: (host.y || 0) + 60,
            properties: [], // 只有端口，别的什么都不给（跳转与明细在视图层）
        });
        if (!model) return null;

        // 挂上引用明细：视图做 hover 提示（节点已建好，明细是后补的 → 让它重算一次），跳转也读它
        model.danglingRefs = refs;
        model.danglingStatus = item.status;
        model.danglingCategory = item.category || '';
        const danglingView = this.nodeManager.nodeViews.get(String(model.id));
        if (danglingView && typeof danglingView.refreshDanglingTooltip === 'function') {
            danglingView.refreshDanglingTooltip();
        }

        const modelProps = model.detailProperties || [];
        const portIn = modelProps.map((p) => p && p.inputPort).find(Boolean) || null;
        const portOut = modelProps.map((p) => p && p.outputPort).find(Boolean) || null;

        let linked = 0;
        refs.forEach((ref) => {
            const hostModel = byUid.get(String(ref.uid));
            const hostPort = hostModel ? findFieldPort(hostModel, ref.field) : null;
            if (!hostPort || !this.connectionManager) return;
            const hostIsOutput = hostPort.direction === 'output';
            const toolPort = hostIsOutput ? portIn : portOut;
            if (!toolPort) return;
            try {
                const ok = hostIsOutput
                    ? this.connectionManager.createProgrammaticConnection(hostModel, hostPort, model, toolPort)
                    : this.connectionManager.createProgrammaticConnection(model, toolPort, hostModel, hostPort);
                if (ok) linked++;
            } catch (error) {
                console.error('[悬空端口] 连线失败:', error);
            }
        });

        return { model, linked };
    }

    /**
     * 悬空端口跳转：在前端数据里定位目标并跳过去（"双击悬空端口"的入口）。
     *
     * 三种落点：
     *   1. 目标已在当前画布 → 选中并聚焦（居中）；
     *   2. 已加载、但没铺到画布 → 就地在当前页铺出来并聚焦；
     *   3. 没命中 → **三态排查**：
     *      ① `not-loaded` 还没加载 mod（或 mod 未完全加载）—— 前端拿不到「未加载文件清单」，
     *         以「是否加载过 mod」近似；后端服务层就绪后改用它的文件清单；
     *      ② `missing`  引用不存在（已加载的全部数据里都没这个 id）；
     *      ③ `inconsistent` 定位到了文件却取不到条目 / 建不出节点（前端数据不一致，明细进 console）。
     *
     * @param {string} category - 目标类别（如 elements）
     * @param {string} targetId - 目标 id
     * @returns {{ ok: boolean; reason: 'canvas'|'laid'|'not-loaded'|'missing'|'inconsistent'; message: string; nodeId?: any }}
     */
    jumpToTarget(category, targetId) {
        const cat = String(category == null ? '' : category);
        const want = String(targetId == null ? '' : targetId);
        if (!want) {
            const message = '悬空端口没有目标 id，无法跳转';
            this._notify(message);
            return { ok: false, reason: 'inconsistent', message };
        }

        const where = locate(cat, want);
        if (!where) {
            // 情况①/②：分不出「未加载」与「不存在」时，以「有没有加载过 mod」近似，并给出可操作提示
            const hasMod = Object.values(ModDataRegistry.sources).some((s) => s && s.source === 'mod');
            const reason = hasMod ? 'missing' : 'not-loaded';
            const message = hasMod
                ? `引用不存在：${cat}:${want}（若它属于未加载的文件，重新加载 mod 后可见）`
                : `mod 还未加载完整，定位不到 ${cat}:${want}（请先加载 mod）`;
            this._notify(message);
            return { ok: false, reason, message };
        }

        // 情况 1：已在当前画布
        const existing = this._findCanvasNodeByData(cat, want);
        if (existing) {
            this.focusNode(existing.id);
            const message = `已定位到 ${cat}:${want}（当前页面）`;
            this._notify(message);
            return { ok: true, reason: 'canvas', nodeId: existing.id, message };
        }

        // 情况 2：已加载但没铺图 → 就地在当前页铺出来
        const entry = entryOf(cat, want);
        if (!entry) {
            const message = `前端数据不一致：${cat}:${want} 定位到 ${where.file || where.namespace}，但取不到条目`;
            console.error('[跳转] 数据不一致:', { category: cat, targetId: want, where });
            this._notify(message);
            return { ok: false, reason: 'inconsistent', message };
        }

        const { x, y } = this.ViewCenter;
        const model = this.nodeManager.addNodeFromData(cat, entry, x, y);
        if (!model) {
            const message = `前端数据不一致：${cat}:${want} 取到了条目，但建不出节点`;
            console.error('[跳转] 建节点失败:', { category: cat, targetId: want, where, entry });
            this._notify(message);
            return { ok: false, reason: 'inconsistent', message };
        }

        this.focusNode(model.id);
        const message = `已铺出目标 ${cat}:${want}（来自 ${where.file || where.namespace}）`;
        this._notify(message);
        return { ok: true, reason: 'laid', nodeId: model.id, message };
    }

    /**
     * @private 在当前画布上按「类别 + 数据 id」找节点模型
     *
     * @param {string} category - 类别
     * @param {string} id - 数据条目 id
     * @returns {any|null} 节点模型
     */
    _findCanvasNodeByData(category, id) {
        const want = String(id);
        /** @type {any|null} */
        let hit = null;
        this.nodes.forEach((model) => {
            if (hit || !model) return;
            if (String(model.type) !== String(category)) return;
            const dataId = model.dataId == null ? '' : String(model.dataId);
            if (dataId === want) hit = model;
        });
        return hit;
    }

    /**
     * @private 把一条提示发给宿主（`index.js` 监听 `status:message` 后写状态栏）
     *
     * @param {string} text - 提示文案
     */
    _notify(text) {
        if (!text) return;
        this.bus.emit('status:message', { text });
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
            // 连接线两端由后端变换好：from = 出线端（output 侧）、to = 入线端（input 侧），
            // 前端不做方向推断。端口优先按后端给的 key 找（`output:<字段名>` / `input:<字段名>`），
            // key 是通用 'link'（该侧没有对应字段端口）时退回「第一个输出 / 输入端口」。
            const fromPort = this._portByKey(fromModel, link.from.port, 'output') || this._findOutputPort(fromModel);
            const toPort = this._portByKey(toModel, link.to.port, 'input') || this._findInputPort(toModel);
            if (!fromPort || !toPort) return;
            // 通过 ConnectionManager 程序化创建（模型连线 + 注册 + 生成 SVG 连接线）
            const created = this.connectionManager.createProgrammaticConnection(fromModel, fromPort, toModel, toPort);
            if (created) connected++;
        });
        return connected;
    }

    /**
     * 按后端给的端口 key 在节点上找端口
     *
     * key 形状 `<side>:<字段名>`（如 `input:actionId`、`output:effects`；字段名就是数据里的真实字段名）。
     * 大小写不敏感（模板写 actionId，数据里可能是 actionid）；通用 key（如 `link`）返回 null，
     * 交给调用方退回「第一个该方向的端口」。
     *
     * @private
     * @param {any} model - 节点模型
     * @param {string} key - 后端给的端口 key
     * @param {'input'|'output'} side - 该端方向
     * @returns {any|null} PortModel
     */
    _portByKey(model, key, side) {
        const raw = String(key || '');
        if (!raw.includes(':')) return null;
        const wanted = raw.slice(raw.indexOf(':') + 1).toLowerCase();
        if (!wanted) return null;
        const prop = (model.detailProperties || []).find(
            (p) => p && String(p.name || '').toLowerCase() === wanted && (side === 'input' ? p.inputPort : p.outputPort)
        );
        if (!prop) return null;
        return side === 'input' ? prop.inputPort : prop.outputPort;
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
     * 整理布局：按引用方向铺行（左入右出）——节点按引用顺序从左到右排，每行最多
     * `layoutRowLimit` 个（默认 24，可在设置里改），铺满才换行；换行点会避开多分支处。
     *
     * 行内每条线都从输出的右边指向输入的左边，不会指向左；辅助节点（长文本外化出的文本变量等）
     * 不占行内位置：只服务一个宿主的排到宿主左侧的辅助列，服务多个宿主的收在行带上方左侧。
     * 无任何连线的节点不参与铺行，按网格排在主图下方。
     *
     * @param {{ fit?: boolean | 'all', gapX?: number, rowGap?: number, rowLimit?: number }} [opts] -
     *   fit：默认「可读缩放」展示（大图不压成看不清的一团）；'all' = 整图压进视口（同「适应视图」）；false = 不动视图
     * @returns {{ count: number, rows: number, columns: number }} 移动的节点数、行数、最宽行节点数
     */
    organizeLayout(opts = {}) {
        const nodes = this.nodes;
        if (!nodes.length) return { count: 0, rows: 0, columns: 0 };

        // 容器成员不单独参与铺行：容器（背景框）当一个整体，成员随后跟着它整体平移
        const memberIds = new Set(this.containerMemberOf.keys());
        const items = nodes
            .filter((node) => !memberIds.has(String(node.id)))
            .map((node) => ({
                id: String(node.id),
                width: node.width || 300,
                height: node.height || 240,
                // 文本变量节点是辅助节点：不占行内位置，贴到宿主旁边
                aux: node.type === 'text',
            }));
        /** @type {Array<{ from: string, to: string }>} */
        const edges = [];
        this.connectionManager.connections.forEach((conn) => {
            if (!conn) return;
            const fromId = String(conn.fromNodeId);
            const toId = String(conn.toNodeId);
            // 连线两端不一定等于数据流向：辅助节点（文本/表格）是「宿主的输入端口 ← 它的输出端口」，
            // 模型里 from 反而是宿主。这里一律按端口方向定方向：输出侧 → 输入侧。
            const reversed = conn.startPort && conn.startPort.direction === 'input';
            if (reversed) edges.push({ from: toId, to: fromId });
            else edges.push({ from: fromId, to: toId });
        });

        const layout = computeFlowLayout(items, edges, {
            rowLimit: opts.rowLimit ?? this.setting.layoutRowLimit,
            gapX: opts.gapX,
            rowGap: opts.rowGap,
        });
        // 先在原点附近算好相对坐标，再整体平移到视野中心：避免按未知的整体尺寸反复试算
        const { x: cx, y: cy } = this.ViewCenter;
        const dx = cx - (layout.bounds.minX + layout.bounds.maxX) / 2;
        const dy = cy - (layout.bounds.minY + layout.bounds.maxY) / 2;

        let count = 0;
        nodes.forEach((node) => {
            const pos = layout.positions.get(String(node.id));
            if (!pos) return;
            const nextX = Math.round(pos.x + dx);
            const nextY = Math.round(pos.y + dy);
            const shiftX = nextX - (node.x || 0);
            const shiftY = nextY - (node.y || 0);
            node.setPosition(nextX, nextY);
            count++;

            // 容器整个搬：成员跟着平移同样的位移（保持框内相对位置）
            const record = this.containerNodes.get(String(node.id));
            if (!record) return;
            record.members.forEach((memberId) => {
                const member = this.nodeManager.nodes.get(String(memberId));
                if (member) member.moveBy(shiftX, shiftY);
            });
        });
        // 后端拆出来的内联子节点：排到宿主旁边（同一区域），免得铺完行被拆散
        const grouped = this._layoutInlineChildrenTogether();
        // 容器：按成员位置重新确认框装得下（只长不缩）
        Array.from(this.containerNodes.keys()).forEach((id) => this._fitContainerToMembers(id));
        // 节点位置已生效（DOM left/top 同步更新），统一重算连接线端点
        this.connectionManager.refreshAllConnections();

        // 视图：默认「可读缩放」展示（大图不压成看不清的一团），'all' 才整图压进视口
        if (opts.fit !== false) {
            if (opts.fit === 'all') {
                this.canvasManager.fitView();
            } else {
                this.canvasManager.revealBounds({
                    minX: layout.bounds.minX + dx,
                    minY: layout.bounds.minY + dy,
                    maxX: layout.bounds.maxX + dx,
                    maxY: layout.bounds.maxY + dy,
                });
            }
        }

        return { count, rows: layout.rows, columns: layout.columns, grouped };
    }

    /**
     * @private 把「后端内联子节点」排到它们的宿主旁边
     *
     * 设置没开自动合并时，宿主与子节点是各自独立的节点，铺行会把它们拆到天南海北。
     * 这里做一次后处理：把同一宿主的子节点按网格排在宿主**右侧**，
     * 撞到别的节点就整体往下让，直到空出来。
     *
     * @returns {number} 挪了几个子节点
     */
    _layoutInlineChildrenTogether() {
        /** @type {Map<string, any[]>} */
        const groups = new Map();
        this.nodes.forEach((model) => {
            const inline = model && model.inline;
            if (!inline || !inline.hostUid) return;
            const host = this._findCanvasNodeByUid(inline.hostUid);
            if (!host || host === model) return;
            const key = String(host.id);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(model);
        });
        if (!groups.size) return 0;

        const others = this.nodes.filter((model) => {
            const inline = model && model.inline;
            return !inline || !inline.hostUid;
        });
        const gap = 40;
        let moved = 0;

        groups.forEach((children, hostId) => {
            const host = this.nodeManager.nodes.get(hostId);
            if (!host) return;

            const cellW = Math.max(...children.map((child) => child.width || 300));
            const cellH = Math.max(...children.map((child) => child.height || 200));
            const columns = Math.max(1, Math.min(children.length, Math.ceil(Math.sqrt(children.length)) + 1));
            const rows = Math.ceil(children.length / columns);
            const blockW = columns * cellW + (columns - 1) * gap;
            const blockH = rows * cellH + (rows - 1) * gap;
            const baseX = (host.x || 0) + (host.width || 300) + gap;
            let baseY = host.y || 0;

            // 碰住别人就往下让（最多试 40 次，实在不行就留在原地）
            const collides = (x, y) =>
                others.some((other) => {
                    const ox = other.x || 0;
                    const oy = other.y || 0;
                    const ow = other.width || 300;
                    const oh = other.height || 200;
                    return x < ox + ow + gap && x + blockW + gap > ox && y < oy + oh + gap && y + blockH + gap > oy;
                });

            let attempt = 0;
            while (collides(baseX, baseY) && attempt++ < 40) baseY += Math.round(blockH / rows) + gap;

            children.forEach((child, index) => {
                const column = index % columns;
                const row = Math.floor(index / columns);
                child.setPosition(Math.round(baseX + column * (cellW + gap)), Math.round(baseY + row * (cellH + gap)));
                moved++;
            });
        });
        return moved;
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
        this.variableNodes.clear(); // 变量节点已被 nodeManager.clear() 一并删掉，记账同步清空
        this.danglingPorts.clear();
        this.containerNodes.clear();
        this.containerMemberOf.clear();
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
        if (this._findNodeHandler) {
            this.bus.off('findNode', this._findNodeHandler);
            this._findNodeHandler = null;
        }
        // 画布右键菜单挂在 viewport 上（MenuManager 自己的监听随 IManager.destroy 释放）
        if (this._canvasContextMenuHandler && this.viewport) {
            this.viewport.removeEventListener('contextmenu', this._canvasContextMenuHandler);
        }

        // 注意：UIManager 不是 IManager 子类，没有 destroy()，需做能力判断
        // pageManager 放最后：销毁时会释放非激活页的节点，此时各管理器已清空自己的索引
        [
            this.historyManager,
            this.nodeManager,
            this.canvasManager,
            this.uiManager,
            this.nodeActionManager,
            this.connectionManager,
            this.menuManager,
            this.panelManager,
            this.pageManager,
        ].forEach((m) => {
            if (m && 'destroy' in m && typeof m.destroy === 'function') {
                m.destroy();
            }
        });
    }
}

/**
 * 按字段名找节点上的端口（忽略方向，大小写不敏感）
 *
 * 模板端口方向可能与 mapping 声明不一致（如 `effects` 声明 output、模板却建成 input 端口），
 * 所以这里只认名字；连线方向由调用方按端口实际的 `direction` 决定。
 *
 * @param {any} model - 节点模型
 * @param {string} name - 字段名
 * @returns {any|null} PortModel
 */
function findFieldPort(model, name) {
    const wanted = String(name || '').toLowerCase();
    if (!wanted) return null;
    const prop = (model.detailProperties || []).find((p) => p && String(p.name || '').toLowerCase() === wanted);
    if (!prop) return null;
    return prop.inputPort || prop.outputPort || null;
}
