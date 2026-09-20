'use strict';

/**
 * core/service/host.js —— 服务层在 **vscode 环境**下的绑定层
 *
 * 本文件是 `core/service/` 里唯一 require vscode 的模块，职责只有四件：
 *
 *   1. **给服务层找地方落盘**：`context.storageUri`（工作区级；没打开工作区时退回
 *      `globalStorageUri`）——缓存不进用户工作区，不产生需要 .gitignore 的垃圾文件；
 *   2. **读设置**：快速加载 / 工作区监听 / 防抖时长 / 画布文档自动保存 / 增量降级阈值；
 *   3. **文件监听**：mod 工作区的 `.json` 增删改 → 防抖 → `service.refreshMod()` → 回调上层回发消息；
 *   4. **生命周期**：服务实例惰性创建，扩展停用时释放（监听器、缓存）。
 *
 * 上层（`core/modLoad/handlers.js`）只调 `host.*`，不直接碰 watcher 与设置；
 * 服务层（`core/service/index.js`）则完全不认识 vscode。
 */

const os = require('os');
const path = require('path');
const vscode = require('vscode');
const serviceApi = require('./index');

/** 监听时忽略的路径片段（依赖、版本库、缓存目录自身） */
const WATCH_IGNORE = [`${path.sep}node_modules${path.sep}`, `${path.sep}.git${path.sep}`, `${path.sep}.vscode${path.sep}`];

/** @type {import('vscode').ExtensionContext|null} 当前扩展上下文 */
let context = null;
/** @type {ReturnType<typeof serviceApi.createService>|null} 服务层实例 */
let service = null;
/** @type {import('vscode').FileSystemWatcher|null} 工作区监听器 */
let watcher = null;
/** @type {NodeJS.Timeout|null} 防抖定时器 */
let debounceTimer = null;
/** @type {Set<string>} 防抖窗口内累积的变化文件 */
let pendingChanges = new Set();
/** @type {((result: any) => void)|null} 变化回调（由 handlers 注入） */
let onChanged = null;
/** @type {string|null} 当前监听的 mod 根目录 */
let watchedRoot = null;

/**
 * 扩展激活时调用：记住上下文（服务实例与监听器按需创建）。
 *
 * @param {import('vscode').ExtensionContext} ctx - 扩展上下文
 * @returns {void}
 */
function activate(ctx) {
    context = ctx;
}

/**
 * 取服务层实例（惰性创建，进程内单例）。
 *
 * @returns {ReturnType<typeof serviceApi.createService>} 服务层实例
 */
function getService() {
    if (service) return service;

    const extensionRoot = context ? context.extensionUri.fsPath : path.resolve(__dirname, '..', '..');
    service = serviceApi.createService({
        extensionRoot,
        storageDir: storageDirOf(),
        log: (message) => console.log(message),
        warn: (message) => console.warn(message),
    });
    return service;
}

/**
 * 缓存根目录：工作区级 storageUri 优先，没有工作区时退回 globalStorageUri，
 * 两者都没有（不应发生）时退到系统临时目录（缓存丢失可接受，不影响功能）。
 *
 * @returns {string} 缓存根目录绝对路径
 */
function storageDirOf() {
    const uri = context && (context.storageUri || context.globalStorageUri);
    if (uri) return uri.fsPath;
    return path.join(os.tmpdir(), 'cne-service');
}

/**
 * 读扩展设置。
 *
 * @returns {{
 *     quickLoad: boolean; watchWorkspace: boolean; watchDebounce: number;
 *     autoSaveDoc: boolean; snapshotPercent: number; preloadOrigin: boolean;
 * }} 当前设置
 */
function settings() {
    const cfg = vscode.workspace.getConfiguration('cultistNodeEditor');
    return {
        quickLoad: cfg.get('quickLoad', true),
        watchWorkspace: cfg.get('watchWorkspace', true),
        watchDebounce: Math.max(50, Number(cfg.get('watchDebounce', 300)) || 300),
        autoSaveDoc: cfg.get('autoSaveDoc', true),
        snapshotPercent: Math.min(100, Math.max(1, Number(cfg.get('snapshotPercent', 40)) || 40)),
        preloadOrigin: cfg.get('preloadOrigin', true),
    };
}

