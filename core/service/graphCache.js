'use strict';

/**
 * core/service/graphCache.js —— 中间态 JSON（节点图）的磁盘缓存（纯函数，不依赖 vscode）
 *
 * 「快速加载」的实现核心：把一次流水线（parse → mapping → toData）产出的节点图连同
 * **来源签名**一起落盘；下次加载先算签名，一致就直接 `JSON.parse` 复用，省掉全部解析与建图。
 *
 * 缓存文件形状（graph 之外套一层元信息，便于判定版本与时效）：
 *   { cacheFormat, cacheVersion, signature, savedAt, stats, graph }
 *
 * 任何异常（文件不存在、JSON 损坏、版本不符、签名不符）都当作**未命中**返回 null，
 * 绝不抛错——缓存只能加速，不能成为故障源。
 */

const fs = require('fs');
const path = require('path');

/** 缓存文件自己的格式标识（与 graph.format 区分：那是中间态 JSON 的标识） */
const CACHE_FORMAT = 'cne-graph-cache';
/** 缓存文件版本：中间态 JSON 结构变化时递增，旧缓存自动失效 */
const CACHE_VERSION = 1;

/**
 * 读缓存：签名与版本都对得上才返回，否则 null。
 *
 * @param {string} filePath - 缓存文件绝对路径
 * @param {{ signature?: string|null }} [options] - 期望的来源签名（不传则不校验签名）
 * @returns {{ graph: any; savedAt: string|null; signature: string|null }|null} 命中结果
 */
function readGraphCache(filePath, options = {}) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch {
        return null;
    }

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return null; // 损坏的缓存：当作未命中，由调用方重算并覆盖
    }

    if (!payload || payload.cacheFormat !== CACHE_FORMAT) return null;
    if (payload.cacheVersion !== CACHE_VERSION) return null;
    if (!payload.graph || payload.graph.format !== 'cne-node-graph') return null;
    if (options.signature != null && payload.signature !== options.signature) return null;

    return {
        graph: payload.graph,
        savedAt: payload.savedAt || null,
        signature: payload.signature || null,
    };
}

/**
 * 写缓存：先写临时文件再 rename 覆盖，避免写到一半被读到半截 JSON。
 *
 * 目录不存在时自动创建；写入失败只返回失败结果，不抛错。
 *
 * @param {string} filePath - 缓存文件绝对路径
 * @param {{ graph: any; signature?: string|null; stats?: any }} payload - 待写入内容
 * @returns {{ ok: boolean; file: string; bytes: number; error?: string }} 写入结果
 */
function writeGraphCache(filePath, payload) {
    const savedAt = new Date().toISOString();
    const body = JSON.stringify({
        cacheFormat: CACHE_FORMAT,
        cacheVersion: CACHE_VERSION,
        signature: payload.signature || null,
        savedAt,
        stats: payload.stats || null,
        graph: payload.graph,
    });

    const tmpFile = `${filePath}.tmp`;
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(tmpFile, body, 'utf8');
        fs.renameSync(tmpFile, filePath);
    } catch (error) {
        try {
            fs.rmSync(tmpFile, { force: true });
        } catch {
            /* 清理失败无副作用：下次写入会覆盖 */
        }
        return { ok: false, file: filePath, bytes: 0, error: error.message };
    }

    return { ok: true, file: filePath, bytes: Buffer.byteLength(body, 'utf8') };
}

/**
 * 删除缓存文件（缓存失效时主动清理；文件不存在也算成功）。
 *
 * @param {string} filePath - 缓存文件绝对路径
 * @returns {boolean} 是否已不存在
 */
function removeGraphCache(filePath) {
    try {
        fs.rmSync(filePath, { force: true });
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    CACHE_FORMAT,
    CACHE_VERSION,
    readGraphCache,
    writeGraphCache,
    removeGraphCache,
};
