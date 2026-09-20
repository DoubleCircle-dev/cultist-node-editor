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
主编辑器打开时会预加载游戏原版内容（origin_resources）作为全局节点图，可直接取用其中的条目。

其他已实现的能力：

- **节点类型 = 数据文件的最外围键**：一个文件的 `{"recipes": [...]}` 直接变成一组 `recipes` 节点，
  列表里每个元素一个节点；哪些字段需要**连线**、该连什么类别、以及哪些内嵌对象要**提取成节点**，
  全部由 `core/modLoad/mapping.js` 的字段规则表声明（事实依据是官方 wiki 手册，见 `agent-scratch/help.mw`），
  扩展字段（TRM / 导入扩展 / 自用扩展）由 `core/modLoad/plugins/` 里的**插件**补充
- **数据流水线四段**（后端三段的职责按「谁懂游戏语义谁负责」划分）：
  1. `parse` **解析 JSON**：读文件 → 拆最外围键（键名 = 节点类型）；
  2. `mapping` **加连接、拆节点**：字段规则表声明「要连线的字段（方向 / 目标类别 / 取值方式）」与
     「要拆成节点的内联定义」，并抽出一个条目的**连接需求**（`connectionsOf`）与**该拆出来的内联子节点**（`splitInline`）
     —— 如 `recipes.slots[]` 拆成 `slots` 节点、`alt` 里的内联 recipe 拆成 `recipes` 节点；
  3. `toData` **融合成中间态 JSON**：为每个条目（含拆出来的）建节点、把包含关系与引用关系都变成连接线、
     按 id 解析目标（连不上的标成**文件外节点** `external-origin` / `external-mod`，全局加载时另出「端口悬空」告警）；
  4. 前端 **nodeModel ⇄ 中间态 JSON 互转**：导入按 `props` 的 `kind` 建属性、按 `edge.out` / `edge.in` 落位连线。
- **后端只描述语义，不决定渲染**：字段只给「基础属性类型（`kind`）+ 原始值 + 连接需求（`links`）+ 中间态转化（`materialize`）」，
  用什么控件、什么标签由前端自己定（兜底 = 原生 text）
- **不能双向的关系由后端变换**：`alt` / `linked` / `inductions` 的跳转条件写在目标身上，
  后端把它们变成「目标 → 本条目」的线（`edge.out` / `edge.in`），前端照着画即可
- **文本变量同步**：文本字段可连到「文本节点」共享同一变量，任一端口编辑即双向同步（可选实时逐键同步）
- **属性系统**：数值 / 选项 / 端口 / 表格 / 图片预览等属性类型，含「修改可选属性」的扩展属性池
- **撤销重做**、画布缩放平移、适应视图、隐藏连接、专注某节点

## 设置

| 设置项 | 默认 | 说明 |
| --- | --- | --- |
| `cultistNodeEditor.preloadOrigin` | `true` | 打开编辑器时预加载游戏基础内容（`origin_resources`）为可拖拽节点 |
| `cultistNodeEditor.fieldPlugins` | `[]` | 自定义**字段插件**（JSON 文件或目录，相对工作区或绝对路径） |
| `cultistNodeEditor.disabledPlugins` | `[]` | 要禁用的插件 id（内置：`trm`、`import-extension`） |

编辑器内部还有一批偏好（主题、网格、缩放范围、连线样式、实时文本同步等），在编辑器右上角 ⚙️ 里配置。

## 字段插件

`mapping.js` 只声明**原版（本体）字段**的连接需求与中间态转化；各种**扩展**字段一律以插件形式外挂：

| 插件 | 作用 |
| --- | --- |
| `trm`（内置） | The Roost Machine：`grandReqs` / `movements` / `decays` / `addCallbacks` / `rootAdd` / 槽位 `xtrigger` / 性相 `aspectSlots` / 动词 `maxUnique` 等，并自带 `fucine-ids` 解析器（从 `[~/extant:funds]` 这类 Fucine 表达式里取出元素 id） |
| `import-extension`（内置） | 导入扩展：`$derives` / `$extends` / `$depends` / `$incompatible`，以及 `effects$add` / `linked$append` 这类**属性操作字段**（靠正则 `from` 一次命中多个字段名） |

