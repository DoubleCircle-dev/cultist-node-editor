# vite-vue 响应式前端设计

> **状态**：骨架阶段 —— 工程链路已通（`pnpm run build:ui` 可产出 `frontend/dist`），
> 界面只有一个示例节点 + 只读属性面板，功能远未与 `vite-vanilla` 对齐。
>
> **本线暂不用于发布**：`master` 仍然走 `vanilla-frontend`。这条分支是「响应式改造」的设计与试验场。

---

## 1. 为什么单开一条线

`vite-vanilla` 把旧的 `ui/` 原样搬进了 Vite（`frontend/src-legacy/` 就是那份代码），
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
├─ src/                  ★ Vue 实现（参与构建）
│  ├─ main.js            挂载：先 installHostBridge() 再 createApp().mount('#app')
│  ├─ App.vue            布局：Toolbar + NodeCanvas + PropertyPanel
│  ├─ components/        表现层组件（.vue）
│  ├─ stores/            状态（目前只有 graph.js）
│  ├─ host/bridge.js     与扩展宿主的通信桥（postMessage / NODE_EDITOR_CONFIG）
│  └─ styles/index.css   全局样式入口 + CSS 变量
├─ src-legacy/           旧的原生实现（**不参与构建**，留作迁移对照）
└─ public/               运行时数据（config / help / json-manifest / webview-config / assets / error.html）
```

> `index.html` 里的 `#app` 内部保留了静态骨架，原因有两个：脚本执行前不白屏；
> 扩展宿主的集成测试会断言 `canvas-basic` / `canvas-viewport` 存在（`test/extension.test.js`）。
> Vue 挂载后会把这块内容整体替换掉。

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

迁移时按「一个旧文件 → 一个组件 / 一个 composable」对照，避免凭空设计：

| 旧实现（`src-legacy/`） | vite-vue 落点 |
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

骨架阶段用 `reactive` + `computed`（`stores/graph.js`），没有引入 Pinia。什么时候该升级：

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
5. 用 `test/ui/memory-check.mjs` 的思路，给 Vue 版补一个「节点数增长 → GC 后堆内存不线性增长」的检查。

## 7. 迁移计划

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| 0 | ✅ 骨架：Vite + Vue 工程、静态骨架、示例节点、只读属性面板 | `pnpm run build:ui` 通过 |
| 1 | 数据加载：`readMod` / 数据池 → 真实节点渲染 | 打开编辑器能看到 mod 里的条目 |
| 2 | 属性面板：类型化控件 + 编辑回写 | 与旧实现字段覆盖一致 |
| 3 | 连线：按 id 引用解析 + SVG 层绘制 | 引用关系与旧实现一致 |
| 4 | 历史记录：撤销 / 重做（含 `dispose` 语义） | 旧单测 `disposeChain` / `nodeLifecycle` 的用例在新实现上等价通过 |
| 5 | 多页面 tab、文本变量同步、设置面板 | 功能对齐 `vite-vanilla` |
| 6 | 验收后决定是否让 `master` 切到本线 | 完整 CI + 手工验收 |

**测试策略**：`test/ui/**` 现在的 jsdom 单测是针对旧实现写的（直接操作 DOM、断言 DOM 状态），
Vue 版需要换成 `@vue/test-utils` + store 单测 —— 新测试与旧测试可以并存，但不要试图复用旧断言。

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
