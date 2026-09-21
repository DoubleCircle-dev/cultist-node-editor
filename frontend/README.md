# frontend —— Vite 前端（`vite-frontend` 分支）

与 `vanilla-frontend` 分支（发布线 `master` 用的就是它）是**同一套前端的两种实现**，
共享 `core/`（mod 加载、数据池）与 `extension.js`，区别只在「前端怎么组织、怎么交给 webview」：

|  | `vanilla-frontend` 线 | `vite-frontend` 线（本分支） |
| --- | --- | --- |
| 目录 | `ui/`（源码即运行时） | `frontend/`（`ui/` 已不存在） |
| 入口 HTML | `ui/webUI.html`，手写 20 条 `<link>` + 2 条 `<script type="module">` | `frontend/index.html`，只有 1 条 `<script type="module" src="/src/main.js">` |
| 样式 | 扩展扫 `ui/css/**` 全量注入 | `src/main.js` → `src/styles/index.css` 集中 `@import` |
| 扩展侧 | `processResources()` + `replaceResourceReferences()`（扫目录、删标签再注入） | 已删除；改为「dev 走 dev server / 生产走 dist」 |
| 构建 | 无 | `npm run build:ui` → `frontend/dist/` |

## 目录结构

```
frontend/
├─ index.html            入口（正文结构照旧，资源列表已交给 Vite）
├─ package.json          {"type":"module"} —— 让 src/** 能被 Node 测试按 ESM 解析
├─ src/
│  ├─ main.js            唯一入口：import 样式 + index.js + debug.js
│  ├─ index.js           应用主入口（自调用 initWebview）
│  ├─ layout/            按引用方向铺行的自动布局（纯函数，见 flowLayout.js）
│  ├─ styles/index.css   样式入口（顺序 = 原来的 <link> 顺序）
│  ├─ styles/**          原 ui/css/**
│  ├─ views/nodeSearchBox.js  预览模式右上角的搜索节点框（title/id/label）
│  ├─ views/tabBar.js         页面（工作区）选项卡栏：新建/切换/改名/排序/关闭 + 页面管理浮层
│  ├─ controllers/pageManager.js   页面生命周期、索引换手、快照/导入、localStorage 持久化
│  ├─ models/pageModels/pageModel.js  页面状态（各自的索引、停放容器、视图与模式）
│  ├─ types/nodePropertyLevels.js  必要/非必要属性划分与档位（最低/标准/全部）
│  ├─ types/nodeColors.js          节点配色表（默认值 + 两层覆盖 + 持久化）
│  ├─ types/nodeFieldStats.js      原版内容字段出现率（由 scripts/ 生成，勿手改）
│  └─ controllers/ models/ views/ generators/ types/ ...  原 ui/scripts/**
├─ scripts/gen-node-field-stats.mjs  按 content/core 重算字段出现率
├─ public/               运行时数据，构建时原样拷贝到 dist/
│  ├─ json-manifest.json / config.json / help.json / UI-config.json
│  ├─ webview-config.json   （扩展读它注入 NODE_EDITOR_CONFIG）
│  ├─ error.html            （加载失败时的兜底页）
│  └─ assets/img/placeholder.png
├─ dev/test.html         手工测试页，不属于构建产物
└─ dist/                 构建产物（git 忽略）
```

## 命令

本分支**用 pnpm 管理**（`pnpm-lock.yaml`，已移除 `package-lock.json`）：

```bash
pnpm install           # 安装依赖
pnpm run dev           # Vite dev server → http://localhost:5173（HMR）
pnpm run build:ui      # 产出 frontend/dist（发布/VSIX 用）
pnpm run build:ui:watch# 边改边构建
pnpm run preview:ui    # 本地预览 dist 产物
pnpm run test:ui       # 前端单元测试（jsdom + mocha）
pnpm run lint          # ESLint
pnpm run gen:field-stats  # 重算原版字段出现率（改了 core/origin_resources 后再跑）
```

- `package.json` 的 `vscode:prepublish` 指向 `build:ui`，打包 VSIX 前会自动构建。
- `pnpm-workspace.yaml` 里 `allowBuilds.esbuild: true` 是**必须的**：pnpm 10+ 默认不执行依赖的安装脚本，
  而 esbuild 需要靠 postinstall 落地平台二进制，否则 `vite build` 直接失败。