**自定义字段（不用改代码）**：写一个 JSON 插件文件，填进 `cultistNodeEditor.fieldPlugins`；
或调用 `modLoad.plugins.loadFile(path)` / `loadDirectory(dir)`。

```json
{
  "id": "my-fields",
  "name": "我自己的字段",
  "categories": {
    "recipes": {
      "fields": [
        { "from": "myReward", "link": { "direction": "output", "targets": ["elements"], "extract": "map" } },
        { "from": "myCost",   "link": { "direction": "input",  "targets": ["elements"], "extract": "map" } }
      ]
    }
  }
}
```

插件接口（登记、启停、自定义 `extract` 解析器、新类别）详见 `core/modLoad/plugins/index.js` 文件头。

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

四条线分工，后端与前端分开演进 —— **前端线不维护后端代码**：

| 分支 | 内容 | 说明 |
| --- | --- | --- |
| `core` | 后端 | `core/**`、`extension.js`、`frontend-host/index.js`（契约层）、`scripts/sync-backend.mjs`、集成测试。**不含任何前端**（单独运行会显示「本分支不含前端实现」提示页） |
| `vanilla-frontend` | 前端（无构建） | `ui/` + `frontend-host/vanilla.js` + `test/ui/**`；源码即运行时（扩展扫描目录注入资源） |
| `vite-vanilla` | 前端（Vite + 原生 JS） | `frontend/`（Vite 工程，源码在 `frontend/src/`）+ `frontend-host/vite.js`；开发走 dev server + HMR |
| `vite-vue` | 前端（Vite + Vue 3） | 响应式重写，**骨架阶段、暂不用于发布**，见 `frontend/DESIGN.md` |

**前端线不跟踪后端代码**：`core/**`、`extension.js`、`frontend-host/index.js` 等都在各前端线的 `.gitignore` 里，
由 VS Code 任务从 core 工作区拷进来 —— 所以**永远不用 merge core**：

```bash
# 后端在 core 工作区改完并提交后，到前端线工作区跑：
#   VS Code：Ctrl+Shift+B（任务「同步后端（core → 本工作区）」）
#   命令行：node <core 工作区>/scripts/sync-backend.mjs .
```

- 同步同时会把 core `package.json` 里的扩展清单字段（`contributes` / `engines` / `main` / 依赖）合并给前端线
- 前端线的 CI 与 Release 会「先拉 core 分支、再同步」，所以 **master 分支本身不含后端源码，但打包出的 vsix 仍然自包含**
- ⚠️ 别往 `core` 里加前端文件（`ui/`、`frontend/`、`frontend-host/*.js` 实现、`test/ui/**`）：core 是后端，同步脚本也认不出它们
- 图片资源（约 233 MB）不在本仓库，走 CDN：
  `cdn.jsdelivr.net/gh/DoubleCircle-dev/cultist-node-editor-assets@v1/`，
  名字 → 路径映射见 `core/origin_resources/image-index.json`

### 数据契约（后端 → 前端）

`modLoaded` / `originLoaded` / `jsonPreviewLoaded` 三个 webview 消息统一带同一套字段：

