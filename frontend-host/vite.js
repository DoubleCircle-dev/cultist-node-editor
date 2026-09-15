/**
 * frontend-host/vite.js —— **Vite 方案**的前端宿主实现（feat/vite-frontend 自带）
 *
 * 前端放在 `frontend/`（Vite 工程）：
 *   - 生产：读 `frontend/dist/index.html`，把 `./assets/**` 换成 webview URI
 *   - 开发：环境变量 CNE_DEV_SERVER=1（或写完整地址）时读源码 `frontend/index.html`，
 *     把入口脚本指向 Vite dev server（含 @vite/client）以启用 HMR，并注入放宽的 CSP
 *   - 运行时数据：frontend/public/**（构建后拷进 dist）与 frontend/dist/**
 *
 * 接口约定见 ./index.js —— 本文件即「替换 vanilla.js 的那一份实现」。
 */
const fs = require('fs');
const path = require('path');

/** 前端根目录（Vite 工程） */
const FRONTEND_DIR_NAME = 'frontend';
/** 开启开发模式的环境变量：设为 1 用默认地址，或直接写 dev server 地址 */
const DEV_SERVER_ENV = 'CNE_DEV_SERVER';
const DEFAULT_DEV_SERVER = 'http://localhost:5173';

/**
 * 读取开发服务器地址；未开启开发模式时返回 null
 * @returns {string|null}
 */
function getDevServerUrl() {
    const raw = process.env[DEV_SERVER_ENV];
    if (!raw) return null;
    if (raw === '1' || raw === 'true') return DEFAULT_DEV_SERVER;
    return raw.replace(/\/$/, '');
}

/**
 * 解析前端运行时文件：优先 dist 产物，回退 public 源码（便于未构建时也能启动）
 * @param {string} extensionPath
 * @param {string} relPath 相对 frontend/ 的路径，如 'error.html'
 * @returns {string} 绝对路径
 */
function resolveFrontendFile(extensionPath, relPath) {
    const distPath = path.join(extensionPath, FRONTEND_DIR_NAME, 'dist', relPath);
    if (fs.existsSync(distPath)) return distPath;
    const publicPath = path.join(extensionPath, FRONTEND_DIR_NAME, 'public', relPath);
    if (fs.existsSync(publicPath)) return publicPath;
    return distPath;
}

/**
 * 仅为开发模式注入 CSP：放行 dev server（含 HMR 的 websocket）。
 * 生产模式不注入，避免改变既有行为。
 * @param {string} html
 * @param {string} cspSource webview.cspSource
 * @param {string} devServerUrl
 * @returns {string}
 */
function injectDevCsp(html, cspSource, devServerUrl) {
    const wsUrl = devServerUrl.replace(/^http/, 'ws');
    const policy = [
        `default-src 'none'`,
        `img-src ${cspSource} ${devServerUrl} https: data: blob:`,
        `media-src ${cspSource} ${devServerUrl} data: blob:`,
        `script-src ${cspSource} ${devServerUrl} 'unsafe-inline'`,
        `style-src ${cspSource} ${devServerUrl} 'unsafe-inline'`,
        `font-src ${cspSource} ${devServerUrl} data:`,
        `worker-src ${cspSource} blob:`,
        `connect-src ${cspSource} ${devServerUrl} ${wsUrl}`,
    ].join('; ');
    const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
    return html.replace('<head>', `<head>\n        ${meta}`);
}

/**
 * 入口 HTML：
 * - 开发模式：读源码 frontend/index.html，把入口脚本指向 dev server
 * - 生产模式：读 frontend/dist/index.html，把 ./assets/** 等相对引用换成 webview URI
 * @param {import('./index.js').HostRuntime} runtime
 * @returns {string}
 */
function buildHtml(runtime) {
    const extensionPath = runtime.context.extensionPath;
    const frontendDir = path.join(extensionPath, FRONTEND_DIR_NAME);
    const devServerUrl = getDevServerUrl();

    if (devServerUrl) {
        const srcHtml = path.join(frontendDir, 'index.html');
        if (!fs.existsSync(srcHtml)) throw new Error('找不到 ' + srcHtml);
        let html = fs.readFileSync(srcHtml, 'utf-8');
        const entryTag = '<script type="module" src="/src/main.js"></script>';
        if (!html.includes(entryTag)) {
            throw new Error('frontend/index.html 里找不到 Vite 入口标签，无法切换到 dev server');
        }
        const devTags = [
            `<script type="module" src="${devServerUrl}/@vite/client"></script>`,
            `<script type="module" src="${devServerUrl}/src/main.js"></script>`
        ].join('\n    ');
        html = html.replace(entryTag, devTags);
        console.log(`🔥 [dev] webview 加载 Vite dev server: ${devServerUrl}`);
        return injectDevCsp(html, runtime.panel.webview.cspSource, devServerUrl);
    }

    const distDir = path.join(frontendDir, 'dist');
    const htmlPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(htmlPath)) {
        throw new Error('找不到 ' + htmlPath + '，请先执行 npm run build:ui');
    }
    let html = fs.readFileSync(htmlPath, 'utf-8');
    // Vite 产物（base:'./'）用相对路径引用资源，逐个换成 webview URI
    html = html.replace(/(src|href)="(\.\/[^"]+)"/g, (match, attr, rel) => {
        const filePath = path.join(distDir, rel.replace(/^\.\//, ''));
        return fs.existsSync(filePath) ? `${attr}="${runtime.toWebviewUri(filePath)}"` : match;
    });
    return html;
}

/**
 * 注入到前端 window.NODE_EDITOR_CONFIG 的内容；返回 null 表示不注入
 * @param {import('./index.js').HostRuntime} runtime
 * @returns {object|null}
 */
function buildConfig(runtime) {
    const configPath = resolveFrontendFile(runtime.context.extensionPath, 'webview-config.json');
    const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

    // 图片渲染失败时的回退占位图（webview URI，需在 localResourceRoots 内）
    const placeholderPath = resolveFrontendFile(
        runtime.context.extensionPath,
        path.join('assets', 'img', 'placeholder.png')
    );
    if (fs.existsSync(placeholderPath)) {
        config.placeholderImage = runtime.toWebviewUri(placeholderPath);
    }
    // 开发模式标记：前端可据此显示额外调试信息
    const devServerUrl = getDevServerUrl();
    if (devServerUrl) config.devServer = devServerUrl;

    return config;
}

/**
 * 加载失败时的兜底页
 * @param {import('./index.js').HostRuntime} runtime
 * @returns {string|undefined}
 */
function buildErrorHtml(runtime) {
    try {
        return fs.readFileSync(resolveFrontendFile(runtime.context.extensionPath, 'error.html'), 'utf-8');
    } catch (error) {
        console.error('读取错误页时出错:', error);
    }
}

module.exports = {
    name: 'vite',
    buildHtml,
    buildConfig,
    buildErrorHtml,
};
