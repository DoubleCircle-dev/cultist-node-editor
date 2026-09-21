import { ControllerCore } from './controllers/controllerCore.js';
import { NodeModel } from './models/nodeModels/nodeModel.js';
import { NodeTypeRegistry } from './types/nodeTypes.js';
import { PROPERTY_LEVEL_OPTIONS } from './types/nodePropertyLevels.js';
import { NODE_COLOR_ITEMS, getNodeColors, resetNodeColors, setFactoryNodeColors } from './types/nodeColors.js';
import { NodeGenerator } from './generators/nodeGenerator.js';
import { NodeView } from './views/nodeView.js';
import { setHubLabelMode } from './generators/propViewGenerator.js';
import { NodeSearchBox } from './views/nodeSearchBox.js';
import { TabBar } from './views/tabBar.js';
import { ModDataRegistry } from './modDataRegistry.js';
import { graphToDataPool } from './dataContract.js';
import { previewJsonInBrowser, pickJsonFile } from './devPreview.js';

let vscode = null;

// 创建全局管理器实例
/** @type {ControllerCore} */
let core = null;

console.log(navigator.userAgent);
const isVsCodeWebview = typeof acquireVsCodeApi === 'function';

if (isVsCodeWebview) {
    console.log('当前处于 VS Code 插件环境');
    vscode = acquireVsCodeApi();
} else {
    console.log('当前处于 普通浏览器环境');
}
// 更新状态显示
export function updateStatus(text) {
    const statusElement = document.getElementById('status');
    const statusTextElement = document.getElementById('status-text');

    if (statusElement) {
        statusElement.innerHTML = text;
    }
    if (statusTextElement) {
        statusTextElement.textContent = text;
    }

    console.log(`状态更新---${text}`);
}

export function readMod() {
    updateStatus('读取mod中，请选择synopsis.json，如果mod文件夹内项目过多，读取时间可能较长');
    if (vscode) {
        vscode.postMessage({ command: 'readMod' });
    } else {
        console.warn('非 VSCode 环境，无法读取 mod');
    }
}

/** 保存图表：把全部页面（各自内容 + 视图状态）写进一个文件，宿主侧仍走 `saveGraph` */
export function saveGraph() {
    if (!core) {
        updateStatus('❌ 编辑器尚未初始化');
        return false;
    }
    const doc = core.pageManager.snapshot();
    updateStatus(`保存 ${doc.pages.length} 个页面...`);
    if (vscode) {
        vscode.postMessage({ command: 'saveGraph', data: doc });
        return true;
    }
    // 浏览器开发环境：没有宿主的保存对话框，退化成下载
    const fileName = `node-pages-${timestamp()}.json`;
    if (downloadJson(fileName, doc)) updateStatus(`✅ 已下载 ${fileName}（${doc.pages.length} 个页面）`);
    return true;
}

/**
 * 把**某一个**页面单独存成文件（tab 栏「页面管理 → 💾」）。
 * 存出来的文档与「💾 保存」同构，只是 pages 里只有一页，加载回来就是单页。
 *
 * @param {string} [pageId] - 缺省存当前页
 * @returns {boolean}
 */
export function savePageToFile(pageId) {
    if (!core) return false;
    const page = core.pageManager.getPage(pageId || core.pageManager.activeId);
    if (!page) return false;

    const doc = core.pageManager.snapshot({ pageId: page.id });
    const fileName = `${safeFileName(page.name)}-${timestamp()}.json`;
    if (vscode) {
        vscode.postMessage({ command: 'saveGraph', data: doc });
        updateStatus(`保存页面「${page.name}」...`);
        return true;
    }
    if (downloadJson(fileName, doc)) updateStatus(`✅ 已下载「${page.name}」到 ${fileName}`);
    return true;
}

/** 加载页面文档（从 JSON 文件恢复） */
export function loadGraph() {
    if (!core) return false;
    updateStatus('加载页面...');
    if (vscode) {
        vscode.postMessage({ command: 'loadGraph' });
        return true;
    }
    // 浏览器开发环境：用原生文件选择器顶替宿主的打开对话框
    pickJsonFile().then((picked) => {
        if (!picked) {
            updateStatus('已取消加载');
            return;
        }
        try {
            importPages(JSON.parse(picked.text), picked.fileName);
        } catch (error) {
            console.error('[加载] JSON 解析失败:', error);
            updateStatus(`❌ ${picked.fileName} 不是合法 JSON`);
        }
    });
    return true;
}

/**
 * 导入页面文档：宿主「📂 加载」回发、浏览器选文件、预览子页面都走这里
 *
 * @param {any} doc - `{ pages: [...] }` 或旧的 `{ nodes, connections }`
 * @param {string} [label] - 来源描述（状态提示用）
 * @returns {{ pages: number, nodes: number, connections: number } | null}
 */
function importPages(doc, label = '文件') {
    if (!core) return null;
    const stats = core.pageManager.importDocument(doc);
    if (!stats.pages) {
        updateStatus(`❌ ${label} 里没有可导入的页面`);
        return stats;
    }
    updateStatus(`✅ 已从${label}导入 ${stats.pages} 个页面（${stats.nodes} 个节点 / ${stats.connections} 条连线）`);
    return stats;
}

/**
 * 浏览器开发环境的回退：把 JSON 存成下载文件（宿主里由扩展写文件）
 *
 * @param {string} fileName
 * @param {any} data
 * @returns {boolean}
 */
