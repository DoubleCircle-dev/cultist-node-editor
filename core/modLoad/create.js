'use strict';

/**
 * core/modLoad/create.js —— 新建 mod 基础结构（synopsis.json + content/ 等）
 *
 * 纯逻辑模块（不依赖 vscode API），由 extension.js 调用（功能3）。
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
 * 在目标目录下新建 mod 基础结构（synopsis.json + content/ 等）
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
    createModStructure,
};
