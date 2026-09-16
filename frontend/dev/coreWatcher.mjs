/**
 * frontend/dev/coreWatcher.mjs —— 开发时监视 `core` 分支代码：改动即同步 + 整页刷新
 * （**只在本工作区开发时生效**，不进 VSIX）
 *
 * 背景：后端（`core/**`、`extension.js`、`frontend-host/index.js`）只在 `core` 分支的工作区里改，
 * 本工作区的副本靠 `.vscode/tasks.json` 的「同步后端」任务手动拷（scripts/sync-backend.mjs）。
 * 开发时每改一次后端就要「手动跑任务 + 手动刷浏览器」，很啰嗦 —— 本插件把这两步接到 dev server 上：
 *
 *   core 分支工作区里「会被同步」的文件有改动
 *     → 清掉 require 缓存里的 core 模块（dev server 读的就是 core 分支工作区的代码，见 coreModules.mjs）
 *     → 让浏览器整页刷新（core 的改动发生在 dev server 一侧，Vite 的 HMR 管不到）
 *     → 顺带把工作区 core 副本同步一遍（扩展宿主 / 单元测试读副本，见 .vscode/tasks.json）
 *
 * **先确认内容真的变了再刷新**：事件来了不等于内容变了（编辑器保存、`touch`、`git` 操作、
 * 别的会话跑测试都会产生事件）。每轮先比指纹 —— 大小 + mtime 没变就直接跳过，变了才读内容算哈希；
 * 内容没变就不刷新。刷新只看 `core/`（dev server 依赖的只有它），其余文件的改动只触发副本同步。
 *
 * 开关与路径：
 *   CNE_CORE_WATCH=0     关闭监视（默认开启）
 *   CNE_CORE_SYNC=0      只热重载、不同步工作区副本（默认开）
 *   CNE_CORE_DIR=<路径>  指定 core 分支工作区（默认见 frontend/dev/coreModules.mjs）
 *
 * ⚠️ 只监听「会被同步的那几处」（`core/`、`myLint/`、`test/`、`frontend-host/index.js` 与仓库根清单文件），
 *    core 工作区的 `node_modules/`、`.git/` 与 `core/origin_resources/images/`（233MB 素材，走 CDN）不参与。
 * ⚠️ 同一个工作区可能同时开着多个 dev server（各自都装了本插件），或有人手动跑「同步后端」任务 ——
 *    两个 `cpSync` 并发覆盖同一批文件时，Windows 会报
 *    `Error: , The operation completed successfully. (...) syscall: 'unlink'`。
 *    所以同步前先拿系统临时目录里的锁（见 acquireSyncLock），失败还会在锁内重试一次。
 * ⚠️ 改 `extension.js` / `core/` 这类**扩展宿主**代码后：浏览器（webview 或纯浏览器）刷新能拿到新前端，
 *    但宿主那个 Node 进程不会重启 —— 那部分仍需重新加载窗口。纯浏览器调试（`pnpm run dev`）不涉及。
 * ⚠️ 只在 `apply: 'serve'` 下工作；`build` / `preview` 完全不参与。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CORE_MODULE_DIRS, CORE_WORKTREE_DIR, WORKSPACE_ROOT, clearCoreModules } from './coreModules.mjs';

/** 开关环境变量（=0 / =false 时关闭监视） */
const WATCH_ENV = 'CNE_CORE_WATCH';
/** 关闭「顺带同步工作区 core 副本」的环境变量（=0 / =false） */
const SYNC_ENV = 'CNE_CORE_SYNC';
/** 抖动窗口：编辑器保存、`git checkout/merge core` 都会连发多个事件，静默这么久才同步一次 */
const DEBOUNCE_MS = 400;
/** 同步脚本（相对 core 工作区根） */
const SYNC_SCRIPT_REL = 'scripts/sync-backend.mjs';
/** 同步失败后的重试间隔（并发冲突多为瞬时） */
const RETRY_DELAY_MS = 600;
/** 同步锁：等多久还没轮到自己就硬上（避免饿死） */
const LOCK_WAIT_MS = 20000;
/** 同步锁：轮询间隔 */
const LOCK_POLL_MS = 150;
/** 同步锁：超过这个岁数的锁文件视为上一个进程崩了留的残留，直接清掉 */
const LOCK_STALE_MS = 60000;