function downloadJson(fileName, data) {
    try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    } catch (error) {
        console.error('下载失败:', error);
        updateStatus('❌ 下载失败');
        return false;
    }
}

/** @returns {string} `20260920-1530` 形式的文件名时间戳 */
function timestamp() {
    const d = new Date();
    const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * 页面名 → 安全的文件名（去掉路径分隔符与 Windows 不允许的字符）
 *
 * @param {string} name
 * @returns {string}
 */
function safeFileName(name) {
    const cleaned = String(name || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();
    return cleaned || 'page';
}

/** 新建 mod 基础结构（synopsis.json + content/） */
export function newMod() {
    updateStatus('新建 mod 基础结构...');
    if (vscode) {
        vscode.postMessage({ command: 'newMod' });
    } else {
        console.warn('非 VSCode 环境，无法新建 mod');
    }
}

/** 打开单个 mod json 文件作为节点预览 */
export function openJsonPreview() {
    updateStatus('打开 json 预览...');
    if (vscode) {
        vscode.postMessage({ command: 'openJsonPreview' });
        return;
    }
    // 浏览器开发环境：没有宿主的文件对话框，改为「原生文件选择器 + 新开预览子页面」（见 devPreview.js）
    previewJsonInBrowser();
}

/**
 * 把后端加载的数据注册进数据池（按类别，供基础类型实例化时选择）。 注意：节点类型始终是基础类型（recipes/elements/...），这里不注册任何动态类型。
 *
 * @param {string} label - 来源描述（用于状态提示）
 * @param {any} rawData - 后端回发的节点图（core 数据契约，见 dataContract.js）
 * @param {{ layout?: boolean }} [options] - `layout: false` 时只登记数据池备用（不换页、不铺图、不连线），
 * 供「添加节点 → 数据选择器」按需手动取用；缺省 true（读 mod / 预览 json 仍自动铺图）
 */
/** 已预览过的命名空间集合（jsonPreviewLoaded 去重用，防止画布重复铺图） */
const __previewedNamespaces = new Set();

function registerData(label, rawData, options = {}) {
    // 后端回发的是节点图；前端内部仍按「类别 + 连接候选」消费，这里做一层适配
    const data = graphToDataPool(rawData);
    if (!data || !data.categories || typeof data.categories !== 'object') return;
    const shouldLayout = options.layout !== false;
    // 记下「当前编辑的命名空间」：origin / 其他 mod 的数据只读（引用副本的受保护来源判定用）
    if (core && data.namespace) core.editingNamespace = data.namespace;
    // 防御：同一命名空间重复加载时先卸载旧数据，避免数据池累积（如重复读取 mod / 预览）
    if (data.namespace && ModDataRegistry.sources[data.namespace]) {
        ModDataRegistry.unregister(data.namespace);
    }
    const registered = ModDataRegistry.register(data);
    // 只备数据（origin 预加载走这里）：画布与页面都不动，等用户在「添加节点」里按类别自取
    if (!shouldLayout) {
        updateStatus(`📦 ${label}：已备 ${registered} 条数据（未铺图）`);
        console.log(`[数据池] ${label} 加载 ${registered} 条（来源: ${data.source}），仅备用未铺图`);
        return;
    }
    // 铺图目标页面：当前页已经有内容就新开一页（读 mod / 预览 json 是换数据集，
    // 不该和使用中的页面混在一起；页名用数据来源，tab 上就能看出这页是哪个 mod）
    if (core) core.pageManager.pageForImport(label);
    // 加载后自动把数据转换为可查看的节点（铺到画布，受规模上限限制；超出保留在数据池）
    const laid = core ? core.autoLayoutLoadedData(data.namespace) : { count: 0, created: [] };
    const created = (laid && laid.count) || 0;
    // 中间模型连接：mod JSON 中的引用 → 已铺图节点间展示连线（引用缺失/未铺图暂悬空）。
    // 延迟一帧再连线：端口圆点 DOM 位置需等本轮布局完成才准确，否则连接线端点会画到未布局位置。
    if (core && laid && laid.created && laid.created.length) {
        const links = Array.isArray(data.links) ? data.links : [];
        requestAnimationFrame(() => {
            const linked = core.connectDataLinks(links, laid.created);
            if (linked > 0) console.log(`[数据池] 已展示 ${linked} 条引用连接`);
            // 再等一帧：连线与折叠按钮重排后节点高度才稳定，此时量出来的列高才准
            requestAnimationFrame(() => {
                const layout = core.organizeLayout();
                if (layout.count) console.log(`[布局] 按引用方向铺行：${layout.count} 个节点 / ${layout.rows} 行（最宽 ${layout.columns} 个）`);
            });
        });
    }
    // 容器节点：把后端拆出来的内联子节点自动合并成容器（设置开关，默认关）
    if (core) {
        const containers = core.attachInlineContainers();
        const restored = core.restoreContainers(); // 恢复上次的成员 / 收起态 / 转发端口
        // 引用副本：恢复「哪个副本代理哪个原节点」（副本节点本身在页面快照里）
        const refs = core.restoreRefNodes();
        if (refs) console.log(`[引用副本] 恢复 ${refs} 个`);
        if (containers.containers || restored) {
            console.log(
                `[容器节点] 自动合并 ${containers.containers} 个（成员 ${containers.members}），恢复 ${restored} 个`
            );
        }
    }
    // 额外解析（设置开关，默认关）：把 list / dict 字段解析成列表 / 字典变量节点并连线
    if (core && core.setting.extraParseListVariables) {
        const stats = core.attachVariableNodes();
        if (stats.created || stats.skipped) {
            console.log(`[额外解析] 生成 ${stats.created} 个变量节点（连线 ${stats.linked}，跳过 ${stats.skipped}）`);
        }
    }
    // 悬空端口（设置开关，默认开）：画布上指向画布外的引用 → 只有端口的占位节点
    if (core && core.setting.showDanglingPorts) {
        const dangling = core.attachDanglingPorts();
        if (dangling.created) {
            console.log(`[悬空端口] 生成 ${dangling.created} 个（连线 ${dangling.linked}）`);
        }
    }
    updateStatus(`✅ ${label}：已加载 ${registered} 条数据，铺图 ${created} 个节点`);
    console.log(`[数据池] ${label} 加载 ${registered} 条（来源: ${data.source}），自动铺图 ${created} 个`);
}

/** 接收 VSCode 后端消息 */
function handleVscodeMessage(event) {
    const message = event.data;
    if (!message || !message.command) return;

    switch (message.command) {
        case 'init':
            updateStatus(message.message || '已就绪');
            break;
        case 'originLoaded':
            // 游戏基础内容只进数据池备用（供「添加节点 → 数据选择器」按类别取用），
            // 不自动铺图/换页：免得每次打开编辑器都被原版节点占满画布
            registerData('游戏基础内容', message.data, { layout: false });
            break;
        case 'modLoaded': {
            //: 打印后端输出数据
            console.log(message.data);
            const name = (message.data.synopsis && message.data.synopsis.name) || '';
            registerData(`Mod:${name}`, message.data);
            if (message.data.errors && message.data.errors.length) {
                console.warn('[modLoaded] 读取告警:', message.data.errors);
            }
            break;
        }
        case 'jsonPreviewLoaded': {
            const ns = message.data.namespace;
            // 防御：同一预览命名空间重复加载时忽略，避免画布重复铺图（后端已幂等发送，此为兜底）
            if (ns && __previewedNamespaces.has(ns)) {
                console.warn(`[预览] 忽略重复加载: ${ns}`);
                break;
            }
            if (ns) __previewedNamespaces.add(ns);
            registerData(`预览:${message.data.fileName}`, message.data);
            break;
        }
        case 'modCreated':
            updateStatus(`✅ 已创建 mod: ${message.data.synopsisPath}`);
            break;
        case 'saveConfirmed':
            updateStatus(`✅ 图表已保存到: ${message.path}`);
            break;
        case 'graphLoaded':
            importPages(message.data, '加载的文件');
            break;
        case 'error':
            updateStatus(`❌ ${message.message || '发生错误'}`);
            break;
        default:
            break;
    }
}

// todo 清空画布
export function clearCanvas() {
    core.clearCanvas();

    updateStatus('画布已清空');
}

// 添加测试节点（直接在Webview中）
export function addTestNode() {
    addNode('test');
}

// 添加节点
/** @param {string} type */
export function addNode(type) {
    core.addNode(type);
}

export function addBlankNode() {
    addNode('blank');
}

export function toggleConnections() {
    core.connectionManager.toggleConnections();
}

/** @param {string} mode */
export function changeMode(mode) {
    core.canvasManager.setMode(mode);
    updateStatus('模式已切换为' + mode);
}

export function fitView() {
    core.canvasManager.fitView();
}

/**
 * 整理布局：按连线方向（右出 → 左入）重排画布节点，排完自动适应视图。
 * 数据加载时会自动跑一次；手工拖动打乱后可用右下控制面板的按钮重排。
 */
export function organizeLayout() {
    if (!core) return;
    const result = core.organizeLayout();
    if (!result.count) {
        updateStatus('画布上没有可整理的节点');
        return;
    }
    updateStatus(`✅ 已按引用方向铺行：${result.count} 个节点 / ${result.rows} 行（最宽 ${result.columns} 个）`);
}

/** @param {number} scale */
export function setScale(scale) {
    updateStatus('缩放比例已设置为' + scale);
    core.canvasManager.setZoom(scale);
}

export function openFilesPage() {}

/** ⚙️ 设置弹窗 */
let settingsPopoverEl = null;
let settingsOutsideHandler = null;

/** 设置弹窗里的「节点配色」色板预览（面板里改色后同步刷新；弹窗关闭时置空） */
let palettePreviewEl = null;

/** 「节点配色」悬浮面板（子页面式浮层） */
let colorPanelEl = null;
let colorPanelKeyHandler = null;

const SETTINGS_STORAGE_KEY = 'nodeEditor.settings';

/** @param {string} key @param {any} value */
function saveSetting(key, value) {
    if (!core || !core.setting) return;
    core.setting[key] = value;
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(core.setting));
        // 保留旧 key，兼容实时同步功能已使用过的本地配置。
        if (key === 'realtimeTextSync') localStorage.setItem('nodeEditor.realtimeTextSync', value ? '1' : '0');
    } catch {
        /* 忽略存储不可用 */
    }
    applySetting(key, value);
}

