import { ControllerCore } from './controllers/controllerCore.js';
import { NodeModel } from './models/nodeModels/nodeModel.js';
import { NodeTypeRegistry } from './types/nodeTypes.js';
import { NodeGenerator } from './generators/nodeGenerator.js';
import { NodeView } from './views/nodeView.js';
import { ModDataRegistry } from './modDataRegistry.js';

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

/** 保存图表（经 VSCode 后端写入文件） */
export function saveGraph() {
    updateStatus('保存图表...');
    if (!vscode) {
        console.warn('非 VSCode 环境，无法保存图表');
        return;
    }
    const graphData = {
        nodes: (core ? core.nodes : []).map((node) => node.toJSON()),
        connections: [],
        metadata: {
            created: new Date().toISOString(),
            version: '1.0',
        },
    };
    vscode.postMessage({ command: 'saveGraph', data: graphData });
}

/** 加载图表（从 JSON 文件恢复） */
export function loadGraph() {
    updateStatus('加载图表...');
    if (vscode) {
        vscode.postMessage({ command: 'loadGraph' });
    } else {
        console.warn('非 VSCode 环境，无法加载图表');
    }
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
    } else {
        console.warn('非 VSCode 环境，无法预览 json');
    }
}

/**
 * 把后端加载的数据注册进数据池（按类别，供基础类型实例化时选择）。 注意：节点类型始终是基础类型（recipes/elements/...），这里不注册任何动态类型。
 *
 * @param {string} label - 来源描述（用于状态提示）
 * @param {{ namespace: string; source: string; categories: Record<string, any[]>; count?: number }} data
 */
/** 已预览过的命名空间集合（jsonPreviewLoaded 去重用，防止画布重复铺图） */
const __previewedNamespaces = new Set();

function registerData(label, data) {
    if (!data || !data.categories || typeof data.categories !== 'object') return;
    // 防御：同一命名空间重复加载时先卸载旧数据，避免数据池累积（如重复读取 mod / 预览）
    if (data.namespace && ModDataRegistry.sources[data.namespace]) {
        ModDataRegistry.unregister(data.namespace);
    }
    const registered = ModDataRegistry.register(data);
    // 加载后自动把数据转换为可查看的节点（铺到画布，受规模上限限制；超出保留在数据池）
    const laid = core ? core.autoLayoutLoadedData(data.namespace) : { count: 0, created: [] };
    const created = (laid && laid.count) || 0;
    // 中间模型连接：mod JSON 中的引用 → 已铺图节点间展示连线（引用缺失/未铺图暂悬空）。
    // 延迟一帧再连线：端口圆点 DOM 位置需等本轮布局完成才准确，否则连接线端点会画到未布局位置。
    if (core && Array.isArray(data.links) && laid && laid.created && laid.created.length) {
        requestAnimationFrame(() => {
            const linked = core.connectDataLinks(data.links, laid.created);
            if (linked > 0) console.log(`[数据池] 已展示 ${linked} 条引用连接`);
        });
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
            registerData('游戏基础内容', message.data);
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
            updateStatus(`✅ 图表已加载（${message.data ? message.data.nodes?.length || 0 : 0} 个节点）`);
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

/** @param {number} scale */
export function setScale(scale) {
    updateStatus('缩放比例已设置为' + scale);
    core.canvasManager.setZoom(scale);
}

export function openFilesPage() {}

/** ⚙️ 设置弹窗 */
let settingsPopoverEl = null;
let settingsOutsideHandler = null;

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
    } else if (key === 'animationSpeed') {
        document.documentElement.style.setProperty('--transition-fast', `${Number(value)}ms ease-in-out`);
    } else if (key === 'connectionStyle') {
        document.documentElement.dataset.connectionStyle = String(value);
        // 通过动态属性访问兼容 ConnectionManager 的私有声明，并传入其必需参数。
        core.connectionManager['_updateConnections'](undefined);
    } else if (key === 'showGrid') {
        document.body.classList.toggle('hide-canvas-grid', !value);
    } else if (key === 'gridSize') {
        document.documentElement.style.setProperty('--canvas-grid-size', `${Number(value)}px`);
    } else if (key === 'theme') {
        document.documentElement.dataset.theme = String(value);
    } else if (key === 'language') {
        document.documentElement.lang = String(value);
    }
}

/** 将保存的可视设置应用到当前页面 */
function applySavedSettings() {
    if (!core || !core.setting) return;
    ['theme', 'language', 'defaultZoom', 'animationSpeed', 'connectionStyle', 'gridSize', 'showGrid'].forEach((key) => applySetting(key, core.setting[key]));
}

/** 读取 config.json 中的设置默认值；已有本地用户设置时优先保留用户选择。 */
async function loadConfigSettings() {
    try {
        const response = await fetch('./config.json');
        if (!response.ok) return;
        const config = await response.json();
        if (!config || !config.settings || !core || core.hasSavedSettings) return;
        Object.assign(core.setting, config.settings);
        applySavedSettings();
    } catch {
        // 浏览器离线或 Webview 资源加载失败时继续使用内置默认设置
    }
}

/** 关闭设置弹窗 */
function closeSettings() {
    if (settingsPopoverEl) {
        settingsPopoverEl.remove();
        settingsPopoverEl = null;
    }
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
    popover.querySelectorAll('[data-setting]').forEach((/** @type {HTMLElement} */ control) => {
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
        });
    });
    document.body.appendChild(popover);

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

            if (PREVIEW_MODE) {
                // 预览仅查看：用 select 模式（点击节点可选中并拖动整理布局）；
                // 注意不能用 drag 模式——nodeManager 在 drag 模式下对节点 mousedown 直接清选并 return，节点无法拖动。
                core.canvasManager.setMode('select');
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
win.loadGraph = loadGraph;
win.newMod = newMod;
win.openJsonPreview = openJsonPreview;

win.setScale = setScale;
win.fitView = fitView;
win.changeMode = changeMode;
win.toggleConnections = toggleConnections;

win.controlCore = core;

win.generateTest = generateTest;
win.customCheck = customCheck;

// 接收 VSCode 后端消息（init / originLoaded / modLoaded / jsonPreviewLoaded / modCreated ...）
// 浏览器环境也挂载，便于用 window.postMessage 调试；真实 webview 中后端消息同样走该事件。
window.addEventListener('message', handleVscodeMessage);
