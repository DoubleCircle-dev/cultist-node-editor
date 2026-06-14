import { IEventTarget } from '../../types/IEventTarget.js';

export class PanelModel extends IEventTarget {
    /**
     * @param {string} id - 面板唯一标识 (如 'addNodes', 'openFile')
     * @param {'expand' | 'bottom'} type - 面板所处的物理区域
     * @param {string} title - 面板标题
     * @param {Object} [options] - 可选的交互配置
     * @param {boolean} [options.hasSearch=false] - 是否拥有搜索栏. Default is `false`
     * @param {'none' | 'list' | 'tree' | 'help' | 'shortcuts'} [options.dataType='none'] - 面板持有的数据结构类型. Default is `'none'`
     * @param {string} [options.icon=''] - 面板图标
     */
    constructor(id, type,title, options = {}) {
        super();
        this.id = id;
        this.type = type; // 'expand' 或 'bottom'
        this.title = title || '';

        this.icon = options.icon || '📦';

        // 核心配置项（通过配置实现“可选”）
        this.hasSearch = options.hasSearch || false;
        this.dataType = options.dataType || 'none'; // 'none' | 'list' | 'tree'

        // 搜索关键字（仅在 hasSearch 为 true 时有意义）
        /** @private */
        this._searchQuery = '';

        // 面板核心业务数据（可以是 List 数组，也可以是 Tree 对象）
        /**
         *  @private
         * @type {any}
         */
        this._rawData = null;

        // 数据行为绑定（如点击节点、点击文件等）
        /**
         * @type {Map<string, Function>}
         */
        this.dataActionHandlers = new Map();
        
    }

    // ==========================================
    // 通用 Getters
    // ==========================================

    get searchQuery() {
        return this._searchQuery;
    }
    get rawData() {
        return this._rawData;
    }

    set rawData(data) {
        this._rawData = data;
    }

    // ==========================================
    // 通用 Actions (修改状态并向外派发局部事件)
    // ==========================================

    /** 设置搜索词 */
    setSearchQuery(query) {
        if (!this.hasSearch) return;
        const trimmed = query.trim();
        if (this._searchQuery === trimmed) return;
        this._searchQuery = trimmed;
        this.emit('search:changed', { query: trimmed });
    }

    /** 统一设置数据源 */
    setData(data) {
        this._rawData = data;
        this.emit('data:changed', { data, dataType: this.dataType });
    }

    /**
     * 绑定数据点击处理函数
     * @param {string} action - 数据行为标识 (如 'click-node-item', 'click-file-item')
     * @param {Function} handler - 处理函数，接收 { action, data } 作为参数
     */
    bindDataAction(action, handler) {
        if (typeof handler !== 'function') {
            console.warn(`bindDataAction: handler must be a function for action "${action}"`);
            return;
        }
        this.emit('data:action:bind', { action, handler });
    }
}