/** @param {string} key @param {any} value */
function applySetting(key, value) {
    if (!core) return;
    if (key === 'defaultZoom') {
        core.canvasManager.setZoom(Number(value));
    } else if (key === 'layoutRowLimit') {
        // 行宽改了：画布上有节点就按新行宽立即重排
        if (core.nodes.length) core.organizeLayout();
    } else if (key === 'animationSpeed') {
        document.documentElement.style.setProperty('--transition-fast', `${Number(value)}ms ease-in-out`);
    } else if (key === 'connectionStyle') {
        document.documentElement.dataset.connectionStyle = String(value);
        // 连线样式变了，按新样式重算全部连接线路径
        core.connectionManager.refreshAllConnections();
    } else if (key === 'showGrid') {
        document.body.classList.toggle('hide-canvas-grid', !value);
    } else if (key === 'gridSize') {
        document.documentElement.style.setProperty('--canvas-grid-size', `${Number(value)}px`);
    } else if (key === 'theme') {
        document.documentElement.dataset.theme = String(value);
    } else if (key === 'language') {
        document.documentElement.lang = String(value);
    } else if (key === 'propertyLevel') {
        // 属性档位只影响此后新建节点：已有节点的属性不动（要换档请新建节点）
        NodeTypeRegistry.setPropertyLevel(String(value));
    } else if (key === 'refPropertyLayout') {
        // 副本排布变了：重建所有引用副本（属性区 + 端口）
        core.refreshAllRefs();
    } else if (key === 'extraParseListVariables') {
        // 开关即时生效：开启 → 解析当前画布；关闭 → 清掉自己生成的变量节点
        if (value) core.attachVariableNodes();
        else core.detachVariableNodes();
    } else if (key === 'showDanglingPorts') {
        // 同理：开启 → 建悬空端口；关闭 → 清掉它们
        if (value) core.attachDanglingPorts();
        else core.detachDanglingPorts();
    } else if (key === 'inlineAutoMerge') {
        // 开启：把后端拆出来的内联子节点合并成容器；关闭：把容器拆开
        if (value) core.attachInlineContainers();
        else core.detachContainers();
    } else if (key === 'passthroughVariables' || key === 'passthroughListVariables') {
        // 透传开关变了：重建各个容器的透传属性（代理属性同步跟着重新绑）
        core.containerNodes.forEach((_record, containerId) => core._refreshContainerViews(containerId));
    } else if (key === 'hubLabelMode') {
        setHubLabelMode(String(value));
        // 重新渲染容器，让标签在「标签栏 / 右下角图标」之间切过来
        core.containerNodes.forEach((_record, containerId) => {
            const view = core.nodeManager.nodeViews.get(String(containerId));
            if (view && typeof view.redraw === 'function') view.redraw();
        });
    }
}

