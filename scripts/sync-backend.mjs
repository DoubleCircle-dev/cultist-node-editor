#!/usr/bin/env node
/**
 * sync-backend —— 把 core（后端）的代码同步进某个前端线工作区。
 *
 * 背景：前端线的仓库**不跟踪**后端代码（见各前端线的 `.gitignore` 与 `.vscode/tasks.json`）。
 * 开发、跑测试、打包之前先执行本脚本，把后端文件从 core 工作区拷进来，
 * 并把 core `package.json` 里的扩展清单字段、依赖合并给前端线 ——
 * 因此前端线**永远不需要 merge core**，core 改完跑一次任务即可。
 *
 * 用法：
 *   node <core 根目录>/scripts/sync-backend.mjs [目标工作区] [--core <core 根目录>]
 *
 *   · 目标工作区：默认为当前目录（在前端线仓库根执行时就不用传）
 *   · core 根目录：默认为本脚本所在仓库的根
 *
 * 例（在 vite-vanilla 工作区里）：
 *   node E:/Code/js/cultist-node-editor/scripts/sync-backend.mjs .
 *
 * ⚠️ 本脚本只会**写**清单里的后端路径与 `package.json` 的共享字段，
 *    前端线的 `ui/`、`frontend/`、`frontend-host/vanilla.js|vite.js`、`test/ui/`、
 *    `scripts/`、`.vscode/`、`.gitignore`、`README.md` 都不会被碰。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 后端路径清单（相对仓库根）：整体覆盖到目标工作区 */
const ENTRIES = [
    // 项目级文档：分支约定写在这里，前端线不该有自己的一份副本（否则必然过时）
    'README.md',
    'core',
    'extension.js',
    'types.d.ts',
    'customInterface.d.ts',
    'env.d.ts',
    'jsconfig.json',
    'eslint.config.mjs',
    '.vscodeignore',
    'myLint',
    'pnpm-workspace.yaml',
    'test/extension.test.js',
    'test/fixtures',
    'test/img',
];

/** `frontend-host/` 只同步契约层；`vanilla.js` / `vite.js` 属于各前端线自己 */
const FRONTEND_HOST_SHARED = ['frontend-host/index.js'];

/** 拷贝时始终跳过的目录名（生成物、依赖、体量大的素材） */
const SKIP_DIRS = new Set(['node_modules', '.vscode-test', 'agent-scratch', 'dist', 'coverage']);

/** 拷贝时始终跳过的相对路径（core/origin_resources/images 是 233MB 原始素材，走 CDN） */
const SKIP_PATHS = ['core/origin_resources/images'];

/** 直接从 core 的 package.json 抄过来的字段（扩展清单 = 后端定义） */
const COPIED_FIELDS = [
    'name',
    'displayName',
    'description',
    'publisher',
    'license',
    'repository',
    'engines',
    'categories',
    'activationEvents',
    'main',
    'contributes',
];

/** core 的运行时依赖：前端线必须与 core 完全一致 */
const COPIED_DEP_FIELDS = ['dependencies'];

/** 与前端线自己的取并集（core 的在前，前端线的同名键覆盖） */
const MERGED_DEP_FIELDS = ['devDependencies'];

/**
 * 解析命令行参数。
 * @param {string[]} argv `process.argv.slice(2)`
 * @returns {{target: string|null, core: string|null, help: boolean}}
 */
function parseArgs(argv) {
    const args = { target: null, core: null, help: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--core') {
            i += 1;
            args.core = argv[i];
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        } else if (!args.target) {
            args.target = arg;
        }
    }
    return args;
}

/**
 * 拷贝单个后端路径。
 * @param {string} coreRoot core 仓库根
 * @param {string} targetRoot 前端线工作区根
 * @param {string} rel 相对仓库根的后端路径
 * @returns {boolean} 是否真的拷了（源不存在时返回 false）
 */
function copyEntry(coreRoot, targetRoot, rel) {
    const src = path.join(coreRoot, rel);
    if (!fs.existsSync(src)) return false;

    fs.cpSync(src, path.join(targetRoot, rel), {
        recursive: true,
        filter: (srcPath) => {
            const relPath = path.relative(coreRoot, srcPath).split(path.sep).join('/');
            if (SKIP_PATHS.some((p) => relPath === p || relPath.startsWith(`${p}/`))) return false;
            return !SKIP_DIRS.has(path.basename(srcPath));
        },
    });
    return true;
}

/**
 * 把 core `package.json` 的共享字段合并进目标 `package.json`。
 * @param {string} coreRoot core 仓库根
 * @param {string} targetRoot 前端线工作区根
 * @returns {string[]|null} 被更新的字段名；目标没有 package.json 时返回 null
 */
function mergePackageJson(coreRoot, targetRoot) {
    const targetPkgPath = path.join(targetRoot, 'package.json');
    if (!fs.existsSync(targetPkgPath)) return null;

    const corePkg = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
    const targetPkg = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));
    const changed = [];

    for (const field of [...COPIED_FIELDS, ...COPIED_DEP_FIELDS]) {
        if (corePkg[field] === undefined) continue;
        if (JSON.stringify(targetPkg[field]) === JSON.stringify(corePkg[field])) continue;
        targetPkg[field] = corePkg[field];
        changed.push(field);
    }

    for (const field of MERGED_DEP_FIELDS) {
        const merged = { ...(corePkg[field] || {}), ...(targetPkg[field] || {}) };
        const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
        if (JSON.stringify(targetPkg[field]) === JSON.stringify(sorted)) continue;
        targetPkg[field] = sorted;
        changed.push(field);
    }

    if (changed.length > 0) {
        fs.writeFileSync(targetPkgPath, `${JSON.stringify(targetPkg, null, 2)}\n`);
    }
    return changed;
}

/**
 * 入口。
 */
function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
        return;
    }

    const coreRoot = path.resolve(args.core || path.resolve(HERE, '..'));
    const targetRoot = path.resolve(args.target || process.cwd());

    if (!fs.existsSync(path.join(coreRoot, 'extension.js'))) {
        console.error(`✗ ${coreRoot} 不像是 core 仓库根（没有 extension.js）`);
        process.exitCode = 1;
        return;
    }
    if (coreRoot === targetRoot) {
        console.error('✗ 目标是 core 自己，无需同步（请在前端线工作区执行）');
        process.exitCode = 1;
        return;
    }

    console.log(`后端源: ${coreRoot}`);
    console.log(`目标:   ${targetRoot}`);
    console.log('');

    let count = 0;
    for (const rel of [...ENTRIES, ...FRONTEND_HOST_SHARED]) {
        if (copyEntry(coreRoot, targetRoot, rel)) count += 1;
    }
    console.log(`✓ 已同步 ${count} 项后端路径`);

    const changed = mergePackageJson(coreRoot, targetRoot);
    if (changed === null) {
        console.log('· 目标没有 package.json，跳过字段合并');
    } else if (changed.length > 0) {
        console.log(`✓ package.json 更新字段: ${changed.join(', ')}`);
        if (changed.includes('dependencies') || changed.includes('devDependencies')) {
            console.log('  → 依赖有变化，请跑一次 pnpm install');
        }
    } else {
        console.log('· package.json 无需更新');
    }
}

main();
