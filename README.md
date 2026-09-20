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
| **重载 Mod 数据（跳过缓存重新解析）** | 主动全量重载当前 mod：怀疑缓存不对、或在外部工具里大改过一堆文件时用 |
| **重载游戏基础内容（跳过快照重新解析）** | 主动全量重载 origin：忽略内存缓存与随包快照，从源文件重算 |

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
- **不能双向的关系由后端变换**：`alt` / `linked` / `inductions` / `elements.induces` 这类**跳转分支 / 分支式触发**，
  分支列表写在源条目上、判定逻辑在对端条目的 JSON 里（**反向记录**，契约里标 `links[].reverse`）；
  节点模型里它们就是源条目的 `output`，后端把朝向变换好（`edge.out` / `edge.in`），前端照着画即可
- **文本变量同步**：文本字段可连到「文本节点」共享同一变量，任一端口编辑即双向同步（可选实时逐键同步）
- **属性系统**：数值 / 选项 / 端口 / 表格 / 图片预览等属性类型，含「修改可选属性」的扩展属性池
- **撤销重做**、画布缩放平移、适应视图、隐藏连接、专注某节点
- **后端服务层**（`core/service/`）：节点图落盘缓存（命中时一个 json 都不解析）、
  工作区文件监听（改动只重解析变化的文件，增量补丁回发）、origin 快照（随包分发，免每次重解析）、
  图片名解析与源数据按需读取 —— 详见下文「后端服务层」

## 后端服务层（`core/service/`）

把「每次打开编辑器都从头跑一遍流水线」换成「按工作区缓存 + 按需增量」。
它**不起网络端口**：数据仍走原有的 webview `postMessage` 契约，前端只在旧字段之外多看到几个标量。

| 文件 | 职责 |
| --- | --- |
| `index.js` | 纯服务层（不 require vscode）：`loadMod` / `refreshMod` / `loadOrigin` / `saveDoc` / `loadDoc` / `warmMod` |
| `host.js` | **vscode 环境绑定**：storageUri、文件监听、设置项、生命周期 |
| `graphCache.js` | 节点图（中间态 JSON）落盘缓存：原子写、损坏/过期当作未命中 |
| `graphStage.js` | 文件收集（解析结果复用）、建图、新旧图比对 |
| `docStore.js` | 画布文档缓存（自动保存 / 恢复） |
| `originResource.js` | origin 快照、id 索引、图片名→URL、源数据按需读取 |
| `cacheKey.js` / `storage.js` | 缓存键与来源签名；缓存目录布局 |

**缓存位置**：`context.storageUri`（工作区级，没开工作区时退 `globalStorageUri`），
**不往用户工作区里写任何文件**：

```
<storage>/graphs/<key>.json     mod 节点图（中间态 JSON，带来源签名）
<storage>/docs/<key>.json       画布文档（节点位置 / 页面 / 视图状态）
```

**快速加载**：先算来源文件的「相对路径 + mtime + size」摘要（只 stat，不读内容），
与缓存里记的签名一致就直接 `JSON.parse` 复用 —— 连一个 JSON 都不解析。
命中缓存后会在后台预热解析结果，让后续改动能真的做到「只重解析变化的文件」。

**工作区监听**：监听 mod 目录的 `**/*.json`，事件先防抖（默认 300 ms）再统一重载：

- 只重新解析**变化的文件**（其余复用内存里的解析结果）；建图仍是全量重跑
  ——因为 `toData` 的「同 id 只建一次」是**跨文件**去重，分片重跑会让节点归属漂移；
- 新旧图按 `node.uid` / `edge.id` 比对，变化面小于阈值（默认 40%）时只回发 `graphPatched` 增量，
  超过阈值则重发整张图（`modLoaded`），避免增量比全量还贵；
- 两者之外还提供**主动全量重载**（前端消息 `reloadGraph` / 命令面板两个 `重载` 命令）。

**origin 快照**：origin 内容稳定不变，所以在打包前预生成中间态 JSON（约 34 MB）并随 VSIX 分发；
运行时只需一次 `JSON.parse`（实测 881 ms → 415 ms）。快照里记着生成当时的
`mappingRevision`（`mapping.js` + 内置插件的源码摘要），规则表一改版本就变，
运行时读到旧快照会直接回退源文件加载 —— 不需要手工维护版本号。