/** 将保存的可视设置应用到当前页面 */
function applySavedSettings() {
    if (!core || !core.setting) return;
    [
        'theme',
        'language',
        'defaultZoom',
        'animationSpeed',
        'connectionStyle',
        'gridSize',
        'showGrid',
        'propertyLevel',
        'refPropertyLayout',
        'extraParseListVariables',
        'showDanglingPorts',
        'inlineAutoMerge',
        'passthroughVariables',
        'passthroughListVariables',
        'hubLabelMode',
    ].forEach((key) => applySetting(key, core.setting[key]));
}

/**
 * 读取 config.json：快捷键/设置默认值 + 出厂节点配色
 *
 * 配色永远先应用（用户本地改过的项在配色表里优先），设置默认值仅在用户没存过设置时生效。
 */
async function loadConfigSettings() {
    try {
        const response = await fetch('./config.json');
        if (!response.ok) return;
        const config = await response.json();
        if (!config) return;
        // 出厂配色（config.json → nodeColors）：用户本地覆盖仍然优先
        if (config.nodeColors && setFactoryNodeColors(config.nodeColors)) {
            if (core) core.applyNodeColors();
        }
        if (!config.settings || !core || core.hasSavedSettings) return;
        Object.assign(core.setting, config.settings);
        applySavedSettings();
    } catch {
        // 浏览器离线或 Webview 资源加载失败时继续使用内置默认设置
    }
}

/**
 * 刷新设置面板里「属性档位」的说明文字（跟着下拉框当前值走）
 *
 * @param {HTMLElement} popover - 设置弹窗根元素
 */
function updatePropertyLevelHint(popover) {
    const hint = /** @type {HTMLElement | null} */ (popover.querySelector('[data-hint-for="propertyLevel"]'));
    const select = /** @type {HTMLSelectElement | null} */ (popover.querySelector('[data-setting="propertyLevel"]'));
    if (!hint || !select) return;
    const option = PROPERTY_LEVEL_OPTIONS.find((item) => item.value === select.value);
    hint.textContent = option ? option.description : '';
}

/** 设置里「节点配色」的色板预览（20 个小色块，点它打开配色面板） */
function renderPaletteChips() {
    const colors = getNodeColors();
    return NODE_COLOR_ITEMS.map(
        (item) => `<span class="palette-chip" data-chip="${item.key}" style="background: ${colors[item.key] || '#ffffff'}"></span>`
    ).join('');
}

/** 刷新设置弹窗里的色板预览（面板里改完色后同步） */
function updatePalettePreview() {
    if (!palettePreviewEl) return;
    const colors = getNodeColors();
    palettePreviewEl.querySelectorAll('[data-chip]').forEach((/** @type {HTMLElement} */ chip) => {
        const key = chip.dataset.chip;
        if (key) chip.style.background = colors[key] || '#ffffff';
    });
}