/**
 * 关注范围内每个文件的内容指纹：相对路径 → { size, mtimeMs, hash }
 *
 * 用来过滤「事件有了但内容没变」的假变更（编辑器保存、`touch`、git 操作、别的会话跑测试）。
 * 记录里的 size + mtimeMs 是便宜判断（不用读文件），hash 是内容层面的最终判断。
 */
const fingerprints = new Map();

/**
 * 监听的目录（相对 core 工作区根）与是否递归
 *
 * 根目录与 `frontend-host/` 用非递归：只需要它们**直接子级**的清单文件与 `index.js`，
 * 这样 `node_modules/`、`nodes/` 之类不会被拖进来。
 */
const WATCH_DIRS = [
    { rel: '.', recursive: false },
    { rel: 'core', recursive: true },
    { rel: 'frontend-host', recursive: false },
    { rel: 'myLint', recursive: true },
    { rel: 'test', recursive: true },
];

/** core 仓库根下会被同步的清单文件（与 scripts/sync-backend.mjs 的 ENTRIES 对齐） */
const ROOT_FILES = new Set([
    '.vscodeignore',
    'README.md',
    'customInterface.d.ts',
    'env.d.ts',
    'eslint.config.mjs',
    'extension.js',
    'jsconfig.json',
    'package.json',
    'pnpm-workspace.yaml',
    'types.d.ts',
]);

/** 路径里出现这些目录名就忽略（与 .gitignore 对齐：依赖、产物、agent 临时区） */
const IGNORED_SEGMENTS = new Set(['node_modules', '.git', '.vscode-test', 'agent-scratch', 'dist', 'coverage']);

/** 忽略的路径前缀（同步本来就跳过，见 sync-backend.mjs 的 SKIP_PATHS） */
const IGNORED_PREFIXES = ['core/origin_resources/images/'];

/**
 * 是否开启监视
 *
 * @param {Record<string, string|undefined>} [env] 环境变量（默认 process.env）
 * @returns {boolean}
 */
function isEnabled(env = process.env) {
    const raw = env[WATCH_ENV];
    return raw !== '0' && raw !== 'false';
}

/**
 * 是否顺带同步工作区 core 副本
 *
 * 热重载本身不依赖同步（dev server 直接读 core 分支工作区），这一步只是为了
 * 让扩展宿主 / 单元测试读到的副本也保持最新。
 *
 * @param {Record<string, string|undefined>} [env] 环境变量（默认 process.env）
 * @returns {boolean}
 */
function isSyncEnabled(env = process.env) {
    const raw = env[SYNC_ENV];
    return raw !== '0' && raw !== 'false';
}

/**
 * 该文件是否属于「会被同步进本工作区」的范围
 *
 * @param {string} rel 相对 core 工作区根、用 `/` 分隔的路径
 * @returns {boolean} 是则返回 true
 */
function isRelevant(rel) {
    if (IGNORED_PREFIXES.some((prefix) => rel.startsWith(prefix))) return false;
    if (rel.split('/').some((seg) => IGNORED_SEGMENTS.has(seg))) return false;
    if (rel.startsWith('core/') || rel.startsWith('myLint/') || rel.startsWith('test/')) return true;
    return rel === 'frontend-host/index.js' || ROOT_FILES.has(rel);
}

/**
 * 把文件清单说成人话（最多列 3 个）
 *
 * @param {string[]} files 相对 core 工作区根的路径
 * @returns {string} 例如 `core/modLoad/toData.js`、`a.js、b.js、c.js 等 8 个文件`
 */
function describe(files) {
    const shown = files.slice(0, 3).join('、');
    return files.length > 3 ? `${shown} 等 ${files.length} 个文件` : shown;
}

