# vite-vue 响应式前端设计

> **状态**：只有接口层 —— Vite 工程配置、入口 HTML、与扩展通信的 `src/host/bridge.js`、本设计。
> **不含任何界面实现**（组件、状态、样式都还没写），界面按下面的设计从 `src/` 往下长。
>
> **本线暂不用于发布**：`master` 仍然走 `vanilla-frontend`。

---

## 1. 为什么单开一条线

`vite-vanilla` 把旧的 `ui/` 原样搬进了 Vite（`frontend/src/` 就是那份代码），
**构建方式现代化了，但渲染方式还是「原生 JS 直接操作 DOM」**：

- 节点、面板、连线各自持有 DOM 引用，靠 `eventBus` 手动同步；
- 状态散落在 `nodeManager` / `panelManager` / `connectionManager` 里，谁改了谁负责重绘；
- 节点数量一多，红绘范围难以控制（见 `test/ui/nodeLifecycle.test.mjs` 覆盖的那批生命周期坑）。

vite-vue 要验证的是另一条路：**用 Vue 的响应式把「数据 → 视图」变成声明式**，
让「状态从哪来、谁改了它」变成可推理的，而不是靠调用顺序。

## 2. 目录与职责

```
frontend/
├─ index.html            入口：含 #app 的静态骨架（首屏不白 + 集成测试断言用）
├─ src/
│  ├─ main.js            入口：目前只 installHostBridge()
│  └─ host/bridge.js     ★ 与扩展宿主的接口（postMessage / NODE_EDITOR_CONFIG）
├─ DESIGN.md             本文件
└─ public/               运行时数据（config / help / json-manifest / webview-config / assets / error.html）
```

> `index.html` 里的静态骨架有两个作用：脚本执行前不白屏；
> 以及扩展宿主的集成测试要断言 `canvas-basic` / `canvas-viewport` 存在（`test/extension.test.js`）。
> 界面实现接进来时从这些节点往下长。

## 3. 与扩展的边界（保持不变）

前端怎么被加载，仍然由 core 的契约层决定，**vite-vue 不需要改任何后端代码**：

| 环节 | 负责方 |
| --- | --- |
| 生产：读 `frontend/dist/index.html`、把 `./assets/**` 换成 webview URI | `frontend-host/vite.js`（core 同步而来） |
| 开发：`CNE_DEV_SERVER=1` 时指向 dev server + 注入放宽的 CSP | 同上 |
| 注入 `window.NODE_EDITOR_CONFIG`、`previewMode` | `frontend-host/index.js`（core 同步而来） |
| webview → 扩展的命令 | `src/host/bridge.js` 的 `postToHost()`，命令名沿用扩展侧 `extension.js` 的 switch（`readMod` / `saveGraph` / `newMod` / `openJsonPreview` …） |

`src/host/bridge.js` 已经把 `acquireVsCodeApi()` 的「只能调用一次」和「浏览器里没有它」
两个坑封住了：非 webview 环境退化成 `console` 输出，方便直接开 dev server 调 UI。

## 4. 组件划分（对照旧实现）

实现时按「一个现有文件 → 一个组件 / 一个 composable」对照，避免凭空设计
（“现有文件”指 `vite-vanilla` 的 `frontend/src/`）：

| 现有实现（vite-vanilla） | 本线落点 |
| --- | --- |
| `views/nodeView.js` | `components/GraphNode.vue` |
| `controllers/nodeManager.js` | `stores/graph.js` + `composables/useNodes.js` |
| `controllers/canvasManager.js` | `components/NodeCanvas.vue` + `composables/useCanvasTransform.js` |
| `controllers/connectionManager.js` | `components/ConnectionLayer.vue`（建议单层 SVG，而不是每根线一个组件） |
| `controllers/historyManager.js` | `stores/history.js`（撤销 / 重做） |
| `controllers/panelManager.js` + `views/panelView.js` | `components/PropertyPanel.vue` + `components/panels/*` |
| `models/propModels/*` + `generators/propGenerator.js` | `components/props/*`（数值 / 选项 / 端口 / 表格 / 图片），工厂函数保留为纯函数 |
| `types/eventBus.js`、`IEventTarget.js` | **不再需要** —— 由响应式依赖追踪取代 |
| `modDataRegistry.js` | `stores/dataRegistry.js` |