/**
 * 接线设置弹窗里的色板预览：点一下打开「节点配色」悬浮面板
 *
 * @param {HTMLElement} popover - 设置弹窗根元素
 */
function initPalettePreview(popover) {
    palettePreviewEl = /** @type {HTMLElement | null} */ (popover.querySelector('[data-open-colors]'));
    palettePreviewEl?.addEventListener('click', () => openColorPanel());
}

/**
 * 打开 / 切换「节点配色」悬浮面板（子页面式浮层）
 *
 * 配色放在自己的浮层里而不是设置弹窗内：设置弹窗是窄且可滚动的 popover，
 * 原生调色板弹层在里面容易被裁剪/滚动顶掉，这里给它一个独立、不受裁剪的容器。
 * 面板内容：20 行 `[原生色块][中文名]` + 「恢复默认配色」；✕ / Esc 关闭。
 */
export function openColorPanel() {
    if (colorPanelEl) {
        closeColorPanel();
        return;
    }
    const panel = document.createElement('div');
    panel.className = 'color-panel';
    panel.innerHTML = `
        <div class="color-panel-header">
            <span class="color-panel-title">🎨 节点配色</span>
            <button type="button" class="color-panel-close" data-close-colors title="关闭（Esc）">✕</button>
        </div>
        <div class="color-panel-body">
            <div class="settings-color-grid">
                ${NODE_COLOR_ITEMS.map(
                    (item) =>
                        `<div class="settings-color-item" title="--node-${item.key}"><input type="color" data-node-color="${item.key}" /><span>${item.label}</span></div>`
                ).join('')}
            </div>
        </div>
        <div class="color-panel-footer">
            <div class="settings-hint">改完立即应用到画布上已有节点；选择记在本地</div>
            <button type="button" class="settings-reset-btn" data-reset-colors>恢复默认配色</button>
        </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('[data-close-colors]')?.addEventListener('click', closeColorPanel);
    colorPanelKeyHandler = (e) => {
        if (e.key === 'Escape') closeColorPanel();
    };
    document.addEventListener('keydown', colorPanelKeyHandler);
    initColorControls(panel);
    colorPanelEl = panel;
}

/** 关闭「节点配色」悬浮面板 */
function closeColorPanel() {
    if (colorPanelKeyHandler) {
        document.removeEventListener('keydown', colorPanelKeyHandler);
        colorPanelKeyHandler = null;
    }
    if (colorPanelEl) {
        colorPanelEl.remove();
        colorPanelEl = null;
    }
    updatePalettePreview();
}

/**
 * 接线配色面板里的色块：改色走 `NodeTypeRegistry.setNodeColor()`（改配色表 + 存本地），
 * 再让画布上已有节点重绘。
 *
 * @param {HTMLElement} panel - 配色面板根元素
 */
function initColorControls(panel) {
    const current = getNodeColors();
    panel.querySelectorAll('[data-node-color]').forEach((/** @type {HTMLInputElement} */ input) => {
        const key = input.dataset.nodeColor;
        if (!key) return;
        input.value = current[key] || '#ffffff';
        input.addEventListener('change', () => {
            if (!NodeTypeRegistry.setNodeColor(key, input.value)) input.value = getNodeColors()[key] || '#ffffff';
            if (core) core.applyNodeColors();
            updatePalettePreview();
        });
    });

    const resetBtn = panel.querySelector('[data-reset-colors]');
    resetBtn?.addEventListener('click', () => {
        resetNodeColors();
        const defaults = getNodeColors();
        panel.querySelectorAll('[data-node-color]').forEach((/** @type {HTMLInputElement} */ input) => {
            const key = input.dataset.nodeColor;
            if (key) input.value = defaults[key] || '#ffffff';
        });
        if (core) core.applyNodeColors();
        updatePalettePreview();
    });
}

/** 关闭设置弹窗 */
function closeSettings() {
    if (settingsPopoverEl) {
        settingsPopoverEl.remove();
        settingsPopoverEl = null;
    }
    palettePreviewEl = null;
    if (settingsOutsideHandler) {
        document.removeEventListener('mousedown', settingsOutsideHandler, true);
        settingsOutsideHandler = null;
    }
}

/** 打开/切换右上角 ⚙️ 设置弹窗 */
export function openSettings() {
    if (settingsPopoverEl) {
        closeSettings();
        return;
    }
    const btn = document.getElementById('settingBtn');
    const popover = document.createElement('div');
    popover.className = 'settings-popover';
    popover.innerHTML = `
        <div class="settings-popover-title">⚙️ 设置</div>
        <section class="settings-section">
            <div class="settings-section-title">通用</div>
            <label class="settings-field">主题
                <select data-setting="theme"><option value="dark">深色</option><option value="light">浅色</option></select>
            </label>
            <label class="settings-field">语言
                <select data-setting="language"><option value="zh-cn">简体中文</option><option value="en">English</option></select>
            </label>
        </section>
        <section class="settings-section">
            <div class="settings-section-title">画布</div>
            <label class="settings-field">默认缩放
                <input data-setting="defaultZoom" type="number" min="0.1" max="5" step="0.1" />
            </label>
            <label class="settings-field">最小缩放
                <input data-setting="minZoom" type="number" min="0.1" max="5" step="0.1" />
            </label>
            <label class="settings-field">最大缩放
                <input data-setting="maxZoom" type="number" min="0.1" max="10" step="0.1" />
            </label>
            <label class="settings-field">网格大小
                <input data-setting="gridSize" type="number" min="5" max="200" step="1" />
            </label>
            <label class="settings-option"><input data-setting="snapToGrid" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">对齐网格</span></span></label>
            <label class="settings-option"><input data-setting="showGrid" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">显示网格</span></span></label>
            <label class="settings-option"><input data-setting="showMiniMap" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">显示小地图</span></span></label>
        </section>
        <section class="settings-section">
            <div class="settings-section-title">布局</div>
            <label class="settings-field">每行最多节点数
                <input data-setting="layoutRowLimit" type="number" min="2" max="200" step="1" />
            </label>
        </section>
        <section class="settings-section">
            <div class="settings-section-title">节点</div>
            <label class="settings-field">属性档位
                <select data-setting="propertyLevel">${PROPERTY_LEVEL_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}</select>
            </label>
            <div class="settings-hint" data-hint-for="propertyLevel"></div>
            <label class="settings-option"><select data-setting="refPropertyLayout"><option value="copy">按原节点复制（默认）</option><option value="spread">端口集中到两侧</option></select><span class="settings-option-text"><span class="settings-option-name">引用副本属性区</span><span class="settings-option-desc">副本内部怎么摆：照原节点的样子复制（分组、端口位置都不变），或压平成只读值、把所有端口（含可变属性里的）收到左右两侧，布线时不用找</span></span></label>
            <label class="settings-option"><input data-setting="extraParseListVariables" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">额外解析列表 / 字典变量</span><span class="settings-option-desc">导入数据时，把字段里的对象 / 对象数组额外解析成 table / list 变量节点（变量节点的字典 / 列表形态）并连线（默认关：节点数会明显增加）</span></span></label>
            <label class="settings-option"><input data-setting="showDanglingPorts" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">显示悬空端口</span><span class="settings-option-desc">给指向画布外目标的引用建一个只有端口的占位节点（可看明细与跳转）</span></span></label>
            <label class="settings-option"><input data-setting="inlineAutoMerge" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">自动合并内联子节点</span><span class="settings-option-desc">把后端拆出来的内联子节点（宿主 + 子节点）自动合并成一个容器节点（默认关：用右键「合并为容器节点」手动做）</span></span></label>
            <label class="settings-option"><input data-setting="passthroughVariables" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">透传变量</span><span class="settings-option-desc">容器收起时，把成员的文本变量直接摆出来（可直接编辑，改的就是里面那个节点）</span></span></label>
            <label class="settings-option"><input data-setting="passthroughListVariables" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">透传列表 / 字典变量</span><span class="settings-option-desc">容器收起时，把成员的 table / list 变量节点直接摆出来（同样可编辑）</span></span></label>
            <label class="settings-option"><select data-setting="hubLabelMode"><option value="bar">标签栏（默认）</option><option value="corner">右下角图标</option></select><span class="settings-option-text"><span class="settings-option-name">Hub 标签样式</span><span class="settings-option-desc">容器透传属性的来源标签：放在 hub 上方的标签栏，或收到右下角图标里悬停看</span></span></label>
        </section>
        <section class="settings-section">
            <div class="settings-section-title">节点配色</div>
            <button type="button" class="palette-preview" data-open-colors title="点击打开配色面板">
                ${renderPaletteChips()}
            </button>
            <div class="settings-hint">点击色板打开配色面板（原生调色板）；改完立即生效，选择记在本地</div>
        </section>
        <section class="settings-section">
            <div class="settings-section-title">编辑</div>
            <label class="settings-option"><input data-setting="realtimeTextSync" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">实时文本同步</span><span class="settings-option-desc">编辑文本输入框或文本变量节点时，每次键入立即同步到连接的文本节点</span></span></label>
            <label class="settings-option"><input data-setting="autoSave" type="checkbox" /><span class="settings-option-text"><span class="settings-option-name">自动保存</span></span></label>
            <label class="settings-field">自动保存间隔（秒）
                <input data-setting="autoSaveInterval" type="number" min="10" max="3600" step="10" />
            </label>
            <label class="settings-field">动画时长（毫秒）
                <input data-setting="animationSpeed" type="number" min="0" max="2000" step="50" />
            </label>
            <label class="settings-field">连接线样式
                <select data-setting="connectionStyle"><option value="bezier">贝塞尔曲线</option><option value="straight">直线</option></select>
            </label>
        </section>
    `;
    popover.querySelectorAll('[data-setting]').forEach((/** @type {HTMLInputElement | HTMLSelectElement} */ control) => {
        const key = control.dataset.setting;
        if (!key || !core || !core.setting) return;
        if (control instanceof HTMLInputElement && control.type === 'checkbox') {
            control.checked = !!core.setting[key];
        } else if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
            control.value = String(core.setting[key] ?? '');
        }
        control.addEventListener('change', () => {
            const value =
                control instanceof HTMLInputElement && control.type === 'checkbox'
                    ? control.checked
                    : control instanceof HTMLInputElement && control.type === 'number'
                      ? Number(control.value)
                      : control.value;
            saveSetting(key, value);
            if (key === 'propertyLevel') updatePropertyLevelHint(popover);
        });
    });
    document.body.appendChild(popover);
    updatePropertyLevelHint(popover);
    initPalettePreview(popover);

    // 定位在齿轮按钮正下方、右缘对齐
    const rect = btn ? btn.getBoundingClientRect() : { bottom: 48, right: 280 };
    popover.style.top = `${rect.bottom + 6}px`;
    popover.style.right = `${window.innerWidth - rect.right}px`;

    settingsPopoverEl = popover;
    settingsOutsideHandler = (e) => {
        if (settingsPopoverEl && !settingsPopoverEl.contains(e.target) && !(btn && btn.contains(e.target))) {
            closeSettings();
        }
    };
    document.addEventListener('mousedown', settingsOutsideHandler, true);
}

// 撤销上一次操作
export function undoLastAction() {}

// 重做上一次撤销的操作
export function redoLastAction() {}

export function testCommunication() {}

function printMemoryUsed(postMessage = '') {
    if (performance.memory) {
        console.log(postMessage, {
            // 已分配的堆内存总量
            totalHeapSize: performance.memory.totalJSHeapSize / 1024 / 1024 + ' MB',
            // 当前正在使用的堆内存
            usedHeapSize: performance.memory.usedJSHeapSize / 1024 / 1024 + ' MB',
            // 内存限制（上限）
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit / 1024 / 1024 + ' MB',
        });
    }
}

export function generateTest() {
    printMemoryUsed('初始内存');

    for (let index = 0; index < 1000; index++) {
        setTimeout(() => {
            addTestNode();
        }, index * 10);
    }

    setTimeout(() => {
        printMemoryUsed('分配后内存');

        clearCanvas();
        setTimeout(() => {
            core.forceRepaint();
            printMemoryUsed('回收后内存');
        }, 100);
    }, 10000);
}

export function toggleConsole() {
    if (isVsCodeWebview) {
        vscode.postMessage({ command: 'openConsole' });
    } else {
        eruda.get('entryBtn').show();
        eruda.show();
    }
}
/** @param {string} panel */
export function togglePanel(panel) {
    core.panelManager.togglePanel(panel);
}

export function customCheck() {
    console.log('自定义检测:资源释放');

    const nodeTypeConfig = NodeTypeRegistry.getType('test');

    let nodeModel = new NodeModel(1, 1, 'test', 0, 0, nodeTypeConfig);

    // nodeModel.setProperties(NodeGenerator.createProps(1, nodeTypeConfig.properties, new WeakRef(nodeModel)));

    // nodeModel.setExProps(NodeGenerator.createRecordProps(1, nodeTypeConfig.exProperties, new WeakRef(nodeModel)));

    let nodeView = document.createElement('div');
    nodeView.style.position = 'relative';
    nodeView.style.top = '50px';
    nodeView.style.left = '50px';
    nodeView.style.width = '240px';
    nodeView.style.height = '240px';
    nodeView.style.boxShadow = '0 0 12px #ffffff';

    const world = document.getElementById('canvas');

    world.appendChild(nodeView);
    // world.appendChild(nodeView.element);

    nodeModel.initialize();
    const weakRef = new WeakRef(nodeView);

    setTimeout(() => {
        nodeModel = null;
        nodeView.remove();
        nodeView = null;
    }, 10);

    // 稍后（例如在 setTimeout 中）检查
    console.log('检查释放');
    setInterval(() => {
        const recovered = weakRef.deref();
        if (recovered) {
            console.log('对象尚未被释放');
        } else {
            console.log('对象已经被释放（或即将被释放）');
        }
    }, 5000);
}

/** 预览模式（customEditor「打开方式」）：仅查看当前 json 文件。 由后端注入 NODE_EDITOR_CONFIG.previewMode 触发，隐藏侧边栏/顶栏等编辑功能。 */
const PREVIEW_MODE = !!(typeof window !== 'undefined' && window.NODE_EDITOR_CONFIG && window.NODE_EDITOR_CONFIG.previewMode);
if (PREVIEW_MODE) {
    document.body.classList.add('preview-mode');
}

if (PREVIEW_MODE) {
    // 预览模式：改标签页标题便于识别（开发宿主中可直接看到是否生效）
    document.title = '节点编辑器 · 预览模式（仅查看）';
    console.log('[预览模式] 已启用：仅查看当前 json');

    // 预览仅查看：节点内容只读，禁止编辑（节点拖动保留，由 select 模式支持）
    // 文本类输入 readOnly（可选中复制）；按钮/下拉/开关/滑杆禁用
    const applyPreviewReadOnly = () => {
        document.querySelectorAll('#canvas-world input[type="text"], #canvas-world input[type="number"], #canvas-world textarea').forEach((el) => {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.readOnly = true;
        });
        document
            .querySelectorAll(
                '#canvas-world input[type="radio"], #canvas-world input[type="checkbox"], #canvas-world input[type="range"], #canvas-world select, #canvas-world button'
            )
            .forEach((el) => {
                // disabled 仅存在于表单元素（input/select/button），HTMLElement 无此属性
                if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement) {
                    el.disabled = true;
                }
            });
    };
    applyPreviewReadOnly();
    // 节点视图可能重建/新增（redraw、铺图、数据选择器），用 MutationObserver 持续保持只读
    const previewRo = new MutationObserver(applyPreviewReadOnly);
    previewRo.observe(document.body, { childList: true, subtree: true });
}

/** 预览模式右上角的「搜索节点」框（编辑模式用侧边栏面板，这里为 null） */
let nodeSearchBox = null;

/**
 * 创建并挂载搜索框：输入 title / id / label 即可过滤，选中后由核心控制器定位到该节点。
 *
 * @param {ControllerCore} coreInstance
 */
function initNodeSearchBox(coreInstance) {
    if (nodeSearchBox) return nodeSearchBox;
    nodeSearchBox = new NodeSearchBox({
        getNodes: () => coreInstance.nodes,
        onPick: (node) => coreInstance.focusNode(node.id),
    });
    nodeSearchBox.mount(document.body);
    win.nodeSearchBox = nodeSearchBox;
    return nodeSearchBox;
}

/**
 * 顶部页面（工作区）选项卡栏：新建 / 切换 / 改名 / 拖拽排序 / 关闭 / 逐页存成文件。
 * 具体动作都在 views/tabBar.js 与 PageManager 里，这里只把「存文件」接到宿主（或浏览器下载）。
 *
 * @param {ControllerCore} coreInstance
 */
function initPageTabs(coreInstance) {
    if (tabBar) return tabBar;
    tabBar = new TabBar({
        pageManager: coreInstance.pageManager,
        onSavePage: (pageId) => savePageToFile(pageId),
        onSaveAll: () => saveGraph(),
        onStatus: (text) => updateStatus(text),
    });
    win.pageTabBar = tabBar;
    return tabBar;
}

/** @type {TabBar | null} 页面选项卡栏（预览模式不建） */
let tabBar = null;

// 初始化函数
function initWebview(callback) {
    console.log('初始化Webview');

    const world = document.getElementById('canvas-world');
    const viewport = document.getElementById('canvas-viewport');

    if (!world || !viewport) {
        console.error('❌ 未找到画布或视口元素');
        return;
    }

    if (core) {
        // 已经初始化过，直接回调
        if (callback) callback(null, core);
        return;
    }

    // 模拟异步初始化（例如加载资源、建立连接）
    setTimeout(() => {
        try {
            core = new ControllerCore(world, viewport);
            // updateStatus("已连接"); // 可恢复
            console.log('核心控制器初始化成功');
            win.controlCore = core;
            applySavedSettings();
            loadConfigSettings();

            // 状态栏消息（如悬空端口跳转的三态提示）：核心控制器只发事件，文案在这里落地
            core.bus.on('status:message', (e) => {
                const ce = /** @type {CustomEvent} */ (e);
                if (ce && ce.detail && ce.detail.text) updateStatus(ce.detail.text);
            });

            // 通知后端 webview 已就绪（自定义编辑器「打开方式」依赖此信号发送预览数据）
            if (PREVIEW_MODE) {
                // 预览仅查看：用 select 模式（点击节点可选中并拖动整理布局）；
                // 注意不能用 drag 模式——nodeManager 在 drag 模式下对节点 mousedown 直接清选并 return，节点无法拖动。
                core.canvasManager.setMode('select');
                initNodeSearchBox(core);
            } else {
                // 编辑模式：挂上页面（工作区）选项卡栏，并打开「刷新后仍在」
                initPageTabs(core);
                core.pageManager.enablePersistence();
            }

            // 通知后端 webview 已就绪（自定义编辑器「打开方式」依赖此信号发送预览数据）
            if (vscode) {
                vscode.postMessage({ command: 'webviewReady' });
            }

            if (callback) callback(null, core);
        } catch (error) {
            console.error('初始化失败:', error);
            if (callback) callback(error);
        }
    }, 100); // 假设初始化需要100ms
}

// 自动初始化
if (document.readyState === 'loading') {
    updateStatus('正在初始化...');
    console.log('正在初始化...');
    document.addEventListener('DOMContentLoaded', () => {
        initWebview();
    });
} else {
    initWebview();
    updateStatus('初始化完成');
}

/** @type {any} */
const win = window;
win.vscode = vscode;

win.toggleConsole = toggleConsole;

win.openFilesPage = openFilesPage;
win.openSettings = openSettings;
win.togglePanel = togglePanel;

win.clearCanvas = clearCanvas;
win.addNode = addNode;
win.addBlankNode = addBlankNode;
win.addTestNode = addTestNode;

win.readMod = readMod;
win.saveGraph = saveGraph;
win.savePageToFile = savePageToFile;
win.loadGraph = loadGraph;
win.newMod = newMod;
win.openJsonPreview = openJsonPreview;

// 页面（工作区）：功能与 tab 栏一致，供控制台 / 自定义按钮直接调
win.newPage = () => tabBar?.newPage() ?? (core ? core.pageManager.createPage() : null);
win.switchPage = (id) => core?.pageManager.switchTo(id);
win.closePage = (id) => tabBar?.closePage(id) ?? core?.pageManager.closePage(id);
win.renamePage = (id, name) => core?.pageManager.renamePage(id, name);
win.listPages = () => (core ? core.pageManager.describe() : []);
win.openPageManager = () => tabBar?.togglePanel(true);

win.setScale = setScale;
win.fitView = fitView;
win.organizeLayout = organizeLayout;
win.changeMode = changeMode;
win.toggleConnections = toggleConnections;

win.controlCore = core;

win.generateTest = generateTest;
win.customCheck = customCheck;

// 接收 VSCode 后端消息（init / originLoaded / modLoaded / jsonPreviewLoaded / modCreated ...）
// 浏览器环境也挂载，便于用 window.postMessage 调试；真实 webview 中后端消息同样走该事件。
window.addEventListener('message', handleVscodeMessage);
