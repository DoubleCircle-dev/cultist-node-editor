/**
 * nodeColors.js —— 节点配色表（唯一事实来源，可自定义）
 *
 * 原先配色散落在 `styles/variables.css` 的 `--node-*` 变量里，由 `nodeTypes.js` 在模块顶层
 * `getComputedStyle` 一次性快照下来 —— 既没法在运行时改，也没法让用户配。现在改为：
 *
 *   - **默认值**在本文件的 `NODE_COLOR_ITEMS`（CSS 里的 `--node-*` 已删掉，见 variables.css 的说明）；
 *   - 支持两层覆盖：`config.json` 的 `nodeColors`（出厂/团队默认）
 *     → 用户在 ⚙️ 设置里改的局部覆盖（存 `localStorage['nodeEditor.nodeColors']`，用户优先）；
 *   - `applyNodeColors()` 把结果写回 `documentElement` 的 `--node-<key>`，
 *     这样 `styles/**` 与调试工具仍可用 `var(--node-*)`；
 *   - 取色一律走 `getNodeColor(key)`（`NodeTypeRegistry.getColor()` 只是它的转发），
 *     端口颜色（`dataType` 如 `text` / `number` / `set`）与节点类型共用这张表。
 *
 * 生效时机：改完配色要刷新**画布上已有的节点**，调用
 * `ControllerCore.applyNodeColors()`（会逐个重绘节点）；此后新建的节点自然用新配色。
 */

/** 配色项：key = 配色键（= 节点类型键；`set` 同时是端口数据类型名），label = 设置面板里的中文名 */
export const NODE_COLOR_ITEMS = [
    { key: 'blank', label: '空节点', value: '#000000' },
    { key: 'test', label: '测试节点', value: '#7d1ff8' },
    { key: 'legacies', label: '职业', value: '#ff8a80' },
    { key: 'endings', label: '结局', value: '#ff31b0' },
    { key: 'achievements', label: '成就', value: '#fcf80e' },
    { key: 'recipes', label: '交互', value: '#ff5719' },
    { key: 'mutations', label: '重载变化', value: '#ffaa33' },
    { key: 'elements', label: '元素', value: '#1e88ff' },
    { key: 'xtriggers', label: '触变', value: '#8fff33' },
    { key: 'morphEffects', label: '操作数', value: '#f3fc76' },
    { key: 'decks', label: '卡池', value: '#f853f8' },
    { key: 'verbs', label: '行动框', value: '#ff66aa' },
    { key: 'slots', label: '卡槽', value: '#ffcc33' },
    { key: 'levers', label: '继承物品', value: '#6fc1b0' },
    { key: 'extends', label: '扩充对象', value: '#ff6b6b' },
    { key: 'copies', label: '引用复制', value: '#ff7043' },
    { key: 'text', label: '文本', value: '#ffffff' },
    { key: 'number', label: '数字', value: '#2ecc71' },
    { key: 'set', label: '集合', value: '#bb8fce' },
    { key: 'images', label: '图片', value: '#ff9f4b' },
    { key: 'table', label: '表格', value: '#7f8c8d' },
    { key: 'list', label: '列表', value: '#b0bec5' },
    { key: 'dangling', label: '悬空端口', value: '#8d6e63' },
    { key: 'container', label: '容器节点', value: '#3b82f6' },
    { key: 'ref', label: '引用副本', value: '#22d3ee' },
];

/** 全部配色键（顺序同 `NODE_COLOR_ITEMS`） */
export const NODE_COLOR_KEYS = NODE_COLOR_ITEMS.map((item) => item.key);

/**
 * 基础节点类型键 → 配色键
 *
 * 两者基本同名，只有 `nodeSet`（集合节点，未启用）用的是端口数据类型名 `set`。
 */
export const NODE_TYPE_COLOR_KEY = {
    nodeSet: 'set',
    danglingPort: 'dangling',
};

/** 节点类型键 → 配色键 */
export function nodeColorKeyOf(typeKey) {
    return NODE_TYPE_COLOR_KEY[typeKey] || typeKey;
}

const STORAGE_KEY = 'nodeEditor.nodeColors';

/** 内置默认值（`#rrggbb`） */
const DEFAULT_COLORS = /** @type {Record<string, string>} */ (
    Object.fromEntries(NODE_COLOR_ITEMS.map((item) => [item.key, item.value]))
);

/** 只接受 `#rgb` / `#rrggbb`（其余一律视为非法，拒绝写入） */
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** 出厂默认（config.json 的 `nodeColors` 覆盖内置默认） */
let factoryColors = {};

/** 用户自定义（localStorage，优先于出厂默认） */
let userColors = {};

