/**
 * frontend/src/devPreview.js —— 纯浏览器调试用的「预览 json」回退（父页面一侧）
 *
 * 对齐扩展里的行为：VS Code 中「预览json」是让宿主**新开一个页面**（自定义编辑器，仅查看），
 * 而不是把预览铺进当前面板。dev（`pnpm run dev`，无宿主）下同样新开一个子页面：
 *
 *   主页面点按钮 → 原生文件选择器选 json → 内容暂存到 localStorage
 *   → window.open 打开「预览模式」子页面（URL 带 ?cneDevPreview=1）
 *   → 子页面自己取回内容、经 dev server 转成节点图，以 jsonPreviewLoaded 铺图
 *     （见 frontend/src/devPreviewPage.js）
 *
 * 子页面是普通地址，刷新即可重新取数（暂存内容保留到下次预览），方便反复调预览 UI。
 *
 * ⚠️ 仅开发用：VS Code 里走宿主（文件对话框 + 自定义编辑器预览），不会进到这里。
 */

/** 暂存键：父页面写、子页面读（同源 localStorage，每次预览覆盖上一次） */
export const DEV_PREVIEW_KEY = '__cneDevPreview';

/** 子页面标记：仅带该参数的 http(s) 页面会进入预览模式并自动取数据（见 devPreviewPage.js） */
export const DEV_PREVIEW_PARAM = 'cneDevPreview';

/** @type {Promise<Map<string, string>> | null} 文件名 → 目录名 索引（懒加载一次） */
let categoryIndex = null;

/**
 * 用原生文件选择器选一个 json（浏览器没有 VS Code 的 showOpenDialog）
 *
 * ⚠️ 必须在用户点击的同一个 tick 里调用，否则浏览器会因缺少用户手势而拒绝打开选择器。
 *
 * @returns {Promise<{fileName: string, text: string} | null>} 未选择/取消时返回 null
 */
export function pickJsonFile() {
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
 * 预览子页面地址：沿用当前页地址，只把查询串换成子页面标记
 *
 * @returns {string} 子页面 URL
 */
function buildPreviewUrl() {
    const url = new URL(location.href);
    url.search = `?${DEV_PREVIEW_PARAM}=1`;
    url.hash = '';
    return url.toString();
}

/**
 * 浏览器里的「预览 json」：选文件 → 暂存内容 → 新开预览子页面
 *
 * @returns {Promise<void>}
 */
export async function previewJsonInBrowser() {
    const picked = await pickJsonFile();
    if (!picked) return;

    const index = await loadCategoryIndex();
    try {
        localStorage.setItem(
            DEV_PREVIEW_KEY,
            JSON.stringify({
                fileName: picked.fileName,
                text: picked.text,
                categoryHint: index.get(picked.fileName) || '',
            })
        );
    } catch (error) {
        window.postMessage({ command: 'error', message: `浏览器预览失败: 暂存文件内容失败（${error.message}），文件可能过大` }, '*');
        return;
    }

    const url = buildPreviewUrl();
    const child = window.open(url, '_blank');
    if (!child) {
        // 弹窗被拦截：内容已暂存，手动打开该地址同样能预览
        console.warn(`[dev] 预览子页面被浏览器拦截，可手动打开: ${url}`);
        window.postMessage({ command: 'error', message: `预览子页面被浏览器拦截：请允许本站弹出窗口，或手动打开 ${url}` }, '*');
        return;
    }
    console.log(`[dev] 已在新页面打开预览: ${picked.fileName} → ${url}`);
}
