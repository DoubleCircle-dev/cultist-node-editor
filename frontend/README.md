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
│  ├─ styles/index.css   样式入口（顺序 = 原来的 <link> 顺序）
│  ├─ styles/**          原 ui/css/**
│  ├─ controllers/ models/ views/ generators/ types/ ...  原 ui/scripts/**
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

## 迁移时的两个坑（已处理，改动前请知悉）

1. **不能同时保留「bundle + 原始文件注入」**：vanilla 的 `processResources()` 会把 `ui/scripts/**` 下 44 个 js 全部作为独立 module 注入，
   一旦和 bundle 并存，同一模块会出现两个不同 URL → **两份模块实例**，`EventBus`/单例会分裂。本分支已整体删掉该机制。
2. **`preview.css` / `data-selector.css` / `debug.css` 原先不在 HTML 的 `<link>` 列表里**（靠目录扫描才被加载），
   在 `src/styles/index.css` 里已显式列出；漏了会出现「预览模式样式失效」这类隐蔽回归。
