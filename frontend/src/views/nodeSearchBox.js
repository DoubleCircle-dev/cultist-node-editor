/**
 * frontend/src/views/nodeSearchBox.js —— 画布右上角的「搜索节点」快捷框
 *
 * 预览模式（customEditor 打开 json）没有侧边栏，「查找节点」面板用不了，这里给一个轻量入口：
 * 输入关键字即时过滤画布上的节点（匹配 **title / id / label**，大小写不敏感），
 * 点选（或回车）即定位到该节点。上下键选择、Esc 收起。
 *
 * 只负责界面与匹配；「定位」动作由外部注入（见 ControllerCore.focusNode）。
 */

/** 最多显示多少条结果 */
const MAX_RESULTS = 20;

export class NodeSearchBox {
    /**
     * @param {{
     *   getNodes: () => Array<any>,
     *   onPick: (node: any) => void,
     *   maxResults?: number,
     * }} options
     */
    constructor({ getNodes, onPick, maxResults = MAX_RESULTS }) {
        this.getNodes = getNodes;
        this.onPick = onPick;
        this.maxResults = maxResults;

        /** @private 当前结果列表（节点模型数组） */
        this._results = [];
        /** @private 当前高亮项下标 */
        this._active = 0;
        /** @private */
        this._outsideHandler = null;

        this._build();
    }

    /**
     * 把搜索框挂到指定容器（默认 body；用 fixed 定位，容器是谁都无所谓）
     *
     * @param {HTMLElement} [host]
     */
    mount(host) {
        const parent = host || document.body;
        parent.appendChild(this.element);
        this._outsideHandler = (e) => {
            if (!this.element.contains(/** @type {Node} */ (e.target))) this._closeResults();
        };
        document.addEventListener('mousedown', this._outsideHandler, true);
    }

    destroy() {
        if (this._outsideHandler) {
            document.removeEventListener('mousedown', this._outsideHandler, true);
            this._outsideHandler = null;
        }
        this.element?.remove();
    }

    /** @private */
    _build() {
        this.element = document.createElement('div');
        this.element.className = 'node-search';

        const row = document.createElement('div');
        row.className = 'node-search-row';

        const icon = document.createElement('span');
        icon.className = 'node-search-icon';
        icon.textContent = '🔍';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'node-search-input';
        this.input.placeholder = '搜索节点（title / id / label）';
        this.input.setAttribute('aria-label', '搜索节点');

        this.clearBtn = document.createElement('button');
        this.clearBtn.type = 'button';
        this.clearBtn.className = 'node-search-clear';
        this.clearBtn.title = '清空';
        this.clearBtn.textContent = '⌫';

        row.append(icon, this.input, this.clearBtn);

        this.resultsEl = document.createElement('div');
        this.resultsEl.className = 'node-search-results hidden';

        this.element.append(row, this.resultsEl);

        this.input.addEventListener('input', () => this._refresh());
        this.input.addEventListener('focus', () => this._refresh());
        this.input.addEventListener('keydown', (e) => this._onKeyDown(e));
        this.clearBtn.addEventListener('click', () => {
            this.input.value = '';
            this._closeResults();
            this.input.focus();
        });
    }

    /** @private */
    _onKeyDown(e) {
        if (e.key === 'Escape') {
            this._closeResults();
            this.input.blur();
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!this._results.length) return;
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            this._active = (this._active + step + this._results.length) % this._results.length;
            this._renderResults();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const picked = this._results[this._active] || this._results[0];
            if (picked) this._pick(picked);
        }
    }

    /**
     * 取当前关键字匹配到的节点（title / id / label 任一命中即可）
     *
     * @private
     * @returns {Array<any>}
     */
    _match() {
        const keyword = this.input.value.trim().toLowerCase();
        const nodes = (this.getNodes && this.getNodes()) || [];
        if (!keyword) return [];
        // 「#12」这种写法也当作 id 查
        const plain = keyword.startsWith('#') ? keyword.slice(1) : keyword;
        const hit = (node) => {
            const fields = [node.title, node.label, node.id, node.uid];
            return fields.some((value) => value != null && String(value).toLowerCase().includes(plain));
        };
        return nodes.filter(hit);
    }

    /** @private */
    _refresh() {
        this._results = this._match();
        this._active = 0;
        this._renderResults();
    }

    /** @private */
    _renderResults() {
        const keyword = this.input.value.trim();
        this.resultsEl.innerHTML = '';
        if (!keyword) {
            this._closeResults();
            return;
        }

        this.resultsEl.classList.remove('hidden');

        if (!this._results.length) {
            const empty = document.createElement('div');
            empty.className = 'node-search-empty';
            empty.textContent = '没有匹配的节点';
            this.resultsEl.appendChild(empty);
            return;
        }

        const shown = this._results.slice(0, this.maxResults);
        shown.forEach((node, index) => {
            const item = document.createElement('div');
            item.className = `node-search-item${index === this._active ? ' active' : ''}`;

            const title = document.createElement('span');
            title.className = 'node-search-item-title';
            title.textContent = node.title || node.label || `#${node.uid ?? node.id}`;

            const meta = document.createElement('span');
            meta.className = 'node-search-item-meta';
            const parts = [];
            if (node.label && node.label !== node.title) parts.push(node.label);
            if (node.type) parts.push(node.type);
            parts.push(`#${node.uid ?? node.id}`);
            meta.textContent = parts.join(' · ');

            item.append(title, meta);
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // 别让输入框失焦
                this._pick(node);
            });
            this.resultsEl.appendChild(item);
        });

        if (this._results.length > shown.length) {
            const more = document.createElement('div');
            more.className = 'node-search-more';
            more.textContent = `还有 ${this._results.length - shown.length} 个匹配…`;
            this.resultsEl.appendChild(more);
        }
    }

    /**
     * @private
     * @param {any} node
     */
    _pick(node) {
        if (this.onPick) this.onPick(node);
        this._closeResults();
        this.input.select();
    }

    /** @private */
    _closeResults() {
        this.resultsEl.classList.add('hidden');
        this.resultsEl.innerHTML = '';
        this._results = [];
    }
}