/**
 * 画布文档的缓存键：一个工作区一份（没打开工作区时用 `global`）。
 *
 * @returns {string} 文档键
 */
function docKey() {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length ? folders[0].uri.fsPath : 'global';
}

/**
 * 注册设置变更监听：改了「快速加载」或「监听」相关项时无需重开编辑器即可生效。
 *
 * @param {import('vscode').ExtensionContext} ctx - 扩展上下文（用于登记订阅以便随扩展释放）
 * @returns {void}
 */
function watchSettings(ctx) {
    ctx.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (!event.affectsConfiguration('cultistNodeEditor')) return;
            const cfg = settings();
            console.log(
                `⚙️ 服务层设置变更：快速加载=${cfg.quickLoad}、工作区监听=${cfg.watchWorkspace}、防抖=${cfg.watchDebounce}ms`
            );
            if (!cfg.watchWorkspace) unwatchMod();
        })
    );
}

/**
 * 开始监听某个 mod 工作区（`.json` 的新增 / 修改 / 删除）。
 *
 * 变化先累积再防抖（编辑器保存一次可能触发多个事件），窗口结束后统一重载一次：
 * 只重新解析变化的文件，建图后与上一张图比对，回调里带 `patch` 供前端局部应用。
 *
 * @param {string} modRoot - mod 根目录绝对路径
 * @param {(result: any) => void} handler - 重载完成后的回调（参数为 `service.refreshMod` 的结果）
 * @returns {boolean} 是否真的开始监听（设置里关掉了监听时为 false）
 */
function watchMod(modRoot, handler) {
    if (!modRoot) return false;
    const cfg = settings();
    if (!cfg.watchWorkspace) {
        console.log('⏭️ 已关闭工作区监听（设置 cultistNodeEditor.watchWorkspace）');
        return false;
    }

    unwatchMod();
    watchedRoot = modRoot;
    onChanged = handler;

    watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(modRoot, '**/*.json'));
    const schedule = (uri) => {
        const filePath = uri.fsPath;
        if (WATCH_IGNORE.some((frag) => filePath.includes(frag))) return;
        pendingChanges.add(filePath);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flushChanges, cfg.watchDebounce);
    };

    watcher.onDidChange(schedule);
    watcher.onDidCreate(schedule);
    watcher.onDidDelete(schedule);

    console.log(`👀 已开始监听 mod 工作区：${modRoot}（防抖 ${cfg.watchDebounce}ms）`);
    return true;
}

/**
 * 防抖窗口结束：重载并回调。
 *
 * @returns {void}
 */
function flushChanges() {
    debounceTimer = null;
    const changed = Array.from(pendingChanges);
    pendingChanges = new Set();
    if (!watchedRoot || !onChanged) return;

    try {
        const result = getService().refreshMod(watchedRoot);
        result.changedFiles = changed;
        onChanged(result);
    } catch (error) {
        console.error('🚨 工作区变化后重载失败：', error);
    }
}

/**
 * 停止监听。
 *
 * @returns {void}
 */
function unwatchMod() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    pendingChanges = new Set();
    if (watcher) {
        watcher.dispose();
        watcher = null;
        console.log('🛑 已停止监听 mod 工作区');
    }
    watchedRoot = null;
    onChanged = null;
}

/**
 * 是否正在监听某个目录。
 *
 * @returns {string|null} 正在监听的 mod 根目录（未监听时为 null）
 */
function watchedDir() {
    return watchedRoot;
}

/**
 * 释放服务层持有的全部资源（扩展停用时调用）。
 *
 * @returns {void}
 */
function dispose() {
    unwatchMod();
    if (service) {
        service.dispose();
        service = null;
    }
    context = null;
}

module.exports = {
    activate,
    watchSettings,
    getService,
    storageDirOf,
    settings,
    docKey,
    watchMod,
    unwatchMod,
    watchedDir,
    dispose,
};
