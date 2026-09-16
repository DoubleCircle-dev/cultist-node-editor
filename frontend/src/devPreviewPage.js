/**
 * frontend/src/devPreviewPage.js —— 纯浏览器调试用的「预览 json」回退（子页面一侧）
 *
 * 由父页面（frontend/src/devPreview.js）新开的本页构成预览页面，对齐扩展里宿主的行为：
 * 预览页面会带 `?cneDevPreview=1`，本模块据此
 *   1）在 index.js 读取配置**之前**注入 `previewMode`（隐藏侧栏/顶栏/状态栏，仅查看）；
 *   2）控制器就绪后取出父页面暂存的 json，经 dev server 转成节点图，以 `jsonPreviewLoaded`
 *      消息铺图（消息与数据形状都与宿主发来的一致，走同一条处理链路）。
 *
 * 真正的转换在 dev server 侧（`frontend/dev/devPreviewApi.mjs`），复用 core 的同一套函数：
 * 本工作区不维护、也不复制 core 的解析 / 建图规则，避免浏览器里看到的结果与扩展里不一致。
 *
 * ⚠️ 仅开发用，且只认 http(s) 页面（真实 webview 是 vscode-webview://，不受影响）。
 */
import { DEV_PREVIEW_KEY, DEV_PREVIEW_PARAM } from './devPreview.js';

/** dev server 接口路径；与 frontend/dev/devPreviewApi.mjs 的 ROUTE 保持一致 */
const DEV_API = '/__cne-dev/json-preview';

/** 是否「dev 预览子页面」（真实 webview 的协议不是 http(s)，不会命中） */
const IS_DEV_PREVIEW_PAGE = /^https?:$/.test(location.protocol) && new URLSearchParams(location.search).has(DEV_PREVIEW_PARAM);

/**
 * 等前端控制器就绪
 *
 * `window.controlCore` 只在 ControllerCore 实例化完成后才非空（见 index.js 的 initWebview），
 * 比「估一个固定延时」可靠。
 *
 * @param {number} timeoutMs 超时（毫秒）
 * @returns {Promise<boolean>} 是否在超时前就绪
 */
function whenAppReady(timeoutMs = 10000) {
    return new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const tick = () => {
            if (window.controlCore) {
                resolve(true);
                return;
            }
            if (Date.now() > deadline) {
                resolve(false);
                return;
            }
            setTimeout(tick, 50);
        };
        tick();
    });
}

/**
 * 取父页面暂存的待预览 json
 *
 * @returns {{fileName: string, text: string, categoryHint?: string} | null} 暂存内容（无则 null）
 */
function readStaged() {
    try {
        const raw = localStorage.getItem(DEV_PREVIEW_KEY);
        if (!raw) return null;
        const payload = JSON.parse(raw);
        return payload && typeof payload.text === 'string' ? payload : null;
    } catch {
        return null;
    }
}

/**
 * 在预览页面里报错
 *
 * 预览模式隐藏了状态栏（`body.preview-mode .status-bar`），只发 `error` 消息会看不到，
 * 故同时打日志并弹窗提示。
 *
 * @param {string} message 错误文本
 */
function reportError(message) {
    console.error(`[dev] ${message}`);
    window.postMessage({ command: 'error', message }, '*');
    window.alert(message);
}

/** 取暂存内容 → dev server 转换 → 以 jsonPreviewLoaded 铺图 */
async function loadPreview() {
    const staged = readStaged();
    if (!staged) {
        reportError('没有待预览的 json：请回到主页面点「👁️ 预览json」重新选择文件');
        return;
    }

    try {
        const response = await fetch(DEV_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: staged.fileName,
                text: staged.text,
                categoryHint: staged.categoryHint || '',
            }),
        });
        // dev server 没有该路由时会回落到 index.html（200 + text/html），据此给出可操作的提示
        const type = response.headers.get('content-type') || '';
        if (!response.ok || !type.includes('application/json')) {
            throw new Error(`dev server 未提供 ${DEV_API}（请用 pnpm run dev 重启开发服务器）`);
        }
        const result = await response.json();
        if (!result.ok) throw new Error(result.error || '转换失败');

        console.log(`[dev] 子页面预览: ${staged.fileName} → ${result.data.category}`);
        window.postMessage({ command: 'jsonPreviewLoaded', data: result.data }, '*');
    } catch (error) {
        reportError(`浏览器预览失败: ${error.message}`);
    }
}

if (IS_DEV_PREVIEW_PAGE) {
    // 对齐宿主：预览模式由 NODE_EDITOR_CONFIG.previewMode 触发（须早于 index.js 读取该配置）
    window.NODE_EDITOR_CONFIG = Object.assign({}, window.NODE_EDITOR_CONFIG, { previewMode: true });
    whenAppReady().then((ready) => {
        if (!ready) reportError('节点编辑器初始化超时，无法预览 json');
        else loadPreview();
    });
}
