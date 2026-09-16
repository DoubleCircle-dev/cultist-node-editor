/**
 * frontend/dev/ ── 纯浏览器调试用的 dev server 插件（**只在本工作区开发时生效**）
 *
 * 背景：`openJsonPreview`（"👁️ 预览json"按钮）在 VS Code 里依赖宿主：
 * 宿主弹文件对话框 → core 的 `toData.singleFileToData(filePath)` 读盘并转成节点图 →
 * 回发 `jsonPreviewLoaded`。直接开浏览器（`pnpm run dev`）时没有宿主，按钮点了只会 warn。
 *
 * 本插件把这一环补上 —— 浏览器把「文件内容」POST 过来，dev server（Node 侧）用
 * **core 的同一套纯函数**转换，保证浏览器里看到的就是扩展里的结果：
 *
 *   POST /__cne-dev/json-preview   { fileName, text, categoryHint }
 *   → { ok: true, data: <与宿主 jsonPreviewLoaded 的 data 同形> }
 *   → { ok: false, error: '...' }
 *
 * ⚠️ 只消费 core、不改 core。core 代码优先直接读 **core 分支工作区**（见 coreModules.mjs），
 * 改完后端不必先同步；分支工作区不在时才回退到本工作区的 `core/` 副本。
 * 生产（VSIX）不走这里 —— webview 走宿主，本文件不参与打包。
 */
import { requireCoreModule } from './coreModules.mjs';

/** 接口路径（前端 frontend/src/devPreview.js 里必须保持一致） */
const ROUTE = '/__cne-dev/json-preview';
/** 请求体上限（单个 json 远小于此；防止误传大文件把 dev server 撑住） */
const MAX_BODY = 32 * 1024 * 1024;

/**
 * json 文本 → 节点图（形状与 core/modLoad/handlers.js 的 `previewFile` 回发内容一一对应）
 *
 * 与 core 的 `toData.singleFileToData(filePath)` 走同一条流水线，唯一差别：
 * 那边从磁盘读文件、用文件所在目录名当 category；浏览器只给得到「内容 + 文件名」，
 * 所以 category 由调用方给的 categoryHint（一般是 json-manifest 里的目录名，如 recipes）决定，
 * 拿不到时退回文件名去后缀。解析 / 建图规则全部调 core 自己的函数，不在这里复制。
 *
 * @param {{fileName: string, text: string, categoryHint?: string}} payload 浏览器传来的文件信息
 * @returns {Record<string, any>} 节点图（含 count / nodes / edges / external / warnings / stats）
 * @throws {Error} JSON/JSON5 解析失败时
 */
function textToData({ fileName, text, categoryHint }) {
    const toData = requireCoreModule('modLoad/toData.js');
    const parse = requireCoreModule('modLoad/parse.js');

    // 与 core 的 parse.readJSONFileSync 同一套容错（JSON5 + 多级兜底），只是内容来自浏览器而不是磁盘
    const data = parse.smartJSON5Parse(text, fileName);
    if (data === null) throw new Error(`无法解析 ${fileName}（不是合法的 JSON / JSON5）`);

    const base = String(fileName || 'untitled').replace(/\.[^.]+$/, '');
    const { groups } = parse.filesToGroups([{ fileName, relativePath: fileName, data }], {
        fallbackCategory: categoryHint || base,
        includeSingle: true, // 单对象条目文件也算一个节点（与 singleFileToData 一致）
    });
    const graph = toData.buildGraph(groups, { source: 'mod', namespace: `file:${base}`, scope: 'file', fileCount: 1 });

    return {
        fileName,
        category: groups.length ? groups[0].category : '',
        namespace: graph.namespace,
        source: graph.source,
        count: graph.nodes.length,
        nodes: graph.nodes,
        edges: graph.edges,
        external: graph.external,
        warnings: graph.warnings,
        stats: graph.stats,
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
                    console.log(`👁️ [dev] json 预览: ${payload.fileName} → ${data.category} (${data.count} 个节点)`);
                    sendJson(res, 200, { ok: true, data });
                } catch (error) {
                    console.warn(`⚠️ [dev] json 预览失败: ${error.message}`);
                    sendJson(res, 200, { ok: false, error: error.message });
                }
            });
        },
    };
}
