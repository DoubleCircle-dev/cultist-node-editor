'use strict';

/**
 * core/service/cacheKey.js —— 服务层的「键」与「签名」计算（纯函数，不依赖 vscode）
 *
 * 服务层靠两个稳定标识决定磁盘缓存还能不能用：
 *   - **缓存键** `storageKey(...)`：由若干路径/命名空间片段算出的短 hash，决定缓存文件叫什么；
 *   - **来源签名** `signatureOf(entries)`：来源文件的「相对路径 + mtime + size」摘要，决定缓存是否过期。
 *
 * 签名只依赖 mtime 与 size（一次 stat 即可，不读内容），因此「判断能不能复用」非常便宜；
 * 若将来遇到 mtime 不可信的存储（同步盘、git checkout 后时间戳回退），只需把 `fileSignature`
 * 升级为内容 hash，其余调用方不受影响。
 */

const crypto = require('crypto');
const fs = require('fs');

/** 摘要统一取 sha1 的前 16 位十六进制：足够避免冲突，又适合做文件名 */
const HASH_LENGTH = 16;

/**
 * 文本 → 短 hash。
 *
 * @param {string} text - 待摘要文本
 * @returns {string} 16 位十六进制摘要
 */
function shortHash(text) {
    return crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, HASH_LENGTH);
}

/**
 * 缓存键：若干片段拼成一个稳定短串（片段顺序参与计算，调用方需固定顺序）。
 *
 * 用 `\u0000` 分隔，避免 `['a', 'bc']` 与 `['ab', 'c']` 撞成同一个键。
 *
 * @param {...string} parts - 参与计算的片段（路径、命名空间等）
 * @returns {string} 缓存键
 */
function storageKey(...parts) {
    return shortHash(parts.map((p) => String(p == null ? '' : p)).join('\u0000'));
}

/**
 * 单个文件的来源签名：`mtimeMs:size`。文件不存在或读不到属性时返回 null。
 *
 * @param {string} filePath - 文件绝对路径
 * @returns {string|null} 签名（读不到时为 null）
 */
function fileSignature(filePath) {
    try {
        const stat = fs.statSync(filePath);
        return `${Math.round(stat.mtimeMs)}:${stat.size}`;
    } catch {
        return null;
    }
}

/**
 * 文件集合的来源签名：按相对路径排序后拼「相对路径=签名」，再取摘要。
 *
 * 排序保证「文件遍历顺序不同」不会改变签名；分隔符统一成正斜杠，
 * 让 Windows 与 POSIX 上的同一份数据得到同一个签名。
 *
 * @param {{ relativePath?: string; signature?: string|null }[]} entries - 文件签名条目
 * @returns {string} 集合签名
 */
function signatureOf(entries) {
    const lines = (entries || [])
        .map((e) => `${String(e.relativePath || '').split('\\').join('/')}=${e.signature || ''}`)
        .sort();
    return shortHash(lines.join('\n'));
}

module.exports = {
    HASH_LENGTH,
    shortHash,
    storageKey,
    fileSignature,
    signatureOf,
};
