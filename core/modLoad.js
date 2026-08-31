'use strict';

/**
 * core/modLoad.js —— mod 入口（synopsis.json）检测 / 新建 / 单文件读取
 *
 * 纯逻辑模块（不依赖 vscode API），由 extension.js 调用：
 *   - 功能2：检测工作区 synopsis.json（没有则交给 extension.js 询问文件位置）
 *   - 功能3：新建 synopsis.json 等 mod 基础结构
 *   - 功能4：读取单个 mod json 文件（供节点预览）
 */

const fs = require('fs');
const path = require('path');

/** synopsis.json 模板（CS mod 的标准入口） */
const SYNOPSIS_TEMPLATE = {
    name: '',
    author: '',
    version: '1.0.0',
    description: '',
    description_long: '',
};

/**
 * 功能2：检测指定目录下是否存在 synopsis.json
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
 * 功能2辅助：检测工作区根目录的 synopsis.json
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

/**
 * 功能3：在目标目录下新建 mod 基础结构（synopsis.json + content/ 等）
 *
 * @param {string} targetFolder - 用户选择的目录（在此目录内直接生成 synopsis.json）
 * @param {{ name?: string, author?: string, version?: string, description?: string, description_long?: string, createSubDirs?: boolean }} [opts]
 * @returns {{ folder: string, synopsisPath: string, files: string[], errors: string[] }}
 */
function createModStructure(targetFolder, opts = {}) {
    const errors = [];
    if (!targetFolder) {
        return { folder: '', synopsisPath: '', files: [], errors: ['未选择目标目录'] };
    }
    if (!fs.existsSync(targetFolder)) {
        try {
            fs.mkdirSync(targetFolder, { recursive: true });
        } catch (e) {
            return { folder: '', synopsisPath: '', files: [], errors: [`创建目录失败: ${e.message}`] };
        }
    }

    const synopsis = {
        ...SYNOPSIS_TEMPLATE,
        name: (opts.name || 'My New Mod').trim(),
        author: (opts.author || '').trim(),
        version: (opts.version || '1.0.0').trim(),
        description: (opts.description || '').trim(),
        description_long: (opts.description_long || '').trim(),
    };

    /** @type {string[]} */
    const files = [];

    try {
        const synopsisPath = path.join(targetFolder, 'synopsis.json');
        fs.writeFileSync(synopsisPath, JSON.stringify(synopsis, null, 2), 'utf8');
        files.push(synopsisPath);
    } catch (e) {
        errors.push(`写 synopsis.json 失败: ${e.message}`);
    }

    // 标准 mod 子目录：content 必须有；images/loc 按需可选
    const subDirs = ['content'];
    if (opts.createSubDirs !== false) subDirs.push('images', 'loc');
    subDirs.forEach((dir) => {
        try {
            const dirPath = path.join(targetFolder, dir);
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
            files.push(dirPath);
        } catch (e) {
            errors.push(`创建 ${dir} 目录失败: ${e.message}`);
        }
    });

    return { folder: targetFolder, synopsisPath: path.join(targetFolder, 'synopsis.json'), files, errors };
}

module.exports = {
    SYNOPSIS_TEMPLATE,
    findSynopsisInFolder,
    detectModInWorkspace,
    readJson,
    createModStructure,
};
