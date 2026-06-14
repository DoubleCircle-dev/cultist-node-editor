import { PanelModel } from './panelModel.js';

export class ExpandPanelModel extends PanelModel {
    constructor(id,title, options = {}) {
        // 强行锁定 type 为 'expand'
        super(id, 'expand',title, options);

        // 如果是树形结构，利用 Set 记录被展开的节点/文件夹路径 (彻底消灭 DOM 状态残留)
        /** @private */
        this._expandedNodes = new Set();
    }

    get expandedNodes() {
        return this._expandedNodes;
    }

    /**
     * 切换树节点的展开/折叠状态（仅在 dataType === 'tree' 时有效）
     *
     * @param {string} nodePath 节点的唯一路径或ID
     */
    toggleNodeExpand(nodePath) {
        if (this.dataType !== 'tree') return;

        if (this._expandedNodes.has(nodePath)) {
            this._expandedNodes.delete(nodePath);
        } else {
            this._expandedNodes.add(nodePath);
        }

        // 通知 View 局部刷新树的节点形态
        this.emit('tree:nodeToggle', {
            nodePath,
            isExpanded: this._expandedNodes.has(nodePath),
        });
    }

    /** 清空所有展开的节点 */
    collapseAll() {
        this._expandedNodes.clear();
        this.emit('tree:collapsedAll', {});
    }

    // 可以在这里编写专属 Expand 面板的过滤算法（如树的前序遍历过滤）
    getFilteredData() {
        if (!this._searchQuery) return this._rawData;

        const query = this._searchQuery.toLowerCase();

        if (this.dataType === 'list') {
            return (this._rawData || []).filter((item) => {
                const searchStr = [
                    item.title,
                    item.label,
                    item.type,
                    String(item.id || ''),
                    item.description,
                    item.desc,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return searchStr.includes(query);
            });
        }

        if (this.dataType === 'tree') {
            const filtered = {};
            for (const [category, files] of Object.entries(this._rawData || {})) {
                if (!Array.isArray(files)) continue;
                const matchCategory = category.toLowerCase().includes(query);
                const matchFiles = files.filter(
                    (f) => typeof f === 'string' && f.toLowerCase().includes(query)
                );
                if (matchCategory || matchFiles.length > 0) {
                    filtered[category] = matchCategory ? files : matchFiles;
                }
            }
            return Object.keys(filtered).length > 0 ? filtered : null;
        }

        return this._rawData;
    }
}
