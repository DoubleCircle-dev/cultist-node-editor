/**
 * frontend/dev/ ── 纯浏览器调试用的 dev server 插件（**只在本工作区开发时生效**）
 *
 * 背景：`openJsonPreview`（"👁️ 预览json"按钮）在 VS Code 里依赖宿主：
 * 宿主弹文件对话框 → core 的 `toData.singleFileToData(filePath)` 读盘并转成「数据池」→
 * 回发 `jsonPreviewLoaded`。直接开浏览器（`pnpm run dev`）时没有宿主，按钮点了只会 warn。
 *
 * 本插件把这一环补上 —— 浏览器把「文件内容」POST 过来，dev server（Node 侧）用
 * **core 的同一套纯函数**转换，保证浏览器里看到的就是扩展里的结果：
 *
 *   POST /__cne-dev/json-preview   { fileName, text, categoryHint }
 *   → { ok: true, data: <与后端 jsonPreviewLoaded 的 data 同形> }
 *   → { ok: false, error: '...' }
 *
 * ⚠️ 只消费 core、不改 core：`core/` 由「同步后端（core → 本工作区）」任务拷入（本工作区 git 忽略），
 * 缺失时接口返回可读错误，不影响其它功能。生产（VSIX）不走这里 —— webview 走宿主，本文件不参与打包。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
/** 本文件所在目录（frontend/dev/） */
const HERE = path.dirname(fileURLToPath(import.meta.url));
/** core 目录（仓库根/core），由「同步后端」任务拷入 */
const CORE_DIR = path.resolve(HERE, '..', '..', 'core');
/** 接口路径（前端 frontend/src/devPreview.js 里必须保持一致） */
const ROUTE = '/__cne-dev/json-preview';
/** 请求体上限（单个 json 远小于此；防止误传大文件把 dev server 撑住） */
const MAX_BODY = 32 * 1024 * 1024;

/** @type {any} */
let coreToData = null;

/**
 * 惰性加载 core 的 toData（缺失时抛错，由调用方转成响应体）
 *
 * @returns {any} core/modLoad/toData.js 的导出
 */
function loadCoreToData() {
    if (coreToData) return coreToData;
    const entry = path.join(CORE_DIR, 'modLoad', 'toData.js');
    if (!fs.existsSync(entry)) {
        throw new Error(`未找到 ${entry}，请先运行「同步后端（core → 本工作区）」任务`);
    }
    coreToData = require(entry);
    return coreToData;
}

/**
 * json 文本 → 数据池（形状对齐 core 的 `singleFileToData`）
 *
 * 与 `singleFileToData` 的唯一差别：那边从磁盘读、用文件所在目录名当 category；
 * 浏览器只给得到「内容 + 文件名」，所以 category 由调用方给的 categoryHint（一般为
 * json-manifest 里的目录名，如 recipes）决定，拿不到时退回文件名去后缀。
 *
 * @param {{fileName: string, text: string, categoryHint?: string}} payload
 * @returns {Record<string, any>} 数据池（含 categories / links / namespace）
 */
function textToData({ fileName, text, categoryHint }) {
    const toData = loadCoreToData();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = require('json5').parse(text);
    }

    const base = String(fileName || 'untitled').replace(/\.[^.]+$/, '');
    const { entries, category } = toData.extractEntries(parsed, categoryHint || base);
    /** @type {Record<string, any[]>} */
    const categories = {};
    categories[category] = toData.entriesToData(category, entries, { source: 'mod', file: fileName });

    return {
        source: 'mod',
        namespace: `file:${base}`,
        categories,
        category,
        fileName,
        links: toData.buildLinks(categories),
    };
}

/**
 * 读取请求体
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
    return new Promise((resolve, reject) => {
        /** @type {Buffer[]} */
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(new Error('请求体过大'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/**
 * 写出 json 响应
 *
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, any>} body
 */
function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
}

/**
 * Vite 插件：注册浏览器开发环境用的「单文件 json 预览」接口
 *
 * @returns {import('vite').Plugin} Vite 插件对象
 */
export default function devPreviewApi() {
    return {
        name: 'cne-dev-preview-api',
        // 只对 dev server 生效（build/preview 不注册路由）
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use(ROUTE, async (req, res, next) => {
                if (req.method !== 'POST') {
                    next();
                    return;
                }
                try {
                    const payload = JSON.parse(await readBody(req));
                    if (typeof payload?.text !== 'string') {
                        sendJson(res, 400, { ok: false, error: '请求体缺少 text 字段' });
                        return;
                    }
                    const data = textToData(payload);
                    const count = Object.values(data.categories).reduce((n, list) => n + list.length, 0);
                    console.log(`👁️ [dev] json 预览: ${payload.fileName} → ${data.category} (${count} 条)`);
                    sendJson(res, 200, { ok: true, data });
                } catch (error) {
                    console.warn(`⚠️ [dev] json 预览失败: ${error.message}`);
                    sendJson(res, 200, { ok: false, error: error.message });
                }
            });
        },
    };
}
