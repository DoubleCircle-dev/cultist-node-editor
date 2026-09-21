/**
 * frontend/src/dataProvider.js —— 取数层（读数据的**唯一**入口）
 *
 * 为什么单独一层：后端正在做 VS Code 服务层，之后数据由后端持有、前端只保留「当前页面」，
 * 取数会从「本地数据池」变成「向宿主查询」（异步）。把取数收口在这里，将来只替换本文件的实现，
 * 不必翻遍变量节点 / 悬空端口 / 跳转这些调用点。
 *
 * 现阶段的实现：读 `ModDataRegistry`（本地缓存 + 位置索引），同步返回。
 * ⚠️ 切到后端服务层时：这三个函数改成 `async`（用 `postMessage` 请求 `queryEntry` /
 * `queryLocate` / `queryFiles`），并给调用方加 `await`。
 */

import { ModDataRegistry } from './modDataRegistry.js';

/**
 * 取某个条目的本体
 *
 * @param {string} category - 类别（节点类型，如 recipes）
 * @param {string|number} id - 条目 id
 * @returns {any|null} 数据条目
 */
export function entryOf(category, id) {
    return ModDataRegistry.findEntry(category, id);
}

/**
 * 定位某个条目来自哪个命名空间 / 文件（悬空端口跳转 + 三态排查用）
 *
 * @param {string} category - 类别
 * @param {string|number} id - 条目 id
 * @returns {{ namespace: string; source: string; file: string } | null} 位置信息
 */
export function locate(category, id) {
    return ModDataRegistry.locate(String(category == null ? '' : category), id);
}

/**
 * 某命名空间本次已加载的文件清单
 *
 * @param {string} namespace - 命名空间
 * @returns {string[]} 文件相对路径列表
 */
export function filesOf(namespace) {
    return ModDataRegistry.filesOf(namespace);
}
