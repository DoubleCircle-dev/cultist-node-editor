# Change Log

All notable changes to the "cultist-node-editor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- feat(frontend): 页面（工作区选项卡）—— tab 栏可新建 / 切换 / 改名（双击）/ 拖拽排序 /
  关闭（✕ 或中键，内容非空先确认），右侧「🗂️ 页面管理」浮层可逐页存成文件；
  切换是无损的（索引换手 + DOM 停放，页与页互不干扰）；「💾 保存」导出全部页面
  （`graphData.pages`，宿主「📂 加载」可读回，浏览器下退化为下载 / 选文件）；
  页面会自动写进 `localStorage['nodeEditor.pages']`，刷新后仍在；
  读 mod / 预览 json 时若当前页已有内容，会按来源另开一页而不是把节点堆在一起

- feat(frontend): 适配 core 的新契约（「后端只描述语义，不决定渲染」，后端已同步本工作区）：
  - 导入按 `props[].kind`（string / number / boolean / list / dict）归类，控件与标签由前端自己定（兜底 text），
    端口能连什么按 `links[].targets` 限制；
  - 连线按 `edge.out` / `edge.in` 落位（出线端画在 output 端口、入线端画在 input 端口），
    不再自己推断方向 —— `alt` / `linked` / `inductions` 这类「条件写在目标身上」的关系由后端变换成「目标 → 本条目」；
  - 端口属性的值输入：带 `valueType` 的端口边多一个输入框（未连线可编辑，连线后只读显示目标 id，断开恢复可编辑）；
  - 节点模型上留存数据条目的 `dataId` 与原始 `props`（`dataProps`），
    作为 `dataContract` 里 nodeModel → 中间态 JSON（导出方向）的取值依据；
  - 新增契约适配单测（`test/ui/dataContract.test.mjs`）。


- Initial release