/**
 * 递归列出目录下的文件（相对 core 工作区根），只保留会被同步的那些
 *
 * @param {string} absDir 目录绝对路径
 * @param {boolean} recursive 是否递归子目录
 * @returns {string[]} 相对路径列表（用 `/` 分隔）
 */
function listFiles(absDir, recursive) {
    /** @type {string[]} */
    const out = [];
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const abs = path.join(absDir, entry.name);
        const rel = path.relative(CORE_WORKTREE_DIR, abs).split(path.sep).join('/');
        if (!isRelevant(rel)) continue;
        if (entry.isDirectory()) {
            if (recursive) out.push(...listFiles(abs, true));
        } else {
            out.push(rel);
        }
    }
    return out;
}

/**
 * 把事件路径展开成「要检查指纹的文件清单」
 *
 * @param {string[]} relPaths 本轮事件涉及的路径；空数组表示事件没给文件名（只能全量扫描）
 * @returns {{files: string[], full: boolean}} 待检查文件，以及是否全量（全量时还能发现被删的文件）
 */
function expandTargets(relPaths) {
    if (relPaths.length === 0) {
        /** @type {string[]} */
        const all = [];
        for (const { rel, recursive } of WATCH_DIRS) {
            const abs = path.join(CORE_WORKTREE_DIR, rel);
            if (fs.existsSync(abs)) all.push(...listFiles(abs, recursive));
        }
        return { files: all, full: true };
    }
    /** @type {string[]} */
    const files = [];
    for (const rel of relPaths) {
        const abs = path.join(CORE_WORKTREE_DIR, rel);
        let isDir = false;
        try {
            isDir = fs.statSync(abs).isDirectory();
        } catch {
            // 已不存在：可能是文件被删，也可能是目录被删（下面按指纹里的子项判断）
        }
        if (isDir) files.push(...listFiles(abs, true));
        else files.push(rel);
    }
    return { files, full: false };
}

/**
 * 判断一个文件的内容相对上次检查是否真的变了，并把新指纹记下来
 *
 * 两级判断：先比大小 + mtime，没变就直接返回（连文件都不读）；变了才读内容算哈希 ——
 * 编辑器保存、`touch`、git 操作经常只改 mtime，这种情况不该触发刷新。
 *
 * @param {string} rel 相对 core 工作区根的路径
 * @returns {boolean} 内容是否真的变了
 */
function isContentChanged(rel) {
    const abs = path.join(CORE_WORKTREE_DIR, rel);
    const prev = fingerprints.get(rel);
    /** @type {import('node:fs').Stats|null} */
    let stat = null;
    try {
        stat = fs.statSync(abs);
    } catch {
        // 文件（或整个目录）没了
    }

    if (!stat) {
        if (prev) {
            fingerprints.delete(rel);
            return true;
        }
        // 可能是个被删掉的目录：看指纹里有没有以它为前缀的子项
        const prefix = `${rel}/`;
        const kids = [...fingerprints.keys()].filter((key) => key.startsWith(prefix));
        for (const key of kids) fingerprints.delete(key);
        return kids.length > 0;
    }
    if (stat.isDirectory()) return false;
    if (prev && prev.size === stat.size && prev.mtimeMs === stat.mtimeMs) return false;

    /** @type {string} */
    let hash;
    try {
        hash = createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
    } catch {
        return false; // 读不到（被占用等）：当没变，等下次事件再判
    }
    fingerprints.set(rel, { size: stat.size, mtimeMs: stat.mtimeMs, hash });
    return !prev || prev.hash !== hash;
}

/**
 * 收集本轮「内容真的变了」的文件
 *
 * @param {string[]} files 待检查文件（相对 core 工作区根）
 * @param {boolean} full 是否全量扫描；全量时指纹里多出来的条目说明文件被删了
 * @returns {string[]} 内容有变的文件
 */
