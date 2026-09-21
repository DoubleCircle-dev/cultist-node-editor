/**
 * frontend/src/variableNodes.js —— 「额外解析」的**纯逻辑**：字段值 → 列表 / 字典变量节点
 *
 * ⚠️ 术语：`table` / `list` 也是**变量节点**（变量节点的列表形态 / 字典形态），
 * 与文本变量（`text` / `number` …）同属一类，不再叫「工具节点」。
 *
 * 这里只算「哪些字段该解析、解析成什么行列」，建节点与连线由 `ControllerCore` 负责 ——
 * 规则可以单独测，也不绑 DOM。
 *
 * 设置开关：`setting.extraParseListVariables`（默认关）；触发点在 `index.js` 的 `registerData`。
 */

/** 少于这个条数（list 元素数 / dict 键数）不值得额外解析成一个变量节点 */
export const MIN_VARIABLE_ITEMS = 3;

/**
 * 单元格值 → 文本（对象 / 数组序列化，其余原样）
 *
 * @param {any} value - 原始值
 * @returns {string}
 */
function cellText(value) {
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/**
 * 字段值 → 表格的行与列
 *
 * - `dict` → 一行一个键值对（键 / 值两列）；
 * - `list`（元素是对象）→ 列 = 所有元素字段的并集（保持首次出现顺序），一行一个元素；
 * - `list`（标量元素）→ 单列「条目」，一行一个值。
 *
 * @param {'list'|'dict'} kind - 契约给的字段类型
 * @param {any} value - 原始值
 * @returns {{ rows: Array<Record<string, any>>; columns: any[] }} 行列定义（喂给 `type: 'table'` 属性）
 */
export function rowsAndColumns(kind, value) {
    if (kind === 'dict') {
        const dict = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return {
            rows: Object.entries(dict).map(([key, val]) => ({ key, value: cellText(val) })),
            columns: [
                { label: '键', field: 'key', type: 'text', width: '40%' },
                { label: '值', field: 'value', type: 'text', width: '60%' },
            ],
        };
    }

    const list = Array.isArray(value) ? value : [];
    const objectItems = list.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
    if (objectItems.length) {
        /** @type {string[]} */
        const fields = [];
        objectItems.forEach((item) => {
            Object.keys(item).forEach((key) => {
                if (!fields.includes(key)) fields.push(key);
            });
        });
        const width = `${Math.max(12, Math.floor(100 / Math.max(1, fields.length)))}%`;
        return {
            columns: fields.map((field) => ({ label: field, field, type: 'text', width })),
            rows: list.map((item) => {
                /** @type {Record<string, any>} */
                const row = {};
                fields.forEach((field) => {
                    row[field] = cellText(item && item[field]);
                });
                return row;
            }),
        };
    }

    return {
        rows: list.map((item) => ({ value: cellText(item) })),
        columns: [{ label: '条目', field: 'value', type: 'text', width: '100%' }],
    };
}

/**
 * 某个字段声明的条目数（list 元素数 / dict 键数）
 *
 * @param {any} decl - 契约的 props 声明
 * @returns {number}
 */
function itemCountOf(decl) {
    const value = decl ? decl.value : null;
    if (decl && decl.kind === 'list') return Array.isArray(value) ? value.length : 0;
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.keys(value).length;
    return 0;
}

/**
 * 某个字段是否声明了连接需求（`link` 单数 / `links` 数组两种形态都认）
 *
 * @param {any} decl - 契约的 props 声明
 * @returns {boolean}
 */
function hasLink(decl) {
    if (!decl) return false;
    if (decl.link) return true;
    return Array.isArray(decl.links) && decl.links.length > 0;
}

/**
 * 挑出「该额外解析成列表 / 字典变量节点」的字段
 *
 * 条件：`kind` 是 `list` / `dict`、**声明了连接需求**（有端口才连得上宿主）、条目数 ≥ `minItems`。
 *
 * @param {any} entry - 数据池条目（含 `props`）
 * @param {number} [minItems] - 最小条目数（默认 {@link MIN_VARIABLE_ITEMS}）
 * @returns {Array<{ name: string; kind: 'table'|'list'; rows: any[]; columns: any[]; size: number }>} 待解析字段
 */
export function collectVariableFields(entry, minItems = MIN_VARIABLE_ITEMS) {
    const decls = (entry && entry.props) || [];
    /** @type {Array<{ name: string; kind: 'table'|'list'; rows: any[]; columns: any[]; size: number }>} */
    const result = [];

    decls.forEach((decl) => {
        if (!decl || !decl.name) return;
        if (decl.kind !== 'list' && decl.kind !== 'dict') return;
        if (!hasLink(decl)) return;
        const size = itemCountOf(decl);
        if (size < minItems) return;

        const { rows, columns } = rowsAndColumns(decl.kind, decl.value);
        result.push({
            name: String(decl.name),
            kind: decl.kind === 'list' ? 'list' : 'table',
            rows,
            columns,
            size,
        });
    });

    return result;
}