```js
{
  format: 'cne-node-graph', version: 1,   // 中间态 JSON 的形状标识
  source: 'origin' | 'mod', namespace, count, scope: 'file' | 'global',
  nodes: [
    { uid, id, type, category, title, file, source, refCount,
      // 每个字段一条（id 除外）：基础属性类型 + 原始值 + 连接需求 + 中间态转化
      props: [ { name, kind, value, links: [ { port, direction, targets, multi, extract } ], materialize } ],
      connections: [ { field, port, side, targets, extract, multi, sources, targetIds } ] },
  ],
  edges: [
    { id, kind: 'link',
      from: { uid, type, category, id, field, port, side, targets, extract, multi, sources },
      out:  { uid, type, category, id, field?, side: 'output', port },
      in:   { uid, type, category, id, field?, side: 'input',  port },
      targetId, amount, status, to },
  ],
  external: [ /* status !== resolved 的连接线：external-origin / external-mod */ ],
  warnings: [ /* scope=global 时的「端口悬空」汇总；单文件预览为空 */ ],
  stats:    { files, nodes, edges, resolved, externalOrigin, externalMod, danglingFields }
}
```

**三条边界（后端只描述语义，不做渲染决策）**

1. **基础属性类型**：后端按原始 JSON 值现推 `kind`（`string` / `number` / `boolean` / `list` / `dict`），
   并原样给 `value`。前端自己决定用什么控件渲染（兜底 = 原生 text），后端不写 `text` / `textarea` /
   `valueType` 这类东西。
2. **连接需求**：只有需要连线的字段才有 `links`（一个字段可有多条 = 多个含义的端口）：
   - `direction`：**本条目在这条线上是哪一侧** —— `input` = 别的东西指向我，`output` = 我指向别的东西；
   - `targets`：对端类别（如 `['verbs']`），前端据此限制端口能连什么；
   - `multi`：是否允许多连；`extract`：从值里取目标 id 的方式（`map` / `id-list` / `nested-map` …）。
   像 `alt` / `linked` / `inductions` 这种「跳转条件写在目标身上」的关系，`direction` 就是 `input`
   —— 后端已经把这种不能双向的关系**变换**成了定好两端的连接线：`edge.out` / `edge.in`，
   前端照着画即可，不用猜端口。
3. **中间态转化**：内嵌对象/列表该提取成节点或工具节点时，用 `materialize` 声明
   （`{ as: 'node' | 'tool', type, inline? }`，如 `recipes.slots` → `slots` 节点）。
   ⚠️ 目前只做到「声明」，真正的提取（生成节点 + 包含关系的连线）还没实现。

- `node.type` 就是数据文件的最外围键（`recipes` / `elements` …），可直接当基础类型实例化；
- `edge.status` 为 `resolved` / `external-origin` / `external-mod`；未解析的目标只给 `targetId`。
- 流程与规则细节见 `core/modLoad/toData.js` 头部注释、`core/modLoad/mapping.js` 的规则表说明。

### 发布

`master` 是**发布线**：谁被合并进 master，就发布谁 —— 但**只能合前端线**（`vanilla-frontend` / `vite-vanilla`）。
`core` 不带前端，合进 master 等于发布一个打不开编辑器的空壳；`vite-vue` 仍在骨架阶段，暂不参与发布。

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
> - **切到 Vite 版**：`git checkout master && git merge vite-vanilla`
>   —— vite 那条历史里删掉了 `ui/` 与 `frontend-host/vanilla.js`，合并会一并删除，结果干净。
> - **从 Vite 切回 vanilla**：合并会把两套都留下 → 需要手动移除另一套
>   （`git rm -r --cached` 掉 `frontend/`，并只保留一个 `frontend-host/*.js` 实现）。
> - 合错了也不会发出去：`test/ui/frontendHost.test.mjs` 断言「实现恰好一个」，
>   完整 CI 跑在 release 之前，会先把这类错误挡下来。

更细的说明见各前端分支：`test/ui/README.md`（vanilla 线的前端单测）、`frontend/README.md`（Vite 前端）
与 `frontend/DESIGN.md`（vite-vue 的响应式设计）。

## 已知限制

- 引用连线目前只覆盖按 id 直接引用的字段；引用目标未加载时会跳过
- 原版图片走 CDN，首次加载较慢，离线时回退占位图

## License

[MIT](LICENSE.txt)