## 与后端主干 `core` 同步

后端（`core/**`、`extension.js`、`frontend-host/index.js`）只在 `core` 分支上改，本分支通过 merge 获取：

```bash
git fetch
git merge core          # 或 git merge origin/core
```

预期行为：
- **只改 `core/**` 的提交** → 零冲突（前端代码各在各的目录里）。
- `extension.js` / `frontend-host/index.js` **两边内容完全一致**（前端差异全在 `frontend-host/vite.js`），
  所以正常情况下它们不会出现在冲突列表里 —— 一旦出现，说明有人往 `core` 里塞了 vanilla 专属逻辑。
- ⚠️ **`package-lock.json` 会以 modify/delete 形式冲突**（本分支已删除它，而 `core` 还在用 npm 维护它）。
  出现时这样解决：
  ```bash
  git rm -f package-lock.json && git add -A && git commit --no-edit
  ```

## 两种运行模式（扩展侧）

由环境变量 `CNE_DEV_SERVER` 决定（见 `extension.js` 的 `getDevServerUrl()`）：

| 模式 | 触发 | webview 加载 | 说明 |
| --- | --- | --- | --- |
| 生产（默认） | 不设该变量 | `frontend/dist/index.html`，`./assets/**` 被换成 webview URI | 与发布完全一致 |
| 开发 | `CNE_DEV_SERVER=1`（或写完整地址） | `frontend/index.html` + `http://localhost:5173/@vite/client` + `/src/main.js` | HMR，改代码即时生效；会额外注入放宽的 CSP 允许 dev server 与 websocket |

## 调试（在这个工作区打断点）

1. **扩展宿主（Node 侧：`extension.js` / `core/**`）**
   直接 F5（`运行扩展（项目根）`），断点打在**本工作区**的源文件上即可 —— 源码路径与运行时一致，无需 sourcemap。

2. **webview 里的前端代码**
   `type: "extensionHost"` 的调试配置默认 `debugWebviews: true`，webview 脚本会自动挂到同一个调试会话：
   - **生产模式**：产物 `frontend/dist/assets/index-*.js` 带 sourcemap（`vite.config.mjs` 已开 `sourcemap: true`），断点可直接打在 `frontend/src/**`。
   - **开发模式**：脚本来自 `http://localhost:5173/src/**`，靠 launch 配置里的
     `"sourceMapPathOverrides": { "http://localhost:5173/*": "${workspaceFolder}/frontend/*" }` 映射回本地源码。
   → 用配置 **`运行扩展（Vite dev server + HMR）`**：先在终端跑 `npm run dev`，再 F5。

3. **纯前端（不启动扩展宿主）**
   配置 **`调试前端（Chrome + dev server）`**：先 `npm run dev`，再 F5，直接在 Chrome 里调试
   `frontend/src/**`（Vite dev server 自带 sourcemap）。适合调 UI/CSS/交互。
   > 前端在没有 VS Code API 时也能跑（`NODE_EDITOR_CONFIG` 缺失会回退默认值），所以直接开浏览器即可。

4. **兜底**：命令面板 `Developer: Toggle Developer Tools`（或 `Developer: Open Webview Developer Tools`）看 webview 控制台；
   扩展里已有 `openConsole` 消息会调用前者。

## 节点属性划分与「属性档位」（最低 / 标准 / 全部）

编辑器右上角 ⚙️ →「节点 → 属性档位」，默认 **标准**。

**必要 / 非必要怎么分**：模板（`src/types/nodeTypes.js`）里的 `properties`（常驻属性目录）与
`modeProperties`（各模式自己的属性目录，如 elements 的「卡牌 / 性相」）都是**完整目录**，
运行时按**原版真实数据的字段出现率**逐个切开（`src/types/nodeFieldStats.js`，
由 `pnpm run gen:field-stats` 从 `core/origin_resources/StreamingAssets/content/core/**`
的全量条目统计；属性名与数据字段名**大小写不敏感**）：

- **必要属性**：出现率 ≥ `ESSENTIAL_FREQUENCY`（80%）的字段，外加结构性的模式切换器 /
  模板里标 `alwaysVisible: true` 的属性 —— 留在原处常驻显示；
