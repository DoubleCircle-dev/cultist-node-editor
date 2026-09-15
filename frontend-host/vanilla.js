/**
 * frontend-host/vanilla.js —— **默认方案**的前端宿主实现（`core` 自带）
 *
 * 前端放在 `ui/`，源码即运行时：
 *   - 入口 HTML：ui/webUI.html（手写 <link> / <script type="module"> 列表）
 *   - 加载方式：扫描 ui/css/** 与 ui/scripts/**，删掉 HTML 里的原始标签后重新注入 webview URI
 *   - 运行时数据：ui/{json-manifest,config,help,webview-config}.json、ui/assets/**
 *
 * 接口约定见 ./index.js —— 更换前端实现时**只替换本文件**，不要改 index.js / extension.js。
 */
const fs = require('fs');
const path = require('path');

/** 前端根目录（本实现固定为 ui/） */
const UI_DIR_NAME = 'ui';

/**
 * 递归获取目录下所有指定后缀的文件路径
 * @param {string} dirPath 物理目录路径
 * @param {string} extension 文件后缀（如 '.js'）
 * @param {string[]} [arrayOfFiles] 递归累积数组
 * @returns {string[]} 文件的绝对路径列表
 */
function getAllFiles(dirPath, extension, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            // 如果是目录，递归调用
            arrayOfFiles = getAllFiles(fullPath, extension, arrayOfFiles);
        } else if (file.endsWith(extension)) {
            // 如果是目标文件，记录路径
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

/**
 * 扫描 ui/css 与 ui/scripts，转成 webview URI
 * @param {import('./index.js').HostRuntime} runtime
 * @param {string} uiDir
 * @returns {{css: {uri: string}[], scripts: {uri: string}[]}}
 */
function processResources(runtime, uiDir) {
    const resources = {
        css: [],
        scripts: []
    };

    const cssDirPath = path.join(uiDir, 'css');
    const scriptDirPath = path.join(uiDir, 'scripts');

    // 递归处理 CSS
    if (fs.existsSync(cssDirPath)) {
        const allCssFiles = getAllFiles(cssDirPath, '.css');
        resources.css = allCssFiles.map(filePath => ({
            uri: runtime.toWebviewUri(filePath)
        }));
    }

    // 递归处理 JS (Module)
    if (fs.existsSync(scriptDirPath)) {
        const allJsFiles = getAllFiles(scriptDirPath, '.js');
        resources.scripts = allJsFiles.map(filePath => ({
            uri: runtime.toWebviewUri(filePath)
        }));
    }

    return resources;
}

/**
 * 删掉 HTML 里硬编码的 <link>/<script src>，再注入扫描得到的资源
 * @param {string} htmlContent
 * @param {{css: {uri: string}[], scripts: {uri: string}[]}} resources
 * @returns {string}
 */
function replaceResourceReferences(htmlContent, resources) {
    let result = htmlContent;

    // 1. 移除原有的硬编码资源引用（可选，建议保留以清理模板）
    result = result.replace(/<link\s+rel="stylesheet"\s+href="[^"]*"\s*\/?>/g, '');
    result = result.replace(/<script\s+[^>]*src="[^"]*"><\/script>/g, '');

    // 2. 生成新的标签
    const styleTags = resources.css.map(style =>
        `<link rel="stylesheet" href="${style.uri}">`
    ).join('\n\t');

    const scriptTags = resources.scripts.map(script =>
        `<script type="module" src="${script.uri}"></script>` // 关键：添加 type="module"
    ).join('\n\t');

    // 3. 注入到 HTML
    if (styleTags) {
        result = result.replace('</head>', `${styleTags}\n</head>`);
    }
    if (scriptTags) {
        result = result.replace('</body>', `${scriptTags}\n</body>`);
    }

    return result;
}

/**
 * 入口 HTML：读 ui/webUI.html 并注入扫描到的 css/js
 * @param {import('./index.js').HostRuntime} runtime
 * @returns {string}
 */
function buildHtml(runtime) {
    const uiDir = path.join(runtime.context.extensionPath, UI_DIR_NAME);
    const htmlPath = path.join(uiDir, 'webUI.html');
    if (!fs.existsSync(htmlPath)) throw new Error('HTML文件不存在: ' + htmlPath);

    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    return replaceResourceReferences(htmlContent, processResources(runtime, uiDir));
}

/**
 * 注入到前端 window.NODE_EDITOR_CONFIG 的内容；返回 null 表示不注入
 * @param {import('./index.js').HostRuntime} runtime
 * @returns {object|null}
 */
function buildConfig(runtime) {
    const uiDir = path.join(runtime.context.extensionPath, UI_DIR_NAME);
    const configPath = path.join(uiDir, 'webview-config.json');
    if (!fs.existsSync(configPath)) return null;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // 图片渲染失败时的回退占位图（webview URI，需在 localResourceRoots 内）
    const placeholderPath = path.join(uiDir, 'assets', 'img', 'placeholder.png');
    if (fs.existsSync(placeholderPath)) {
        config.placeholderImage = runtime.toWebviewUri(placeholderPath);
    }
    return config;
}

/**
 * 加载失败时的兜底页
 * @param {import('./index.js').HostRuntime} runtime
 * @returns {string|undefined}
 */
function buildErrorHtml(runtime) {
    try {
        return fs.readFileSync(path.join(runtime.context.extensionPath, UI_DIR_NAME, 'error.html'), 'utf-8');
    } catch (error) {
        console.error('读取错误页时出错:', error);
    }
}

module.exports = {
    name: 'vanilla',
    buildHtml,
    buildConfig,
    buildErrorHtml,
};
