'use strict';

/**
 * core/service/storage.js —— 服务层缓存的落盘布局（纯函数，不依赖 vscode）
 *
 * 缓存根目录由调用方给定（vscode 环境里是 `context.storageUri`，没有工作区时退回
 * `globalStorageUri`），本文件只负责「根目录 + 键 → 具体缓存文件路径」：
 *
 *   <root>/graphs/<key>.json   mod 数据图（中间态 JSON）
 *   <root>/docs/<key>.json     画布文档（前端自动保存）
 *
 * 键是路径/命名空间的短 hash（见 cacheKey.storageKey），所以目录名不会随着 mod 路径变长，
 * 也不会因为在 Windows 上带盘符冒号而成为非法文件名。
 */

const path = require('path');
const cacheKey = require('./cacheKey');

/** 子目录名 */
const DIRS = {
    graphs: 'graphs',
    docs: 'docs',
};

/**
 * 数据图缓存文件路径。
 *
 * @param {string} storageDir - 缓存根目录
 * @param {...string} parts - 参与键计算的片段（一般是 mod 根目录）
 * @returns {string} 缓存文件绝对路径
 */
function graphFile(storageDir, ...parts) {
    return path.join(storageDir, DIRS.graphs, `${cacheKey.storageKey('graph', ...parts)}.json`);
}

/**
 * 画布文档缓存文件路径。
 *
 * @param {string} storageDir - 缓存根目录
 * @param {...string} parts - 参与键计算的片段（一般是工作区路径）
 * @returns {string} 缓存文件绝对路径
 */
function docFile(storageDir, ...parts) {
    return path.join(storageDir, DIRS.docs, `${cacheKey.storageKey('doc', ...parts)}.json`);
}

module.exports = {
    DIRS,
    graphFile,
    docFile,
};
