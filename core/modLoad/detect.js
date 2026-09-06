'use strict';

/**
 * core/modLoad/detect.js —— mod 入口（synopsis.json）检测 / 定位 / 安全读 json
 *
 * 纯逻辑模块（不依赖 vscode API），由 extension.js 调用：
 *   - 功能2：检测工作区 synopsis.json（没有则交给 extension.js 询问文件位置）
 */

const fs = require('fs');
const path = require('path');

/**
 * 检测指定目录下是否存在 synopsis.json
 *
 * @param {string} folderPath
 * @returns {string | null} synopsis.json 绝对路径，或 null
 */
function findSynopsisInFolder(folderPath) {
    if (!folderPath || !fs.existsSync(folderPath)) return null;
    const p = path.join(folderPath, 'synopsis.json');
    return fs.existsSync(p) ? p : null;
}

/**
 * 检测工作区根目录的 synopsis.json
 *
 * @param {string | undefined} workspaceRoot - vscode workspace rootPath
 * @returns {{ found: boolean, synopsisPath: string | null, synopsis: any | null, error?: string | null }}
 */
function detectModInWorkspace(workspaceRoot) {
    const synopsisPath = findSynopsisInFolder(workspaceRoot || '');
    if (!synopsisPath) {
        return { found: false, synopsisPath: null, synopsis: null };
    }
    const result = readJson(synopsisPath);
    return {
        found: true,
        synopsisPath,
        synopsis: result.error ? null : result.data,
        error: result.error,
    };
}

/**
 * 安全读取 json 文件
 *
 * @param {string} filePath
 * @returns {{ data: any | null, error: string | null }}
 */
function readJson(filePath) {
    try {
        const text = fs.readFileSync(filePath, 'utf8');
        return { data: JSON.parse(text), error: null };
    } catch (e) {
        return { data: null, error: e.message };
    }
}

module.exports = {
    findSynopsisInFolder,
    detectModInWorkspace,
    readJson,
};
