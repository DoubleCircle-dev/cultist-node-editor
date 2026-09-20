# Change Log

All notable changes to the "cultist-node-editor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- docs(core): 术语统一（只改中文表述，契约字段名不变）
  - `role: 'tool'` 是**工具节点**这个大类（不是数据条目、不写数据文件）；
    其中**持有值**的一类叫**变量节点** —— 标量 `text` / `number` / `images`
    与字典 / 列表形态的 `table` / `list`；
    `container` / `danglingPort` / `previewNode` 等**不持有变量值**的节点仍属工具节点
  - `reverse: true` 的中文统一写「**反向记录**」（书写位置与判定主体不在同一端、语义主体在对端），
    README 新增「工具节点与变量节点」术语表
- feat(core): 契约新增 `reverse`（**反向记录**）标记，并订正 recipe 跳转分支的方向
  - `recipes.alt` / `linked` / `alternativerecipes` / `inductions` 由 `direction: 'input'` 改为 `'output'`：
    这些字段的分支列表写在**源** recipe 上，节点模型里就是「源 → 目标」，
    `edge.out` = 源条目的 `output:<字段>`、`edge.in` = 目标的通用入口（此前它们被画成「目标 → 本条目」，前端必须在输入侧另开槽位）
  - 新增 `links[].reverse: true`（同值透传到 `nodes[].connections[].reverse` 与 `edges[].from.reverse`）：
    表示游戏 JSON 里这条关系的**书写位置与判定主体相反**，目前两类：
    recipe 的跳转分支（`alt` / `linked` / `alternativerecipes` / `inductions`）与卡牌 / 性相的分支式触发（`elements.induces`）
    —— 分支列表在源条目上，但「是否跳转 / 能否触发、以什么条件生效」由**对端** recipe 自己的定义决定；
    缺省（无此键）= 正向，如 `effects`（自己的产出）、`requirements`（自己的进入条件）与 `actionid`
    （行动框只是分类名、不是执行端，仍是普通 `input`）
  - 悬空告警按端口性质分档：反向记录的端口描述为「分支端口」，其余仍是「需求 / 效果端口」
  - `toData.detectConnections` 改为委托 `mapping.connectionsOf`，不再维护第二份实现（此前两边各一份，新增规则字段必漏改一边）
  - origin 全量数字不变（6692 节点 / 28493 边 / resolved 27947 / 悬空字段 201），仅方向与标记变化

- feat(core): 新增**后端服务层** `core/service/`（进程内，不起网络端口；数据仍走原 webview `postMessage` 契约）
  - `index.js` 纯服务层（不 require vscode）+ `host.js` vscode 绑定（storageUri / FileSystemWatcher / 设置 / 生命周期）；
    缓存落 `context.storageUri`（无工作区退 `globalStorageUri`），**不往用户工作区写文件**
  - **快速加载**：来源文件「相对路径 + mtime + size」签名一致时直接复用落盘的节点图，
    连一个 JSON 都不解析（实测示例 mod 冷启动 345ms → 命中 2ms）；命中后在后台预热解析结果
  - **工作区监听**：mod 目录 `**/*.json` 事件防抖后只重解析**变化的文件**，建图后与上一张图按
    `uid` / `edge.id` 比对，变化面小于阈值时回发新增的 `graphPatched` 增量、超过则重发全量图；
    另提供**主动全量重载**（消息 `reloadGraph` + 命令面板「重载 Mod 数据」「重载游戏基础内容」）
  - **origin 快照**：`scripts/gen-origin-snapshot.mjs` 预生成中间态 JSON（约 34 MB）随 VSIX 分发，
    运行时一次 `JSON.parse`（实测 881ms → 415ms）；快照记 `mappingRevision`（`mapping.revision()` =
    `mapping.js` + 内置插件源码摘要），规则表一改自动失效并回退源文件加载
  - **origin 资源**：图片按 `image-index.json` 的 name→路径索引解析（本地优先 → CDN 回退 → 同名多义按类别目录消歧）；
    origin 的 JSON 源数据不预加载，按需读单条源码
  - 新增设置项 `quickLoad` / `watchWorkspace` / `watchDebounce` / `autoSaveDoc` / `snapshotPercent`（均默认开）
  - 新增画布文档自动保存（落扩展存储，打开时恢复）—— 之前前端 `autoSave*` 设置只存配置、无后端实现
  - 契约只做加法：原三条消息字段不变，新增 `fromCache` / `fromSnapshot` / `signature` 与
    `graphPatched` / `docRestored` / `autoDocSaved` / `imageResolved` / `sourceSnippet` 五条新消息
- feat(core): `materialize: { as: 'tool' }` 落地 —— 装备声明字段拆出 `role: 'tool'` 变量节点
  （自带 `tool: { as, type, hostUid, hostCategory, hostId, field }` 描述符）与 `kind: 'contains'` 结构边；
  渲染交给前端（后端只给模型与数据）。origin 全量实测新增 1079 个变量节点（6692 节点 / 28493 边）
- test: 新增 `test/service.test.js`（19 条：缓存基元、图/文档缓存、文件收集与图比对、origin 资源、
  mod 加载与重载，含「重载结果 ≡ 从零全量重跑」不变量）；扩展宿主集成测试补服务层接线（命令/设置/回发）

- refactor(core): 后端契约改成「只描述语义」，流水线按职责重排为 `parse 解析` → `mapping 加连接 / 拆节点`
  → `toData 融合中间态 JSON`：
  - 字段规则只声明**连接需求**（`link`: direction / targets / multi / extract / keys / port）与**中间态转化**
    （`materialize`）；去掉了控件类型、标签、图标、颜色、`valueType` 这些渲染信息——
    基础属性类型由原始 JSON 值现推（`kind ∈ string|number|boolean|list|dict`），值原样交给前端；
  - `mapping.connectionsOf()`（加连接，原 `toData.detectConnections`）、`mapping.splitInline()`（拆节点）成为 mapping 的职责；
    recipe 里内联的卡槽拆成 `slots` 节点、`alt`/`linked` 里的内联 recipe 定义拆成 `recipes` 节点、
    内联卡组拆成 `decks` 节点；只写 `id`/`chance` 这类引用参数的条目不算定义，不拆；
  - 中间态 JSON（`format: cne-node-graph`, `version: 1`）：`nodes[].props = { name, kind, value, links, materialize }`
    （`fields`/`refs` 已删除），连接线一律给出已变换好的两端 `edge.out` / `edge.in`
    （`alt` / `linked` / `inductions` 这类「条件写在目标身上」的关系方向由后端定），
    并新增 `kind: 'contains'` 表达宿主与拆出来节点之间的包含关系；
  - 字段规则的事实依据改为官方 wiki 手册（`agent-scratch/help.mw`，已提取为机器可读字段表），
    规则表只列「要连线的字段 + 要拆的内联定义」，其余字段由后端兜底；
  - 字段插件（TRM / 导入扩展）同步为新形状，并补上 mapping ↔ 插件表的接线（`baseCategories` / `rebuildRules`）、
    修复 `mapping.helpers` 漏导出 `actualFieldNames` 导致的类型报错；
  - origin 全量实测：5613 节点 / 32809 连接（resolved 98.34%）/ 文件外节点 546 / 告警 201。

- Initial release