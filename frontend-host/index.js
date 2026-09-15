/**
 * frontend-host —— 前端宿主「契约」层（`core` / 各前端分支共用，**不要在这里分叉**）
 *
 * 存在的意义：把「前端怎么加载」从 extension.js 抽出来做成可插拔实现，使
 * `extension.js` 与本文件在 core / vanilla / vite 三条线上完全一致 ——
 * 后端更新（只改 core/**）合并进前端分支时，不会在前端加载逻辑上产生冲突。
 *
 * 实现文件（每个分支只保留一个）：
 *   vanilla.js —— 默认方案：读 ui/webUI.html + 扫描 ui/css、ui/scripts 再注入（core 自带）
 *   vite.js    —— Vite 方案：读 frontend/dist 或 Vite dev server（vite-frontend 自带）
 *
 * 本层**不依赖 vscode 模块**（便于在 jsdom 里做契约测试）：
 * webview URI 的转换由调用方通过 runtime.toWebviewUri 注入。
 *
 * 实现必须导出：
 *   name                                 : string
 *   buildHtml(runtime, options)          : string            入口 HTML（资源引用已处理好）
 *   buildConfig(runtime, options)        : object | null     注入 window.NODE_EDITOR_CONFIG 的内容，null = 不注入
 *   buildErrorHtml(runtime)              : string            加载失败时的兜底页
 *
 * 环境变量 CNE_FRONTEND_HOST 可强制指定实现；默认取目录下唯一存在的实现。
 */
const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} HostRuntime webview 渲染所需的运行时环境
 * @property {(filePath: string) => string} toWebviewUri 本地绝对路径 → webview URI
 * @property {{ webview: { asWebviewUri: Function, cspSource: string } }} panel
 * @property {{ extensionPath: string }} context
 */

/** 已知实现名（顺序只用于报错提示，不影响选择） */
const KNOWN_IMPLS = ['vanilla', 'vite'];

/** @type {{name: string, buildHtml: Function, buildConfig: Function, buildErrorHtml: Function}|null} */
let cachedImpl = null;

/**
 * 列出 frontend-host/ 下实际存在的实现
 * @returns {string[]}
 */
function listImpls() {
    return KNOWN_IMPLS.filter((name) => fs.existsSync(path.join(__dirname, `${name}.js`)));
}

/**
 * 载入实现（结果缓存）。多个实现同时存在时需用 CNE_FRONTEND_HOST 指定。
 * @returns {{name: string, buildHtml: Function, buildConfig: Function, buildErrorHtml: Function}}
 */
function getImpl() {
    if (cachedImpl) return cachedImpl;

    const forced = process.env.CNE_FRONTEND_HOST;
    if (forced) {
        cachedImpl = require(path.join(__dirname, `${forced}.js`));
        return cachedImpl;
    }

    const available = listImpls();
    if (available.length === 0) {
        throw new Error('frontend-host/ 下没有可用的前端实现（应有 vanilla.js 或 vite.js）');
    }
    if (available.length > 1) {
        throw new Error(
            `frontend-host/ 下同时存在多个实现：${available.join(', ')}；请用 CNE_FRONTEND_HOST 指定其一`
        );
    }

    cachedImpl = require(path.join(__dirname, `${available[0]}.js`));
    return cachedImpl;
}

/**
 * 把配置注入 HTML（插入到 </body> 前）。
 *
 * 注意里面那句 window.initWebview() 是历史遗留：initWebview 从未挂到 window，
 * 前端是自启动的，所以这里实际只承担「设置 NODE_EDITOR_CONFIG」的作用。
 * @param {string} htmlContent
 * @param {object} config
 * @returns {string}
 */
function injectConfigData(htmlContent, config) {
    const configScript = `
        <script>
            // 注入配置数据
            window.NODE_EDITOR_CONFIG = ${JSON.stringify(config, null, 2)};

            // 确保在DOM加载完成后初始化
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    if (window.initWebview && typeof window.initWebview === 'function') {
                        window.initWebview();
                    }
                });
            } else {
                // DOM已经加载完成
                if (window.initWebview && typeof window.initWebview === 'function') {
                    window.initWebview();
                }
            }
        </script>
    `;

    return htmlContent.replace('</body>', `${configScript}\n</body>`);
}

/**
 * 统一的 webview 内容入口 —— extension.js 只调这个函数。
 * @param {HostRuntime} runtime
 * @param {{previewMode?: boolean}} [options]
 * @returns {string}
 */
function renderWebviewHtml(runtime, options = {}) {
    let impl;
    try {
        impl = getImpl();
        const html = impl.buildHtml(runtime, options);
        const config = impl.buildConfig(runtime, options);

        // 实现没给配置（例如缺少 webview-config.json）时保持原样，不注入
        if (!config) return html;

        // 预览模式（customEditor「打开方式」）：仅查看当前 json，前端隐藏侧边栏/顶栏等功能
        if (options.previewMode) config.previewMode = true;

        return injectConfigData(html, config);
    } catch (error) {
        console.error('加载Webview内容失败:', error);
        return impl ? impl.buildErrorHtml(runtime) : '';
    }
}

module.exports = {
    getImpl,
    listImpls,
    renderWebviewHtml,
    injectConfigData,
};
