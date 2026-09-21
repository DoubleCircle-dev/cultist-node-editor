/**
 * frontend/src/models/pageModels/pageModel.js —— 页面（工作区选项卡）模型
 *
 * 一个编辑器窗口显示一个 mod，tab 栏里的每个页面是**一块独立的画布工作区**：
 * 各自持有自己的节点、连线、视图（平移/缩放）与交互模式。页面的生命周期由
 * `PageManager` 驱动（见 frontend/src/controllers/pageManager.js），本类只保存状态：
 *
 * - `nodeState` / `connectionState`：节点管理器与连接管理器的**索引状态**。
 *   页面处于激活态时，它们就是管理器正在使用的那批 Map（同一引用，计数实时）；
 *   切走后索引被摘到这个字段上，节点与连线对象本身不销毁。
 * - `parking`：非激活页的 DOM 停放容器（`display:none`）。节点元素与连接线 DOM 都停在里面，
 *   切回时再搬回画布 —— 因此切换不需要重建节点，属性值、端口引用、监听器全部原样保留。
 * - `view` / `mode`：该页自己的平移缩放与交互模式，切换时各自记住。
 *
 * 快照（存文件 / 刷新后恢复）不在这里，见 `NodeManager.snapshotNodes` 与
 * `ConnectionManager.snapshotConnections`：那是「按值序列化」，与切换用的索引换手是两条路。
 */

export class PageModel {
    /**
     * @param {string} id - 页面 id（`page_1`、`page_2`…）
     * @param {string} name - 显示名（tab 上的文字）
     */
    constructor(id, name) {
        this.id = id;
        this.name = name;

        /** @type {{ nodes: Map<any, any>, nodeViews: Map<any, any>, listeners: Map<any, any>, highlightCache: any } | null} */
        this.nodeState = null;

        /** @type {{ connections: Map<any, any>, fromNodeIndex: Map<any, any>, toNodeIndex: Map<any, any>, connectionLines: Map<any, any>, syncBindings: Map<any, any> } | null} */
        this.connectionState = null;

        /** @type {HTMLElement | null} 非激活页的 DOM 停放容器 */
        this.parking = null;

        /** @type {{ x: number, y: number, scale: number }} 该页的画布平移与缩放 */
        this.view = { x: 0, y: 0, scale: 1 };

        /** @type {string} 该页最后使用的交互模式（select / drag / focus） */
        this.mode = 'select';
    }

    /** @returns {number} 本页节点数 */
    get nodeCount() {
        return this.nodeState ? this.nodeState.nodes.size : 0;
    }

    /** @returns {number} 本页连接数 */
    get connectionCount() {
        return this.connectionState ? this.connectionState.connections.size : 0;
    }

    /** @returns {boolean} 本页是否没有任何内容（关闭前提示用） */
    get isEmpty() {
        return this.nodeCount === 0 && this.connectionCount === 0;
    }

    /** @returns {string} 供状态栏 / 提示使用的一句话描述 */
    get summary() {
        return `${this.name}（${this.nodeCount} 个节点 / ${this.connectionCount} 条连线）`;
    }

    /** 页面元信息（不含画布内容，列表渲染与文件名用） */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            nodeCount: this.nodeCount,
            connectionCount: this.connectionCount,
            view: { ...this.view },
            mode: this.mode,
        };
    }
}
