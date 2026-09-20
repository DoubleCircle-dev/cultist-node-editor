# Change Log

All notable changes to the "cultist-node-editor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

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