- **非必要属性**：**全部**收进「修改可选属性」池（节点底部那个按钮），一个都不丢；
- 某个目录一个必要属性都挑不出来时，兜底保留出现率最高的一项（如 elements 卡牌模式保留
  `aspects` 73.2%、slots 保留 `actionId` 70.4%），节点不至于空着；
- ⚠️ 池子是**全局**的（不分模式）：从模式目录降下来的属性（如卡牌的 `decayTo` 9.1%）被勾选
  加回来后，切到另一个模式也会显示 —— 与池子原本就不区分模式的设计一致。

**档位只决定建节点时初始加载几个可选属性**：

| 档位 | 初始加载 | recipes 节点的效果 |
| --- | --- | --- |
| 最低 | 0 个（只显示必要属性） | actionId / startdescription / requirements |
| 标准 | 最常用的 3 个（池已按出现率降序） | 再加 warmup / description / effects |
| 全部 | 全部可选属性（池子留空） | 必要属性 + 全部可选属性；取消勾选会移回池里 |

生效时机：**建节点时**读档位，所以切档只影响此后新建的节点，画布上已有节点不变。
没有对应原版结构的类型（`test` / `blank` / `extends` / `copies` / `text` / `number` /
`nodeSet` / `images`）不参与划分，模板原样。

> 同步了新的 `core/origin_resources` 之后，跑一次 `pnpm run gen:field-stats` 刷新出现率数据
> （`--check` 只比对不写文件）；必要/非必要的判定会随之自动跟着真实数据走。

## 节点配色（可自定义）

配色**不再写在 CSS 里**（`styles/variables.css` 的 `--node-*` 默认值已删）：唯一事实来源是
`src/types/nodeColors.js` 的 `NODE_COLOR_ITEMS`（20 项，节点类型与端口数据类型共用一张表）。

- 编辑器右上角 ⚙️ →「节点配色」里点**色板预览**打开**配色悬浮面板**（子页面式浮层）：
  面板里逐项用**原生色块**（`<input type="color">`）调色，改完**立即刷新画布上已有节点**
  （`ControllerCore.applyNodeColors()` 逐个换色 + 重绘，端口点颜色也会跟着变），
  选择记在 `localStorage['nodeEditor.nodeColors']`；面板底部「恢复默认配色」清空本地覆盖，✕ / Esc 关闭。
- 配色单独做浮层而不是塞在设置弹窗里：设置弹窗是窄且可滚动的 popover，
  原生调色板弹层在里面容易被滚动容器裁剪/顶掉；浮层不受此影响（宽 560px、三列排布）。
- 覆盖分两层：`public/config.json` 的 `nodeColors`（出厂 / 团队默认，**整表替换**）
  → 用户本地自定义（优先）。
- 模块载入时把当前配色写成 `--node-<key>` 自定义属性，所以 `var(--node-recipes)` 这类写法
  在运行时依旧可用（方便自定义 CSS / 调试）。
- 取色统一走 `NodeTypeRegistry.getColor(key)` / `getNodeColor(key)`（未知键退回 `blank`）；
  节点类型配置里的 `color` 是**现取的 getter**，所以任何改色路径（设置面板 / 重置 / config.json）
  之后新建的节点都立即用新色，不需要清缓存。
- 改色后需要跟着变的三处，都收在 `ControllerCore.applyNodeColors()` 里一次完成（**新增取色点请挂到这里**）：
  1. 画布上已有节点：换 `model.color` + `emit('redraw')`（边框 / 图标 / 端口点随之更新）；
  2. 侧边栏**列表面板的色条**：`PanelManager.refreshColorPanels()` —— 「添加节点」用
     `NodeTypeRegistry.allTypesList` 重新取数（那是快照，不重取就留旧色），「查找节点」走节点模型；
  3. 属性端口的 `--port-color`（走 `propViewGenerator`，取自同一张表）。
- 列表项取色由 `views/panelView.js` 的 `resolveItemColor(item)` 统一决定：优先条目自带 `color`，
  否则按 `type` / `category` 查配色表，都不认才退中性灰 —— 所以 `panel.css` 的
  `.node-color-indicator` **不再定义颜色**（避免两处不一致），颜色由视图内联写入。