原则：**模型层保持纯数据**（不带 DOM、不带订阅），响应式只加在 store 上。

## 5. 状态管理

起步阶段 `reactive` + `computed` 就够（预计只有一个 `stores/graph.js`），不必急着引 Pinia。什么时候该升级：

- ✅ 需要 devtools 时间旅行看状态变化；
- ✅ store 之间开始互相依赖（历史记录要读图状态、数据池要被多个面板共享）；
- ✅ 出现「同一份状态被多个页面 tab 共享」的需求。

建议在**做历史记录（阶段 4）之前**决定。Pinia 体积很小，晚换不如早换；
但如果最终发现只需要一两个 store，`reactive` 也够用 —— 不必为了规范而规范。

## 6. 性能：这是这次改造真正要解决的问题

原版内容会预加载成上千个节点（`cultistNodeEditor.preloadOrigin`），所以：

1. **控制响应式深度**：节点数据用 `shallowRef` / `markRaw` 存，
   `props` 只在属性面板真的打开时再转成响应式 —— Vue 的深层代理在大数组上是实打实的开销。
2. **视口裁剪**：只渲染可视区域内的节点（`canvas-viewport` 的尺寸 + transform 反推）。
3. **连线单层渲染**：一根线一个组件在千节点规模下会直接卡死，用一层 SVG/Canvas 统一画。
4. **缩放走 CSS transform**，不要改每个节点的坐标（避免整树重排）。
5. 补一个「节点数增长 → GC 后堆内存不线性增长」的检查
   （`vite-vanilla` 的 `test/ui/memory-check.mjs` 是现成的参考）。

## 7. 迁移计划

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| 0 | ✅ 接口层：Vite 工程、入口 HTML、宿主通信接口 | `pnpm run build:ui` 通过 |
| 1 | 画布与数据：graph store + Vue 组件 + `readMod` / 数据池接入 | 打开编辑器能看到 mod 里的条目 |
| 2 | 属性面板：类型化控件 + 编辑回写 | 与现有实现字段覆盖一致 |
| 3 | 连线：按 id 引用解析 + SVG 层绘制 | 引用关系与现有实现一致 |
| 4 | 历史记录：撤销 / 重做（含 `dispose` 语义） | `vite-vanilla` 的 `disposeChain` / `nodeLifecycle` 用例在新实现上等价通过 |
| 5 | 多页面 tab、文本变量同步、设置面板 | 功能对齐 `vite-vanilla` |
| 6 | 验收后决定是否让 `master` 切到本线 | 完整 CI + 手工验收 |

**测试策略**：本线目前没有前端测试（原来那份 `test/ui/**` 断言的是「直接操作 DOM」的旧实现，已随之移除）。
写实现时同步补 `@vue/test-utils` + store 单测，不要试图复用旧断言。

## 8. 风险与取舍

- **全量重写成本高**：44 个模块的交互细节（端口校验、扩展属性池、模式属性、变量同步）
  都踩过坑，迁移时务必对着旧实现逐个核对，别按印象重写。
- **事件模型换血**：旧的 `eventBus` 在若干处承担了「跨模块通知」，
  改成响应式后要确认「谁触发、谁响应」仍然清晰，尤其是有副作用的地方（如重绘、dispose）。
- **性能未必自动变好**：Vue 的响应式是双刃剑，用错位置（深层大对象）会比手写 DOM 更慢，
  所以第 6 节那几条要在一开始就守住。
- **两条前端线并行**：`vite-vanilla` 还会继续修 bug。
  阶段 1–5 期间**只修不迁移**，等本线功能对齐后再决定「合流」还是「替换」。

---

## 附：本地怎么跑

```bash
# 1) 同步后端（本线不跟踪后端代码）
#    VS Code 里 Ctrl+Shift+B 跑「同步后端（core → 本工作区）」，或：
node ../../cultist-node-editor/scripts/sync-backend.mjs .

pnpm install
pnpm run dev       # dev server :5173（扩展设 CNE_DEV_SERVER=1 后走 HMR）
pnpm run build:ui  # 产出 frontend/dist
```

F5 调试用 `.vscode/launch.json` 里的「运行扩展（Vite dev server + HMR）」。