**图片与源码按需取**：图片走 `image-index.json` 的 name→路径索引（本地文件优先，缺失回退 CDN，
同名多义按条目所在类别目录消歧）；origin 的 JSON 源数据**不预加载**，只有用户要看某个节点的
源码时才按 `file` + `category` + `id` 去读那一个文件。

## 设置

| 设置项 | 默认 | 说明 |
| --- | --- | --- |
| `cultistNodeEditor.preloadOrigin` | `true` | 打开编辑器时预加载游戏基础内容（`origin_resources`）为可拖拽节点 |
| `cultistNodeEditor.quickLoad` | `true` | **快速加载**：优先用已保存的中间态 JSON 缓存，不重复解析 mod 的 json；关掉则每次从源文件重解析 |
| `cultistNodeEditor.watchWorkspace` | `true` | **工作区监听**：监听整个 mod 工作区的 json 变化，改动后只重解析变化的文件并增量更新画布 |
| `cultistNodeEditor.watchDebounce` | `300` | 监听防抖时长（毫秒）：连续保存合并成一次重载 |
| `cultistNodeEditor.autoSaveDoc` | `true` | 自动保存画布文档（节点位置 / 页面 / 视图状态）到扩展存储，下次打开自动恢复 |
| `cultistNodeEditor.snapshotPercent` | `40` | 工作区变化超过该百分比时重发全量图而不是增量补丁 |
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
pnpm run verify                # 提交前把关：lint（前端线还会跑前端单测，Vite 线另含构建）
pnpm test                      # 扩展宿主集成测试（会真的拉起一个 VS Code）
pnpm run gen:origin-snapshot   # 重新生成 origin 快照（改了 mapping/插件后需要）
pnpm run dev                   # 仅 Vite 前端线：起 dev server（HMR）
pnpm run package:vsix          # 打包成 vsix（会先自动生成 origin 快照）
```

- **origin 快照**产物是 `core/origin_resources/origin.graph.json`（约 34 MB）：它**不进版本库**
  （`.gitignore`），但会**打进 VSIX**（`package:vsix` 先跑生成脚本）。本地开发时若还没生成，
  运行时会自动回退源文件加载（慢约一倍，功能不受影响），跑一次
  `pnpm run gen:origin-snapshot` 即可；`--check` 可只校验现有快照是否仍然有效。

### 分支结构与约定

四条线分工，后端与前端分开演进 —— **前端线不维护后端代码**：

| 分支 | 内容 | 说明 |
| --- | --- | --- |
| `core` | 后端 | `core/**`（流水线 + 服务层）、`extension.js`、`frontend-host/index.js`（契约层）、`scripts/sync-backend.mjs`、集成测试。**不含任何前端**（单独运行会显示「本分支不含前端实现」提示页） |
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
      // 'data' = 数据条目（写回 content 文件）；'tool' = 工具节点（变量节点等，不写数据文件）
      role: 'data' | 'tool',
      // 从宿主的内联定义拆出来的节点才非 null：{ hostUid, hostCategory, hostId, field, index, syntheticId }
      inline,
      // 每个字段一条（id 除外）：基础属性类型 + 原始值 + 连接需求 + 中间态转化
      props: [ { name, kind, value, links: [ { port, direction, targets, multi, extract, reverse? } ], materialize } ],
      connections: [ { field, port, side, targets, extract, multi, sources, targetIds, reverse? } ] },
  ],
  edges: [
    // kind: 'link'（引用）/ 'contains'（宿主 → 拆出来的子节点）/ 'bind'（变量节点 → 使用它的字段）
    { id, kind: 'link',
      from: { uid, type, category, id, field, port, side, targets, extract, multi, sources, reverse? },
      out:  { uid, type, category, id, field?, side: 'output', port },
      in:   { uid, type, category, id, field?, side: 'input',  port },
      targetId, amount, status, to },
  ],
  external: [ /* status !== resolved 的连接线：external-origin / external-mod */ ],
  warnings: [ /* scope=global 时的「端口悬空」汇总；单文件预览为空 */ ],
  stats:    { files, nodes, edges, resolved, externalOrigin, externalMod, danglingFields }
}
```

`node.file` 是**相对扫描根**的路径（mod 相对 `<mod 根>/content/`，origin 相对 `StreamingAssets/content/core/`），
写回时直接拿它拼目标文件即可，不必自己反查来源。

### 服务层新增的消息与字段（向后兼容的加法）

原有三条消息（`modLoaded` / `originLoaded` / `jsonPreviewLoaded`）字段**一个都没改**，只多了几个标量：

| 新增字段 | 含义 |
| --- | --- |
| `fromCache` | 本次是否命中磁盘缓存（命中时**没有解析任何文件**） |
| `fromSnapshot` | 仅 origin：本次是否走了随包分发的快照（而非源文件加载） |
| `signature` | 来源签名（文件集合摘要），调试缓存失效原因时看它 |

新消息（前端不处理也不影响现有功能）：

| 方向 | 消息 | 含义 |
| --- | --- | --- |
| 后端 → 前端 | `graphPatched` | 工作区变化后的**增量**：`added` / `updated` / `removed`（按 `uid` / `edge.id` 对齐） |
| 后端 → 前端 | `docRestored` | 上次自动保存的画布文档（没有则为 `{ doc: null }`） |
| 后端 → 前端 | `autoDocSaved` | 自动保存回执（`ok` / `savedAt` / `bytes`） |
| 后端 → 前端 | `imageResolved` | 图片名 → URL 的批量解析结果（带 `source: local\|cdn\|miss` 与候选清单） |
| 后端 → 前端 | `sourceSnippet` | 某节点的源条目（按需读取，origin 的源数据不预加载） |
| 前端 → 后端 | `reloadGraph` | 全量重载，`scope: 'mod' \| 'origin' \| 'all'` |
| 前端 → 后端 | `saveAutoDoc` / `restoreDoc` | 画布文档的自动保存与恢复 |
| 前端 → 后端 | `resolveImages` / `readSource` | 取图片 URL / 取源码条目（都带 `requestId` 以便并发展开对应） |

**三条边界（后端只描述语义，不做渲染决策）**

1. **基础属性类型**：后端按原始 JSON 值现推 `kind`（`string` / `number` / `boolean` / `list` / `dict`），
   并原样给 `value`。前端自己决定用什么控件渲染（兜底 = 原生 text），后端不写 `text` / `textarea` /
   `valueType` 这类东西。
2. **连接需求**：只有需要连线的字段才有 `links`（一个字段可有多条 = 多个含义的端口）：
   - `direction`：**本条目在这条线上是哪一侧** —— `input` = 别的东西指向我，`output` = 我指向别的东西；
   - `targets`：对端类别（如 `['verbs']`），前端据此限制端口能连什么；
   - `multi`：是否允许多连；`extract`：从值里取目标 id 的方式（`map` / `id-list` / `nested-map` …）；
   - `port`：端口名（默认 = 字段名）。**端口 key = `<side>:<port>`**（如 `input:actionId`）；
     该字段在画布上不一定有对应的模板端口（`effects$add` 这类扩展字段、TRM 字段都可能没有），
     前端按 key 找端口、找不到就按 `kind` 兜底。连线另一侧若没有字段端口，`port` 就是通用入口 `link`。
   - `reverse`（**可缺省**）：**反向记录** —— 游戏 JSON 里这条关系的「书写位置」与「判定主体」不在同一端。
     缺省（没有这个键）= 正向：字段写在本条目上、判定逻辑也在本条目上（如 `effects` 是 recipe 自己的产出、
     `requirements` 是它自己的进入条件）。
     `reverse: true` = 书写位置与判定主体相反，当前有两类：
     · **recipe 的跳转分支**（`alt` / `linked` / `alternativerecipes` / `inductions`）：**分支列表写在源 recipe 上**
     · **卡牌 / 性相的分支式触发**（`elements.induces`）：**可能触发的 recipe 列在元素上**

     两者的共同点：列表在源条目上（所以它是源条目的字段，方向就是 `output`：源 → 目标），
     **但「是否跳转 / 能否触发、以什么条件生效」由对端 recipe 自己的定义决定**（判定逻辑写在对端的 JSON 里）。
     消费方据此知道这条线的**语义主体在对端**：不要把「列表在源上」当成「源端说了算」，
     也不要把方向反过来画。
     （`actionid` 这类不是反向记录：行动框 `verb` 只是分类名、不是执行端，它仍是普通 `input`。）

   后端已经把方向**变换**成了定好两端的连接线：`edge.out` / `edge.in`，前端照着画即可，不用猜端口；
   `reverse` 只补充语义（读 / 写这条线时谁是主体），**不改变 `out` / `in`**。
   **声明优先于前端模板里的端口方向**（两边不一致时以声明为准）。
3. **中间态转化**：内嵌对象/列表该提取成节点时，用 `materialize` 声明
   （`{ as: 'node', type, inline: true }`，如 `recipes.slots` → `slots` 节点）。
   - **已实现**：`mapping.splitInline()` 找出「内联定义」（只写 `id`/`chance` 这类引用参数的不算），
     `toData.expandEntry()` 为它们建节点（同 id 只建一次，递归深度上限 4）并补一条
     `kind: 'contains'` 的包含连线（宿主 `output:<字段名>` → 子节点的通用入口 `link`）；
     子节点带 `inline: { hostUid, hostCategory, hostId, field, index, syntheticId }` 说明它从谁身上拆出来。
   - `as: 'tool'`：后端为声明字段拆出一个 `role: 'tool'` 的**变量节点**（`table` = 字典形态 / `list` = 列表形态），
     原始值放在节点的 `value`（及同值的 `props[0]`）中，并以 `kind: 'contains'` 边连接回宿主字段。
     变量节点没有数据 `id`，不会参与引用解析或写入独立 content 条目。
     节点自带 `tool: { as, type, hostUid, hostCategory, hostId, field }` 描述符
     （与内联子节点的 `inline` 对称），前端不必反查边就知道它是什么变量、值从哪来；
     **怎么把该变量画出来由前端决定**（后端只给模型与数据，不做渲染决策）。

### 工具节点与变量节点（`role: 'tool'`）

**术语**（前后端统一；契约字段名 `role` / `materialize.as` / `tool` 描述符保持不变）：

| 术语 | 含义 | 典型 `type` |
| --- | --- | --- |
| **工具节点**（`role: 'tool'`） | 大类：**不是数据条目**，写回 mod 时**不写任何数据文件**，只为表达「值的持有与外化」或画布结构 | —— |
| └ **变量节点** | 工具节点里**持有值**的一类：标量、字典形态、列表形态 | `text` / `number` / `images` / `table`（字典）/ `list`（列表） |
| └ 其它工具节点 | 不持有变量值 | `container` / `danglingPort` / `previewNode` |

- 节点上标 `role: 'tool'`（数据条目为 `'data'`，缺省按 `'data'` 处理），往往没有数据
  `id`；**但 `uid` 必须稳定唯一**（后端拆出的节点使用 `tool:<host uid>:<field>`，前端建议
  `editor:<type>:<序号>`），
  否则导出→导入往返一次，连在它身上的线就对不上了。
- 后端拆出的变量节点自带 `tool` 描述符（`as` / `type` / `hostUid` / `hostCategory` / `hostId` / `field`）；
  `type` 取自 `materialize.type`（当前为 `table` / `list`），**前端需自己为该类型提供节点模板与渲染**，
  后端不再补充控件、标签或颜色信息。
- 两种产生方：
  - **后端**：`materialize: { as: 'tool', type: 'table' }` 的字段被拆出来 → `contains` 边（宿主 `output:<字段名>` → 变量节点），值在变量节点里；
  - **前端**：用户在画布上放置的变量节点，没有宿主 → 用 `kind: 'bind'` 边与使用它的字段关联（一个变量可喂多个字段）。

### 写回规则（前端 → 后端的中间态 JSON）

前端导出时按同一套形状回传，后端据 `role` / `kind` / `inline` 三个字段就能唯一定位：

| 形状 | 写回行为 |
| --- | --- |
| `role: 'data'` 节点 | 写进它来源的 content 文件（`file` + `category` + `id`） |
| `role: 'tool'` 节点 | **不写数据文件**，只作为值来源 / 画布结构保留 |
| `inline` 非 null 的子节点 | 合并进宿主字段（`inline.hostUid` 的 `inline.field[inline.index]`），不新建条目；`inline.syntheticId === false` 时才把它的 `id` 写进那份内联对象 |
| `kind: 'contains'` | 结构关系：子节点内容 ⇒ 宿主的 `from.field`（`as: 'node'` 合并实体，`as: 'tool'` 折叠值） |
| `kind: 'bind'` | 值关系：`from` 端（变量节点）的内容 ⇒ `in` 端节点的 `from.field`；同一字段被多条 `bind` 绑定时告警 |
| `kind: 'link'` | 引用关系：字段值的**编码形状**由后端按 mapping 的 `extract` / `keys` 负责（前端只给目标 id） |
| 两端都没有 mapping 声明的连线 | 不是引用关系（如画布批注线）→ 不进 `edges`，导出时计到 `stats` 里，不算 `warnings` |

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