function collectChanged(files, full) {
    /** @type {string[]} */
    const changed = [];
    const seen = new Set();
    for (const rel of files) {
        seen.add(rel);
        if (isContentChanged(rel)) changed.push(rel);
    }
    if (full) {
        for (const rel of [...fingerprints.keys()]) {
            if (seen.has(rel)) continue;
            fingerprints.delete(rel);
            changed.push(rel);
        }
    }
    return changed;
}

/**
 * 建立内容指纹基线（dev server 启动时跑一次）
 *
 * 这一遍会把关注的文件（约 20MB）全读一次算哈希，之后就不会再莫名其妙地全红了：
 * mtime + 大小没变就直接跳过，变了才读内容比哈希。
 *
 * @returns {{count: number, ms: number}} 建立基线的文件数与耗时
 */
function seedFingerprints() {
    const started = Date.now();
    let count = 0;
    for (const rel of expandTargets([]).files) {
        const abs = path.join(CORE_WORKTREE_DIR, rel);
        try {
            const stat = fs.statSync(abs);
            fingerprints.set(rel, {
                size: stat.size,
                mtimeMs: stat.mtimeMs,
                hash: createHash('sha1').update(fs.readFileSync(abs)).digest('hex'),
            });
            count += 1;
        } catch {
            // 读不到就跳过，等事件再处理
        }
    }
    return { count, ms: Date.now() - started };
}

/**
 * 把同步失败的输出压成一行（子进程会把整段堆栈吐出来，全打日志太吵）
 *
 * @param {string} output 子进程的 stdout+stderr
 * @returns {string} Error 行（找不到时退回最后一行）
 */
function summarizeFailure(output) {
    const lines = output.trim().split(/\r?\n/);
    return lines.find((line) => line.startsWith('Error:')) || lines[lines.length - 1] || '(无输出)';
}

/**
 * 同步锁文件路径
 *
 * 同一个工作区可能被多个进程同时同步（多个 dev server、或手动跑「同步后端」任务），
 * 两个 `cpSync` 并发覆盖同一批文件时 Windows 会报伪错误，所以用一把跨进程的锁把它们排开。
 * 锁放在系统临时目录，不污染工作区；按工作区路径区分，不同工作区互不影响。
 *
 * @returns {string} 锁文件绝对路径
 */
function syncLockPath() {
    const key = createHash('sha1').update(WORKSPACE_ROOT.toLowerCase()).digest('hex').slice(0, 12);
    return path.join(os.tmpdir(), `cne-core-sync-${key}.lock`);
}

/**
 * 读文件 mtime
 *
 * @param {string} file 文件路径
 * @returns {number} 毫秒时间戳；拿不到时返回 NaN
 */
function statMtime(file) {
    try {
        return fs.statSync(file).mtimeMs;
    } catch {
        return Number.NaN;
    }
}

/**
 * 等待指定毫秒
 *
 * @param {number} ms 毫秒数
 * @returns {Promise<void>} 到点后 resolve
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 取同步锁（独占创建锁文件）；拿到后返回释放函数
 *
 * 已有锁时轮询等待，等不到（或锁文件过旧，视为上一个进程崩了）就放行本次同步 ——
 * 宁可偶尔并发一次，也不要因为残留锁文件把热更新卡死。释放函数幂等。
 *
 * @returns {Promise<() => void>} 释放函数
 */
async function acquireSyncLock() {
    const lockPath = syncLockPath();
    const deadline = Date.now() + LOCK_WAIT_MS;
    let waited = false;
    for (;;) {
        try {
            const fd = fs.openSync(lockPath, 'wx');
            fs.writeSync(fd, `${process.pid}\n`);
            fs.closeSync(fd);
            if (waited) console.log('   ↳ 等到了上一次同步结束，继续本次同步');
            return () => {
                try {
                    fs.unlinkSync(lockPath);
                } catch {
                    // 已被其它进程清理，忽略
                }
            };
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.warn(`⚠️ [core-watch] 同步锁不可用（${error.message}），直接同步`);
                return () => {};
            }
        }
        const age = Date.now() - statMtime(lockPath);
        if (Number.isFinite(age) && age > LOCK_STALE_MS) {
            try {
                fs.unlinkSync(lockPath);
            } catch {
                // 另一个进程也在抢，谁抢到算谁的
            }
            continue;
        }
        if (Date.now() >= deadline) {
            console.warn('⚠️ [core-watch] 等待同步锁超时，仍继续本次同步（可能并发覆盖）');
            return () => {};
        }
        waited = true;
        await sleep(LOCK_POLL_MS);
    }
}