## 页面（工作区选项卡）

一个编辑器窗口显示一个 mod，tab 栏上的每一页是**一块独立的画布工作区**：各自的节点、连线、
平移缩放与交互模式都互不干扰（`core.nodes` 永远只含当前页）。

- **切换是无损的**：不做「序列化 → 重建」，而是把当前页的节点/连线 **DOM 搬进页面自己的停放容器**
  （`.page-parking`，`display:none`），索引（`NodeManager` / `ConnectionManager` 的那几份 Map）
  换手给页面记录；切回时搬回来 —— 模型、视图、监听器、端口连接、文本变量同步全部原样保留。
  见 `controllers/pageManager.js` 的 `_deactivate` / `_activate`。
- **页与页之间的全局状态**：id 生成器是全页面共用的（停放页继续占着自己的 id，新节点不会撞号；“清空画布”
  会 reset 生成器，所以 PageManager 会在切页/清空后重新占位）；撤销栈不跨页（切页即 `historyManager.clear()`）；
  占位提示只在空页面上显示。
- **tab 栏**（`views/tabBar.js`）：点击切换、`✕` / 中键关闭（内容非空先确认；最后一个页面不删，改为清空）、
  双击就地改名（回车提交 / Esc 取消）、拖拽排序；右侧 `＋` 新建页面、`🗂️ 页面管理` 浮层（列表 +
  逐页「💾 存成文件」+「＋ 新建页面」+「💾 保存全部」，顶部输入框回车可改当前页名）。
- **存文件 / 读文件**：`💾 保存` 导出**全部页面**，`页面管理 → 💾` 导出**单页**；两者同构：

  ```json
  { "kind": "node-editor-pages", "version": "2.0",
    "metadata": { "created": "…", "activePageId": "page_1", "pageCount": 2 },
    "pages": [ { "id": "page_1", "name": "未命名-1", "view": { "x": 0, "y": 0, "scale": 1 },
                 "mode": "select", "nodes": [ … ], "connections": [ … ] } ] }
  ```

  节点快照存位置尺寸/标题/标签/折叠/模式 + 全部属性值 + 可选属性激活集合（属性键 = 去掉节点 id 前缀的
  属性 id，因此换 id 也能对上；数据加载时外化的 `:custom` 保留字段连 label 一起存，恢复时重建）；
  连线只存两端节点 id 与端口 id，恢复时按 id 找回端口。旧格式 `{ nodes, connections }` 也认（当单页导入）。
  VS Code 里由宿主写文件（`saveGraph` / `loadGraph` 消息），浏览器里退化为下载 / 原生文件选择器。
- **刷新后仍在**：`localStorage['nodeEditor.pages']` 存同一份文档（`enablePersistence()` 打开）。
  节点的属性输入框改动不走 EventBus，所以除总线事件外还在 document 上以捕获阶段听 input/change/mouseup，
  用 1.5s 防抖回写。预览模式不建 tab 栏、也不开持久化。
- **铺图落到哪一页**：`registerData()` 先调 `pageManager.pageForImport(label)` ——
  当前页空就用它（空的默认页顺便改名为数据来源），已有内容就新开一页（页名即来源，如 `Mod:xxx`），
  已有同名页则切回去用，免得把不同 mod 的节点堆在同一张画布上。
  例外：`originLoaded`（启动预加载的游戏基础内容）传 `{ layout: false }` —— 只登记进数据池备用，
  不换页也不铺图，要看得自己从「添加节点 → 数据选择器」取。

## 迁移时的两个坑（已处理，改动前请知悉）

1. **不能同时保留「bundle + 原始文件注入」**：vanilla 的 `processResources()` 会把 `ui/scripts/**` 下 44 个 js 全部作为独立 module 注入，
   一旦和 bundle 并存，同一模块会出现两个不同 URL → **两份模块实例**，`EventBus`/单例会分裂。本分支已整体删掉该机制。
2. **`preview.css` / `data-selector.css` / `debug.css` 原先不在 HTML 的 `<link>` 列表里**（靠目录扫描才被加载），
   在 `src/styles/index.css` 里已显式列出；漏了会出现「预览模式样式失效」这类隐蔽回归。
