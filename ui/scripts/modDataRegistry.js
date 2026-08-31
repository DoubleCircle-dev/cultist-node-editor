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
                arr.push({ ...entry, namespace, source: entry.source || source });
                count++;
            });
        });

        this.sources[namespace] = { source, count };
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
        delete this.sources[namespace];
        return removed;
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