/**
 * 跑一次「同步后端」（异步，不阻塞 dev server）
 *
 * @returns {Promise<{ok: boolean, output: string}>} 子进程退出码是否为 0，以及合并后的 stdout+stderr
 */
function runSync() {
    const script = path.join(CORE_WORKTREE_DIR, SYNC_SCRIPT_REL);
    return new Promise((resolve) => {
        if (!fs.existsSync(script)) {
            resolve({ ok: false, output: `找不到同步脚本 ${script}` });
            return;
        }
        const child = spawn(process.execPath, [script, WORKSPACE_ROOT, '--core', CORE_WORKTREE_DIR], { cwd: WORKSPACE_ROOT });
        /** @type {string[]} */
        const chunks = [];
        child.stdout.on('data', (chunk) => chunks.push(String(chunk)));
        child.stderr.on('data', (chunk) => chunks.push(String(chunk)));
        child.on('error', (error) => resolve({ ok: false, output: error.message }));
        child.on('close', (code) => resolve({ ok: code === 0, output: chunks.join('') }));
    });
}

/**
 * Vite 插件：监视 core 工作区，后端代码改动 → 自动同步 + 浏览器整页刷新
 *
 * @returns {import('vite').Plugin} Vite 插件对象
 */
export default function coreWatcher() {
    return {
        name: 'cne-core-watch',
        // 只在 dev server 生效（build / preview 不需要）
        apply: 'serve',
        configureServer(server) {
            if (!isEnabled()) {
                console.log('[core-watch] CNE_CORE_WATCH=0，未开启 core 变更监视');
                return;
            }
            if (!fs.existsSync(path.join(CORE_WORKTREE_DIR, 'extension.js'))) {
                console.warn(`⚠️ [core-watch] ${CORE_WORKTREE_DIR} 不像 core 分支工作区（没有 extension.js），未开启监视`);
                return;
            }

            /** 本轮抖动窗口内改动过的文件（相对 core 工作区根） */
            const pending = new Set();
            /** 本轮里有「拿不到文件名」的事件：只能全量比对指纹 */
            let pendingFuzzy = false;
            /** @type {ReturnType<typeof setTimeout>|null} */
            let timer = null;
            /** 同步进行中（同一时刻只跑一个 sync-backend.mjs） */
            let syncing = false;
            /** 同步期间又攒了新改动：跑完再补一次 */
            let dirtyWhileSyncing = false;

            /**
             * 同步 core → 本工作区的 core 副本（扩展宿主 / 单元测试读的是副本）
             *
             * 在跨进程锁内进行，失败还会重试一次（并发覆盖多为瞬时冲突）。
             * 这一步不影响浏览器侧的热重载体验，纯粹是把副本补齐。
             */
            async function syncCopy() {
                const release = await acquireSyncLock();
                try {
                    const started = Date.now();
                    let { ok, output } = await runSync();
                    if (!ok) {
                        await sleep(RETRY_DELAY_MS);
                        ({ ok, output } = await runSync());
                    }
                    if (ok) {
                        console.log(`   ↳ 工作区 core 副本已同步（${Date.now() - started} ms）`);
                        if (output.includes('pnpm install')) {
                            console.log('   ↳ core 的依赖有变化，请跑一次 pnpm install');
                        }
                    } else {
                        console.warn(`   ↳ 工作区 core 副本同步失败（重试后仍失败）：${summarizeFailure(output)}`);
                    }
                } finally {
                    release();
                }
            }

            /**
             * 处理一轮抖动：先确认内容是不是真的变了，再决定刷不刷新 / 要不要同步副本
             *
             * @param {string[]} relPaths 本轮事件涉及的路径；空数组表示事件没给文件名（只能全量比对）
             */
            async function applyChange(relPaths) {
                if (syncing) {
                    dirtyWhileSyncing = true;
                    return;
                }
                syncing = true;
                try {
                    const { files, full } = expandTargets(relPaths);
                    const changed = collectChanged(files, full);
                    if (changed.length === 0) {
                        console.log(`· [core-watch] ${relPaths.length ? `${relPaths.length} 个事件` : '一轮无文件名事件'}，内容没变，不刷新`);
                    } else {
                        // ① dev server 依赖的只有 core/：它真的变了才清缓存 + 整页刷新
                        //    （读的就是 core 分支工作区的代码，见 coreModules.mjs，不必等同步完成）
                        if (changed.some((rel) => rel.startsWith('core/'))) {
                            const cleared = clearCoreModules();
                            const hot = server.hot ?? server.ws;
                            hot?.send({ type: 'full-reload', path: '*' });
                            console.log(`🔁 [core-watch] ${describe(changed)} 内容有变 → 已重载（清掉 core 模块缓存 ${cleared.length} 个）`);
                        } else {
                            console.log(`· [core-watch] ${describe(changed)} 有改动，但不在 core/ 里（dev 预览用不到，不刷新）`);
                        }

                        // ② 顺带同步工作区副本（扩展宿主 / 单元测试用；CNE_CORE_SYNC=0 可关掉）
                        if (isSyncEnabled()) await syncCopy();
                    }
                } finally {
                    syncing = false;
                }
                if (dirtyWhileSyncing) {
                    dirtyWhileSyncing = false;
                    schedule();
                }
            }

            /**
             * 起抖动计时器：静默 DEBOUNCE_MS 后把攒下的改动一次性处理
             */
            function schedule() {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    timer = null;
                    const relPaths = [...pending];
                    const fuzzy = pendingFuzzy;
                    pending.clear();
                    pendingFuzzy = false;
                    void applyChange(fuzzy ? [] : relPaths);
                }, DEBOUNCE_MS);
            }

            // 先建内容指纹基线（启动时读一遍，约 20MB），否则第一批事件会把所有文件都当成新的
            const baseline = seedFingerprints();

            /** @type {fs.FSWatcher[]} */
            const watchers = [];
            for (const { rel, recursive } of WATCH_DIRS) {
                const dir = path.join(CORE_WORKTREE_DIR, rel);
                if (!fs.existsSync(dir)) continue;
                const watcher = fs.watch(dir, { recursive }, (eventType, filename) => {
                    const changed = filename ? path.relative(CORE_WORKTREE_DIR, path.join(dir, filename)).split(path.sep).join('/') : '';
                    // 拿不到文件名时：根目录（无关文件多）忽略，其余（core/ 等）标记为「只能全量比对」
                    if (changed ? !isRelevant(changed) : rel === '.') return;
                    if (changed) pending.add(changed);
                    else pendingFuzzy = true;
                    schedule();
                });
                watcher.on('error', (error) => console.warn(`⚠️ [core-watch] 监视 ${dir} 出错：${error.message}`));
                watchers.push(watcher);
            }

            console.log(`👀 [core-watch] 监视 core 分支工作区：${CORE_WORKTREE_DIR}`);
            console.log(`   dev 加载 core 代码：${CORE_MODULE_DIRS[0] || '(没找到，请先跑「同步后端」任务)'}`);
            console.log(`   内容指纹基线：${baseline.count} 个文件 / ${baseline.ms} ms（内容没变不刷新）`);
            console.log(`   ${isSyncEnabled() ? '变更后顺带同步工作区 core 副本' : '不同步工作区 core 副本（CNE_CORE_SYNC=0）'}`);
            server.httpServer?.once('close', () => {
                for (const watcher of watchers) watcher.close();
                if (timer) clearTimeout(timer);
            });
        },
    };
}