/** jsdom / SSR / 无 DOM 环境下安全取 localStorage */
function storage() {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

/**
 * 规范化颜色：`#abc` → `#aabbcc`、统一小写；非法值返回 null
 *
 * @param {any} value
 * @returns {string | null}
 */
export function normalizeNodeColor(value) {
    const text = String(value ?? '').trim();
    if (!COLOR_PATTERN.test(text)) return null;
    if (text.length === 4) {
        return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
    }
    return text.toLowerCase();
}

/**
 * 取某个配色键的当前颜色
 *
 * 未知键退回 `blank`（与 `NodeTypeRegistry.getColor()` 原行为一致）。
 *
 * @param {string} key - 配色键
 * @returns {string} `#rrggbb`
 */
export function getNodeColor(key) {
    return userColors[key] || factoryColors[key] || DEFAULT_COLORS[key] || DEFAULT_COLORS.blank;
}

/**
 * 取整张配色表（已合并两层覆盖）
 *
 * @returns {Record<string, string>} 配色键 → `#rrggbb`
 */
export function getNodeColors() {
    return /** @type {Record<string, string>} */ (
        Object.fromEntries(NODE_COLOR_KEYS.map((key) => [key, getNodeColor(key)]))
    );
}

/**
 * 取用户自定义过的项（只有这些会写进 localStorage）
 *
 * @returns {Record<string, string>}
 */
export function getUserNodeColors() {
    return { ...userColors };
}

/**
 * 把配色写进 `documentElement` 的 `--node-<key>` 自定义属性
 *
 * @param {string} [key] - 只刷新某一项；省略表示全量
 */
export function applyNodeColors(key) {
    if (typeof document === 'undefined') return;
    const keys = key ? [key] : NODE_COLOR_KEYS;
    keys.forEach((item) => {
        if (!NODE_COLOR_KEYS.includes(item)) return;
        document.documentElement.style.setProperty(`--node-${item}`, getNodeColor(item));
    });
}

/** 把用户自定义写入 localStorage（只存被改过的项） */
export function saveNodeColors() {
    const store = storage();
    if (!store) return;
    try {
        const changed = Object.fromEntries(
            Object.entries(userColors).filter(([key, value]) => DEFAULT_COLORS[key] !== value)
        );
        if (Object.keys(changed).length) store.setItem(STORAGE_KEY, JSON.stringify(changed));
        else store.removeItem(STORAGE_KEY);
    } catch {
        /* 存储不可用时忽略：本次会话内仍然生效 */
    }
}

/** 读取 localStorage 里的用户自定义 */
export function loadStoredNodeColors() {
    const store = storage();
    if (!store) return;
    try {
        const raw = store.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== 'object') return;
        Object.entries(parsed).forEach(([key, value]) => {
            const color = normalizeNodeColor(value);
            if (NODE_COLOR_KEYS.includes(key) && color) userColors[key] = color;
        });
    } catch {
        /* 配置损坏时用默认配色 */
    }
}

/**
 * 设置「出厂默认」配色（来自 `config.json` 的 `nodeColors`）
 *
 * `config.json` 给的是**完整的一张表**，所以默认整表替换（`replace: false` 才是按项合并）；
 * 用户本地改过的项仍然优先；只认已知键与合法颜色。
 *
 * @param {Record<string, any>} colors
 * @param {{ apply?: boolean, replace?: boolean }} [options]
 * @returns {string[]} 实际生效的键
 */
export function setFactoryNodeColors(colors, options = {}) {
    if (options.replace !== false) factoryColors = {};
    const applied = [];
    Object.entries(colors || {}).forEach(([key, value]) => {
        const color = normalizeNodeColor(value);
        if (!NODE_COLOR_KEYS.includes(key) || !color) return;
        factoryColors[key] = color;
        applied.push(key);
    });
    if (options.apply !== false) applyNodeColors();
    return applied;
}

/**
 * 改一个配色键的颜色
 *
 * @param {string} key - 配色键
 * @param {string} value - `#rgb` / `#rrggbb`
 * @param {{ persist?: boolean, apply?: boolean }} [options] - `persist` 写入 localStorage、`apply` 刷新 CSS 变量
 * @returns {boolean} 是否生效（未知键或非法颜色返回 false）
 */
export function setNodeColor(key, value, options = {}) {
    const color = normalizeNodeColor(value);
    if (!NODE_COLOR_KEYS.includes(key) || !color) return false;
    userColors[key] = color;
    if (options.persist !== false) saveNodeColors();
    if (options.apply !== false) applyNodeColors(key);
    return true;
}

/**
 * 批量改配色
 *
 * @param {Record<string, any>} colors
 * @param {{ persist?: boolean, apply?: boolean }} [options]
 * @returns {string[]} 实际生效的键
 */
export function setNodeColors(colors, options = {}) {
    const applied = [];
    Object.entries(colors || {}).forEach(([key, value]) => {
        if (setNodeColor(key, value, { persist: false, apply: false })) applied.push(key);
    });
    if (!applied.length) return applied;
    if (options.persist !== false) saveNodeColors();
    if (options.apply !== false) applyNodeColors();
    return applied;
}

/**
 * 清空用户自定义，回到内置 / config.json 的默认配色
 *
 * @param {{ persist?: boolean, apply?: boolean }} [options]
 */
export function resetNodeColors(options = {}) {
    userColors = {};
    if (options.persist !== false) saveNodeColors();
    if (options.apply !== false) applyNodeColors();
}

// 模块载入即恢复用户自定义并写入 CSS 变量：保证首个节点建出来就是用户配色
loadStoredNodeColors();
applyNodeColors();
