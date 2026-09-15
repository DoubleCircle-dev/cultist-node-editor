/**
 * ui/scripts/views/dataSelector.js —— 数据选择器（modal）
 *
 * 从「基础类型」（recipes/elements/...）的数据池中选择具体条目，用于实例化节点。
 * 数据来源：ModDataRegistry（由后端 mod/origin 数据加载）。
 */

export class DataSelector {
    /**
     * @param {{ category: string, entries: any[], onSelect: (entry: any) => void, onCancel?: () => void }} options
     */
    constructor({ category, entries, onSelect, onCancel }) {
        this.category = category;
        this.entries = entries || [];
        this.onSelect = onSelect;
        this.onCancel = onCancel;
        /** @private */
        this._keyword = '';
        this._build();
    }

    /** @private */
    _build() {
        this.element = document.createElement('div');
        this.element.className = 'data-selector-overlay';

        const panel = document.createElement('div');
        panel.className = 'data-selector';

        const header = document.createElement('div');
        header.className = 'data-selector-header';

        const title = document.createElement('span');
        title.textContent = `选择 ${this.category} 数据`;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'data-selector-close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => this.close());

        header.appendChild(title);
        header.appendChild(closeBtn);

        const search = document.createElement('input');
        search.type = 'text';
        search.className = 'data-selector-search';
        search.placeholder = '搜索 id / 标题...';
        search.addEventListener('input', (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            this._keyword = target.value.trim().toLowerCase();
            this._renderList();
        });

        /** @private */
        this._list = document.createElement('div');
        this._list.className = 'data-selector-list';

        panel.appendChild(header);
        panel.appendChild(search);
        panel.appendChild(this._list);

        this.element.appendChild(panel);
        this._renderList();

        // 点击遮罩空白处关闭
        this.element.addEventListener('mousedown', (e) => {
            if (e.target === this.element) this.close();
        });
    }

    /** @private */
    _renderList() {
        this._list.innerHTML = '';
        const kw = this._keyword;
        const filtered = kw
            ? this.entries.filter((e) => `${e.title} ${e.id}`.toLowerCase().includes(kw))
            : this.entries;

        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.className = 'data-selector-empty';
            empty.textContent = '无匹配数据';
            this._list.appendChild(empty);
            return;
        }

        filtered.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'data-selector-item';

            const badge = document.createElement('span');
            badge.className = `data-selector-item-badge ${entry.source === 'origin' ? 'origin' : 'mod'}`;
            badge.textContent = entry.source === 'origin' ? 'origin' : 'mod';

            const title = document.createElement('span');
            title.className = 'data-selector-item-title';
            title.textContent = entry.title || entry.id || 'untitled';

            const idEl = document.createElement('span');
            idEl.className = 'data-selector-item-id';
            idEl.textContent = entry.id || '';

            item.appendChild(badge);
            item.appendChild(title);
            item.appendChild(idEl);

            item.addEventListener('click', () => {
                const handler = this.onSelect;
                this.close();
                if (handler) handler(entry);
            });

            this._list.appendChild(item);
        });
    }

    close() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        if (this.onCancel) this.onCancel();
    }
}
