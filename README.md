[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# cultist-node-editor

《密教模拟器》（Cultist Simulator）自制 Mod 的**可视化节点编辑器**，以 VS Code 扩展的形式提供。

把 Mod 的 `recipes` / `elements` / `verbs` / `decks` 等条目变成画布上的节点：拖拽摆放、连线表达引用、
在属性面板里改字段，并用文本变量节点在多个字段之间共享同一段文本。

## 功能

| 命令（命令面板） | 说明 |
| --- | --- |
| **打开密教模拟器节点编辑器** | 打开主编辑器面板（画布 + 节点面板 + 属性面板） |
| **加载 Mod（检测/选择 synopsis.json）** | 自动检测当前工作区的 mod 结构并加载其中的 JSON；找不到就让你选文件位置 |
| **新建 Mod 基础结构（synopsis.json）** | 生成一个可用的 mod 目录骨架 |
| **预览单个 Mod JSON 文件为节点** | 单文件预览，不依赖完整 mod 结构 |

右键任意 `.json` →「打开方式」→ **节点编辑器 JSON 预览**，可在只读预览模式查看该文件的数据。
主编辑器打开时会预加载游戏原版内容（origin_resources）作为数据池，可直接取用其中的条目。

其他已实现的能力：

- **引用连线**：条目之间按 id 互引时自动在端口间连线（`effects` / `requirements` / `linked` / `alt` 等字段）
- **文本变量同步**：文本字段可连到「文本节点」共享同一变量，任一端口编辑即双向同步（可选实时逐键同步）
- **属性系统**：数值 / 选项 / 端口 / 表格 / 图片预览等属性类型，含「修改可选属性」的扩展属性池
- **撤销重做**、画布缩放平移、适应视图、隐藏连接、专注某节点

## 设置

| 设置项 | 默认 | 说明 |
| --- | --- | --- |
| `cultistNodeEditor.preloadOrigin` | `true` | 打开编辑器时预加载游戏基础内容（`origin_resources`）为可拖拽节点 |

编辑器内部还有一批偏好（主题、网格、缩放范围、连线样式、实时文本同步等），在编辑器右上角 ⚙️ 里配置。

## 安装

从 [Releases](https://github.com/DoubleCircle-dev/cultist-node-editor/releases) 下载 `.vsix`，
在 VS Code 的「扩展」面板右上角 →「从 VSIX 安装…」，或：

```bash
code --install-extension cultist-node-editor-<版本>.vsix
```

## 开发

仓库用 **pnpm** 管理依赖：

```bash
pnpm install
pnpm run verify         # 提交前把关：lint（前端线还会跑前端单测，Vite 线另含构建）
pnpm test               # 扩展宿主集成测试（会真的拉起一个 VS Code）
pnpm run dev            # 仅 Vite 前端线：起 dev server（HMR）
pnpm run package:vsix   # 打包成 vsix
```

### 分支结构与约定

三线分工，后端与前端分开演进：

| 分支 | 内容 | 说明 |
| --- | --- | --- |
| `core` | 后端 + 契约层 | `core/**`、`extension.js`、`frontend-host/index.js`、`test/extension.test.js`。**不含 `ui/`，也不含任何前端宿主实现**（单独运行会显示「本分支不含前端实现」提示页） |
| `vanilla-frontend` | core + vanilla 前端 | `ui/`（源码即运行时：扩展扫描目录注入资源）+ `frontend-host/vanilla.js` |
| `vite-frontend` | core + Vite 前端 | `frontend/`（Vite 工程；开发走 dev server + HMR，发布读 `frontend/dist`）+ `frontend-host/vite.js` |

- 后端改动**只在 `core` 上做**，前端线用 `git merge core` 取更新；`extension.js` 与 `frontend-host/index.js`
  在三条线上逐字节一致，前端差异只体现在 `frontend-host/` 的具体实现里
- ⚠️ 不要往 `core` 里加前端文件（`ui/`、`frontend/`、`frontend-host/*.js` 实现、`test/ui/**`）：
  `core` 是上游，它的改动（包括删除）会传播到两条前端线
- 图片资源（约 233 MB）不在本仓库，走 CDN：
  `cdn.jsdelivr.net/gh/DoubleCircle-dev/cultist-node-editor-assets@v1/`，
  名字 → 路径映射见 `core/origin_resources/image-index.json`

### 发布

`master` 是**发布线**：谁被合并进 master，就发布谁 —— 但**只能合前端线**（`vanilla-frontend` / `vite-frontend`）。
`core` 不带前端，合进 master 等于发布一个打不开编辑器的空壳。

```bash
git checkout master && git merge <要发布的分支>   # 先合并
git tag v0.0.1 && git push origin v0.0.1          # 版本号须与 package.json 的 version 一致
```

推 tag 后会自动：校验「tag 落在 master 上」+ 版本号一致 → 跑完整测试矩阵 →
打包 vsix 并挂到 [Releases](https://github.com/DoubleCircle-dev/cultist-node-editor/releases)。
上架 Marketplace 仍是手动的（从 Release 下载 vsix），CI 里不持有任何发布凭据。

> **master 上只能有一套前端实现**（`frontend-host/` 的契约要求恰好一个实现，多一个会白屏）。
> 当前发布的方案是 **vanilla**（`ui/` + `frontend-host/vanilla.js`）。
>
> - **切到 Vite 版**：`git checkout master && git merge vite-frontend`
>   —— vite 那条历史里删掉了 `ui/` 与 `frontend-host/vanilla.js`，合并会一并删除，结果干净。
> - **从 Vite 切回 vanilla**：合并会把两套都留下 → 需要手动移除另一套
>   （`git rm -r --cached` 掉 `frontend/`，并只保留一个 `frontend-host/*.js` 实现）。
> - 合错了也不会发出去：`test/ui/frontendHost.test.mjs` 断言「实现恰好一个」，
>   完整 CI 跑在 release 之前，会先把这类错误挡下来。

更细的说明见各前端分支：`test/ui/README.md`（vanilla 线的前端单测）与 `frontend/README.md`（Vite 前端）。

## 已知限制

- 引用连线目前只覆盖按 id 直接引用的字段；引用目标未加载时会跳过
- 原版图片走 CDN，首次加载较慢，离线时回退占位图

## License

[MIT](LICENSE.txt)
