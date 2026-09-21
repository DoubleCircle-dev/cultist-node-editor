/**
 * ui/scripts/modDataRegistry.js —— 数据池注册表
 *
 * 负责持有从后端加载的 mod / origin 数据（按类别组织），供「基础类型」实例化节点时选择。
 * 注意：**节点类型始终是基础类型**（recipes/elements/...），这里只存"数据实例"，
 * 不注册任何动态类型。每条数据带 `source`（'origin' | 'mod'）：
 *   - origin：模板未覆盖的多余字段 → 实例化时新增 custom prop 显示文本；
 *   - mod   ：不允许建立多余词条（多余字段忽略，严格按模板）。
 */

export class ModDataRegistry {
    /** 类别 → 数据条目列表（合并所有数据源，每条含 source/namespace） */
    static categories = {};

    /** 命名空间 → 源信息（用于卸载/统计） */
    static sources = {};

    /**
     * 命名空间 → 本次加载进来的文件清单（`node.file`）
     *
     * 悬空端口跳转时用来区分「未进行完全的 mod 加载」（该 id 在别的文件里）
     * 与「引用不存在」（任何已加载数据里都没有）。
     *
     * @type {Record<string, Set<string>>}
     */
    static files = {};

    /**
     * `${category}:${id}` → `{ namespace, source, file }`（跨数据源定位）
     *
     * 同一个 id 可能在多个来源里出现（origin 与 mod 各一份），后注册的覆盖先注册的：
     * 跳转优先去「最近加载」的那一份。
     *
     * @type {Map<string, { namespace: string, source: string, file: string }>}
     */
    static index = new Map();

    /**
     * 命名空间 → 文件外节点（契约 `external` 合并后）
     *
     * 悬空端口节点按它建：只建「画布上宿主存在」的那些引用。
     *
     * @type {Record<string, any[]>}
     */
    static externals = {};

    /** 位置索引的键（类别 + 条目 id） */
    static keyOf(category, id) {
        return `${category == null ? '' : category}:${id == null ? '' : id}`;
    }

    /**
     * 注册一批数据（合并进 categories）
     *
     * @param {{ namespace: string, source: string, categories: Record<string, Array<any>> }} data
     * @returns {number} 本次注册的条目总数
     */
    static register(data) {
        if (!data || !data.categories || typeof data.categories !== 'object') return 0;
        const { namespace, source = 'mod', categories } = data;
        let count = 0;

        Object.entries(categories).forEach(([category, list]) => {
            if (!Array.isArray(list)) return;
            const arr = (this.categories[category] = this.categories[category] || []);
            list.forEach((entry) => {
                if (!entry) return;
                const file = entry.file == null ? '' : String(entry.file);
                arr.push({ ...entry, namespace, source: entry.source || source });
                // 位置索引 + 文件清单（供悬空端口跳转 / 「未完全加载」判定）
                if (entry.id != null && entry.id !== '') {
                    this.index.set(this.keyOf(category, entry.id), { namespace, source: entry.source || source, file });
                }
                if (file) {
                    if (!this.files[namespace]) this.files[namespace] = new Set();
                    this.files[namespace].add(file);
                }
                count++;
            });
        });

        this.sources[namespace] = { source, count };
        if (Array.isArray(data.externals)) this.externals[namespace] = data.externals;
        return count;
    }

    /**
     * 卸载某命名空间下的全部数据
     *
     * @param {string} namespace
     * @returns {number} 卸载条目数
     */
    static unregister(namespace) {
        let removed = 0;
        Object.keys(this.categories).forEach((category) => {
            const arr = this.categories[category];
            const kept = arr.filter((e) => e.namespace !== namespace);
            removed += arr.length - kept.length;
            this.categories[category] = kept;
            if (kept.length === 0) delete this.categories[category];
        });
        // 位置索引：只删属于该命名空间的项（同 id 可能被其它来源接管）
        this.index.forEach((info, key) => {
            if (info.namespace === namespace) this.index.delete(key);
        });
        delete this.files[namespace];
        delete this.externals[namespace];
        delete this.sources[namespace];
        return removed;
    }

    /**
     * 全部命名空间的文件外节点，按 key 合并（同一目标被多个来源引用时合成一条，`refs` 相加）
     *
     * @returns {any[]} 合并后的文件外节点列表
     */
    static allExternals() {
        /** @type {Map<string, any>} */
        const byKey = new Map();
        Object.values(this.externals).forEach((list) => {
            (list || []).forEach((item) => {
                if (!item || !item.key) return;
                const exist = byKey.get(item.key);
                if (exist) {
                    exist.refs.push(...(item.refs || []));
                    return;
                }
                byKey.set(item.key, { ...item, refs: [...(item.refs || [])] });
            });
        });
        return Array.from(byKey.values());
    }

    /**
     * 按类别 + id 在前端数据里定位条目（悬空端口跳转 / 三态排查用）
     *
     * @param {string} category - 类别（节点类型）
     * @param {string} id - 条目 id
     * @returns {{ namespace: string, source: string, file: string } | null} 位置信息
     */
    static locate(category, id) {
        return this.index.get(this.keyOf(category, id)) || null;
    }

    /**
     * 某命名空间本次已加载的文件清单
     *
     * @param {string} namespace - 命名空间
     * @returns {string[]} 文件相对路径列表
     */
    static filesOf(namespace) {
        const set = this.files[namespace];
        return set ? Array.from(set) : [];
    }

    /**
     * 获取某类别的数据条目列表
     *
     * @param {string} category - 基础类型名（recipes/elements/...）
     * @returns {Array<any>}
     */
    static getEntries(category) {
        return this.categories[category] || [];
    }
    /**
     * 按类别 + id 取条目本体（id 比对统一按字符串，避免数字/字符串两种写法）
     *
     * @param {string} category - 基础类型名
     * @param {string | number} id - 条目 id
     * @returns {any | null} 数据条目
     */
    static findEntry(category, id) {
        if (id == null || id === '') return null;
        const wanted = String(id);
        const list = this.categories[category] || [];
        return list.find((entry) => entry && entry.id != null && String(entry.id) === wanted) || null;
    }
    /** 某类别是否已有数据源 */
    static hasEntries(category) {
        return (this.categories[category] || []).length > 0;
    }

    /**
     * 获取某命名空间下的全部数据条目（跨类别，供「加载后自动铺图」使用）
     *
     * @param {string} namespace
     * @returns {Array<any>}
     */
    static getEntriesByNamespace(namespace) {
        const list = [];
        Object.entries(this.categories).forEach(([category, entries]) => {
            entries.forEach((e) => {
                if (e && e.namespace === namespace) list.push(e);
            });
        });
        return list;
    }

    /** 已注册数据源的类别概览（供面板/状态提示） */
    static get categoriesList() {
        return Object.entries(this.categories).map(([category, list]) => ({
            category,
            count: list.length,
        }));
    }
}
