'use strict';

/**
 * core/service/docStore.js —— 画布文档（编辑器保存的页面文档）的磁盘缓存（纯函数，不依赖 vscode）
 *
 * 与 graphCache 的分工：
 *   - graphCache 存的是**数据图**（mod 源文件转换出的中间态 JSON）；来源是 mod 文件，过期判定靠来源签名；
 *   - docStore 存的是**画布文档**（节点位置、页面、视图状态 + 节点数据）；来源是编辑器自身，
 *     没有「源文件」可比对，所以只按写入时间管理，由前端决定何时保存/恢复。
 *
 * 文档内容对后端是不透明的：这里只负责「原样存取 + 记元信息」，不解释 pages 的结构。
 */

const fs = require('fs');
const path = require('path');

/** 文档缓存的格式标识与版本（前端文档结构变化时递增，旧缓存自动失效） */
const DOC_FORMAT = 'cne-editor-doc';
const DOC_VERSION = 1;

/**
 * 读文档缓存。
 *
 * @param {string} filePath - 缓存文件绝对路径
 * @returns {{ doc: any; savedAt: string|null; meta: any }} 缓存内容（不存在/损坏时 doc 为 null）
 */
function readDoc(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch {
        return { doc: null, savedAt: null, meta: null };
    }

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return { doc: null, savedAt: null, meta: null };
    }

    if (!payload || payload.docFormat !== DOC_FORMAT || payload.docVersion !== DOC_VERSION) {
        return { doc: null, savedAt: null, meta: null };
    }

    return { doc: payload.doc || null, savedAt: payload.savedAt || null, meta: payload.meta || null };
}

/**
 * 写文档缓存（先写临时文件再 rename，避免读到半截 JSON）。
 *
 * @param {string} filePath - 缓存文件绝对路径
 * @param {any} doc - 文档内容（原样保存，不做解释）
 * @param {{ meta?: any }} [options] - 附加元信息（如页面数、来源）
 * @returns {{ ok: boolean; file: string; bytes: number; savedAt: string; error?: string }} 写入结果
 */
function writeDoc(filePath, doc, options = {}) {
    const savedAt = new Date().toISOString();
    const body = JSON.stringify({
        docFormat: DOC_FORMAT,
        docVersion: DOC_VERSION,
        savedAt,
        meta: options.meta || null,
        doc,
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
        return { ok: false, file: filePath, bytes: 0, savedAt, error: error.message };
    }

    return { ok: true, file: filePath, bytes: Buffer.byteLength(body, 'utf8'), savedAt };
}

/**
 * 删除文档缓存。
 *
 * @param {string} filePath - 缓存文件绝对路径
 * @returns {boolean} 是否已不存在
 */
function removeDoc(filePath) {
    try {
        fs.rmSync(filePath, { force: true });
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    DOC_FORMAT,
    DOC_VERSION,
    readDoc,
    writeDoc,
    removeDoc,
};
