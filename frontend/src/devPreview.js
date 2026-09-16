/**
 * frontend/src/devPreview.js —— 纯浏览器调试用的「预览 json」回退
 *
 * 用途：直接开浏览器（`pnpm run dev`，无 VS Code 宿主）时，「👁️ 预览json」按钮原本只会
 * 打印 `非 VSCode 环境，无法预览 json` —— warn 完什么都不发生。这里补上等价链路：
 *
 *   原生文件选择器选 json → dev server 用 **core 的同一套函数**转成数据池
 *   → 以 `jsonPreviewLoaded` 消息回到前端（与宿主发来的消息走同一条处理链路）
 *
 * 真正的转换在 dev server 侧（`frontend/dev/devPreviewApi.mjs`）：本工作区不维护、也不复制
 * core 的映射规则，避免浏览器里看到的结果与扩展里不一致。
 *
 * ⚠️ 仅开发可用：VS Code 里走宿主（文件对话框 + 自定义编辑器预览），不会进到这里。
 */

/** dev server 接口路径；与 frontend/dev/devPreviewApi.mjs 的 ROUTE 保持一致 */
const DEV_API = '/__cne-dev/json-preview';

/** @type {Promise<Map<string, string>> | null} 文件名 → 目录名 索引（懒加载一次） */
let categoryIndex = null;

/**
 * 用原生文件选择器选一个 json（浏览器没有 VS Code 的 showOpenDialog）
 *
 * ⚠️ 必须在用户点击的同一个 tick 里调用，否则浏览器会因缺少用户手势而拒绝打开选择器。
 *
 * @returns {Promise<{fileName: string, text: string} | null>} 未选择/取消时返回 null
 */
function pickJsonFile() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        document.body.appendChild(input);

        const finish = (/** @type {{fileName: string, text: string} | null} */ picked) => {
            input.remove();
            resolve(picked);
        };

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) {
                finish(null);
                return;
            }
            file.text()
                .then((text) => finish({ fileName: file.name, text }))
                .catch(() => finish(null));
        });
        // 现代浏览器取消选择时触发；老浏览器不支持则该 promise 悬空（无副作用，元素已随 DOM 移除）
        input.addEventListener('cancel', () => finish(null));
        input.click();
    });
}

/**
 * 读 `json-manifest.json` 建立「文件名 → 目录名」索引
 *
 * 用途：core 的类别规则按**目录名**判定（recipes/elements/...）。浏览器拿不到文件路径，
 * 就用同名的清单项反查目录（如 recipes.json → recipes）；查不到时留空，由 dev server 退回文件名。
 *
 * @returns {Promise<Map<string, string>>} 文件名 → 类别目录名
 */
function loadCategoryIndex() {
    if (categoryIndex) return categoryIndex;
    categoryIndex = fetch('./json-manifest.json')
        .then((response) => (response.ok ? response.json() : {}))
        .then((manifest) => {
            /** @type {Map<string, string>} */
            const index = new Map();
            Object.keys(manifest || {}).forEach((dir) => {
                /** @type {string[]} */
                const files = manifest[dir] || [];
                files.forEach((name) => {
                    // cultures/en → cultures：与 core 按路径首段取类别一致
                    if (!index.has(name)) index.set(name, String(dir).split(/[\\/]/)[0]);
                });
            });
            return index;
        })
        .catch(() => new Map());
    return categoryIndex;
}

/**
 * 浏览器里的「预览 json」：选文件 → dev server 转换 → 以 jsonPreviewLoaded 回填
 *
 * @returns {Promise<void>}
 */
export async function previewJsonInBrowser() {
    const picked = await pickJsonFile();
    if (!picked) return;

    const index = await loadCategoryIndex();
    try {
        const response = await fetch(DEV_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: picked.fileName,
                text: picked.text,
                categoryHint: index.get(picked.fileName) || '',
            }),
        });
        // dev server 没有该路由时会回落到 index.html（200 + text/html），据此给出可操作的提示
        const type = response.headers.get('content-type') || '';
        if (!response.ok || !type.includes('application/json')) {
            throw new Error('dev server 未提供 ' + DEV_API + '（请用 pnpm run dev 重启开发服务器）');
        }
        const result = await response.json();
        if (!result.ok) throw new Error(result.error || '转换失败');

        console.log(`[dev] json 预览: ${picked.fileName} → ${result.data.category}`);
        // force：同一个文件重复预览时跳过后端的幂等去重（浏览器是长驻页面，与「每次新开 webview」的宿主不同）
        window.postMessage({ command: 'jsonPreviewLoaded', data: result.data, force: true }, '*');
    } catch (error) {
        window.postMessage({ command: 'error', message: `浏览器预览失败: ${error.message}` }, '*');
    }
}
