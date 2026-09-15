/**
 * 与扩展宿主通信的桥。
 *
 * 两个方向：
 *   · 扩展 → webview：`window.NODE_EDITOR_CONFIG`（由 core 的 frontend-host 注入）与 postMessage；
 *   · webview → 扩展：postToHost(command, payload)。
 *
 * ⚠️ `acquireVsCodeApi()` 每个 webview 只能调用一次，所以这里缓存住；
 *    在浏览器里直接开 dev server 调试时它不存在，退化成 console 日志。
 */

/** 扩展注入的配置（core/frontend-host 的 buildConfig 产出；没注入时为空对象） */
export const hostConfig = { ...(globalThis.NODE_EDITOR_CONFIG ?? {}) };

/** @type {ReturnType<typeof acquireVsCodeApi>|null} */
let api = null;

/**
 * 惰性获取 VS Code API（每个 webview 只允许调用一次 acquireVsCodeApi）。
 * @returns {object|null} 不在 webview 里时返回 null
 */
function getApi() {
    if (api) return api;
    if (typeof acquireVsCodeApi !== 'function') return null;

    api = acquireVsCodeApi();
    return api;
}

/**
 * 给扩展发消息。
 * @param {string} command 命令名（扩展侧 switch 的分支，如 readMod / saveGraph）
 * @param {object} [payload] 附带的参数
 */
export function postToHost(command, payload = {}) {
    const target = getApi();
    if (target) target.postMessage({ command, ...payload });
    else console.info('[bridge] 不在 webview 里，跳过消息:', command, payload);
}

/**
 * 注册「扩展发来消息」的处理器。
 * @param {(message: {command?: string, [key: string]: unknown}) => void} handler 处理器
 */
export function onHostMessage(handler) {
    window.addEventListener('message', (event) => handler(event.data ?? {}));
}

/**
 * 接上宿主：读取配置、注册通用消息日志。挂载 Vue 之前调用一次。
 */
export function installHostBridge() {
    onHostMessage((message) => {
        // 骨架阶段只做记录；真正的分派（加载 mod、同步变量…）随迁移逐步接进来
        if (message.command) console.debug('[bridge] 收到扩展消息:', message);
    });

    if (hostConfig.previewMode) {
        document.body.classList.add('preview-mode');
    }
}
