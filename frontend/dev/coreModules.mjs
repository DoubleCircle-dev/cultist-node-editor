/**
 * frontend/dev/coreModules.mjs —— dev server 侧「core 代码在哪、怎么加载、怎么失效」的唯一出处
 *
 * `core/**`、`extension.js`、`frontend-host/index.js` 等后端代码不在本前端线里维护：它们在
 * `core` 分支的工作区（默认与本工作区相邻的 `../../cultist-node-editor`），由该仓库的
 * `scripts/sync-backend.mjs` 拷进本工作区（即 `.gitignore` 里被忽略的那批路径）。
 *
 * dev server 的两个插件都要碰 core：
 *   · devPreviewApi —— 需要 core 的纯函数做转换（require 一次后 Node 会缓存）
 *   · coreWatcher   —— core 有改动时同步，随后必须清掉这份缓存才会用到新代码
 *
 * 把「定位 / require / 清缓存」集中在这里，两个插件就不必各写一套路径规则。
 *
 * 目录有两个，别搞混：
 *   · **core 分支工作区**（默认 `../../cultist-node-editor`）—— 后端代码真正写在这里；
 *     coreWatcher 监它、sync-backend.mjs 从它拷；对应 `CORE_WORKTREE_DIR`。
 *   · **本工作区的 core 副本**（`<工作区>/core`）—— 同步产物，`.gitignore` 忽略；对应 `CORE_COPY_DIR`。
 *
 * **开发时优先用前者**（后端代码的唯一真实来源）：改完 core 不必先同步，dev server 就是新代码，
 * 也避免了“同步”这一步的时序问题；分支工作区不在时（比如只 clone 了本前端线）才回退到副本。
 * 扩展宿主与单元测试读的仍是副本，靠 coreWatcher 顺带同步保持一致。
 *
 * 路径覆盖：环境变量 `CNE_CORE_DIR=<core 分支工作区>`；未设置时按「worktree 与 core 工作区相邻」的约定。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
/** 本文件所在目录（frontend/dev/） */
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 本工作区根（frontend/dev/ 往上两级） */
export const WORKSPACE_ROOT = path.resolve(HERE, '..', '..');

/** 本工作区里的 core 副本目录（同步产物，git 忽略） */
export const CORE_COPY_DIR = path.join(WORKSPACE_ROOT, 'core');

/** 指定 core 分支工作区路径的环境变量 */
const CORE_WORKTREE_ENV = 'CNE_CORE_DIR';

/**
 * 解析 core 分支工作区的根
 *
 * 默认 `<本工作区>/../../cultist-node-editor`（与 .vscode/tasks.json 里「同步后端」任务的约定一致）。
 * 目录不存在也不抛错 —— 由调用方在使用时报可读错误，避免影响 dev server 其它功能。
 *
 * @returns {string} core 分支工作区根的绝对路径
 */
export function resolveCoreWorktree() {
    const fromEnv = process.env[CORE_WORKTREE_ENV];
    return path.resolve(fromEnv ? fromEnv : path.join(WORKSPACE_ROOT, '..', '..', 'cultist-node-editor'));
}

/** core 分支工作区根（进程内解析一次；改 CNE_CORE_DIR 需重启 dev server） */
export const CORE_WORKTREE_DIR = resolveCoreWorktree();

/** core 分支工作区里的 core 目录（开发时的首选） */
const CORE_BRANCH_DIR = path.join(CORE_WORKTREE_DIR, 'core');

/**
 * 目录像不像可用的 core 代码目录
 *
 * @param {string} dir 待判断的目录
 * @returns {boolean} 以流水线入口 modLoad/toData.js 为标志
 */
function looksLikeCoreDir(dir) {
    return fs.existsSync(path.join(dir, 'modLoad', 'toData.js'));
}

/** 加载 core 模块时的查找顺序：core 分支工作区优先，工作区副本兜底 */
export const CORE_MODULE_DIRS = [CORE_BRANCH_DIR, CORE_COPY_DIR].filter(looksLikeCoreDir);

/**
 * require 一个 core 模块（走 Node 的模块缓存，需要新代码时先 clearCoreModules）
 *
 * @param {string} relPath 相对某个 core 目录的路径（用 `/` 分隔），如 `modLoad/toData.js`
 * @returns {any} 模块导出
 * @throws {Error} 两边都找不到时抛出可读错误
 */
export function requireCoreModule(relPath) {
    for (const dir of CORE_MODULE_DIRS) {
        const entry = path.join(dir, relPath);
        if (fs.existsSync(entry)) return require(entry);
    }
    throw new Error(`未找到 ${relPath}（已找过 ${[CORE_BRANCH_DIR, CORE_COPY_DIR].join(' 与 ')}），请先运行「同步后端（core → 本工作区）」任务`);
}

/**
 * 清掉 require 缓存里所有来自 core 的模块（分支工作区与工作区副本都算）
 *
 * coreWatcher 收到变更后调用：否则 Node 一直返回旧代码，改完 core 只能重启 dev server 才生效。
 *
 * @returns {string[]} 被清掉的模块（相对所在 core 目录的路径），供日志展示
 */
export function clearCoreModules() {
    const prefixes = [CORE_BRANCH_DIR, CORE_COPY_DIR].map((dir) => dir + path.sep);
    /** @type {string[]} */
    const cleared = [];
    for (const key of Object.keys(require.cache)) {
        const hit = prefixes.find((prefix) => key.startsWith(prefix));
        if (!hit) continue;
        cleared.push(path.relative(hit, key).split(path.sep).join('/'));
        delete require.cache[key];
    }
    return cleared;
}
