# UI 单元测试（jsdom + mocha）

针对 `frontend/src/**`（webview 前端）的单元与集成测试，重点覆盖
**节点生命周期**与**内存泄漏**相关的修复。

## 运行

```bash
# 单元 + 集成测试（含 --expose-gc）
npm run test:ui

# 只跑一个文件（或一个目录）：把路径接在 -- 后面
npm run test:ui:file -- test/ui/eventBus.test.mjs
npm run test:ui:file -- --grep "previewMode" test/ui/frontendHost.test.mjs

# 改动时持续跑（watch）
npm run test:ui:watch

# 独立内存泄漏检查（干净进程，测量 GC 后堆内存随节点规模是否增长）
npm run test:ui:memory

# 提交前快速把关：lint + 全部前端测试
npm run verify
```

> 终端里 `node` 若被别名成 `winpty node.exe`（Git Bash），输出重定向会报
> `stdout is not a tty`。请用 `command node` 或 `npm run`（npm 走 cmd，无此别名）。

> 扩展宿主的集成测试（`test/extension.test.js`，会真的拉起一个 VS Code）是 `npm test`（vscode-test），
> 与上面的前端单测是两套东西；`npm test` 的 `pretest` 会先跑 lint。

## 文件结构

| 文件 | 覆盖内容 |
| --- | --- |
| `eventBus.test.mjs` | L1 根因：`on/off/once/onceExclusive` 按引用移除，不累积 |
| `iEventTarget.test.mjs` | 监听器登记/移除、`removeAllEventListeners`（含 L6 修复） |
| `disposeChain.test.mjs` | 模型 `releaseListeners`（软释放）/`dispose`（全量销毁）责任链 |
| `nodeLifecycle.test.mjs` | 创建/删除/undo/clear/redraw 全生命周期 + 监听器不累积 |
| `propRendering.test.mjs` | 全节点类型 × 全属性渲染检测（含扩展属性池/模式属性/端口） |
| `memory-check.mjs` | 独立内存检查：批量创建/删除后堆内存平坦 |
| `helpers/domSetup.mjs` | jsdom 全局环境（document/Event/CustomEvent/EventTarget…） |
| `helpers/env.mjs` | 构建 webview 骨架 + 创建/销毁 `ControllerCore` |

## 属性渲染检测（propRendering）

对 `NodeTypeRegistry` 全部节点类型做全量扫描：

- **配置层**：`properties` / `modeProperties` / `exProperties`（含 `hub` 子属性）里的
  每个 `type` 都必须能解析到渲染器。注意 `range→slider`、`table→table-preview` 会
  在 `PropGenerator.createProp` 里被转换，判定时需先解析。
- **模型层**：`NodeGenerator.createNode` 后递归收集属性（**端口 hub + 普通属性 +
  全部模式属性 + 扩展属性池**；注意 `detailProperties` 不含扩展属性池，必须单独枚举
  `extendedProperties.pool`），逐个 `PropView.renderProp` 断言不抛错、不回退
  `.prop-error`、元素/监听器有效。
- **类型映射**：`int`→`NumericProp`、`node`/`text-preview`→`BaseProp`（可渲染兜底）、
  select 模式切换器→`OptionsProp`。
- **渲染结构**：PortProp 走 `createRow` 含 `.port-slot`/`.port-dot`；`ViewProp`
  （`extends PortProp`，table/image/textarea 预览）走 `createView`，根元素即 `.prop-card`。

> 检测脚本 `agent-scratch/check-prop-rendering.mjs`（gitignored）可单独跑出覆盖报表：
> `command node agent-scratch/check-prop-rendering.mjs`。

## 关键约定

- **必须先 import `./helpers/domSetup.mjs`**（测试文件第一行）：它把 jsdom 的
  `document/Event/CustomEvent/EventTarget` 等挂到 `globalThis`，而 `NodeTypeRegistry`
  等模块在**模块顶层**就访问 `document/getComputedStyle`，必须先就绪。
- 每个测试用全新 `ControllerCore`（`beforeEach` 里 `createCore()`，`afterEach` 里
  `destroyCore()`），保证隔离。
- `BitmapIdGenerator` 会**复用已释放的 id**（`release` 回退 `nextId`），因此取节点 id
  一律用 `core.nodeManager.nodes.keys().next().value`，不要假设递增。
- 节点模型/端口的监听器数量用 `getAllEventListeners()` 统计（确定性），
  这是本代码库泄漏的主要表现（监听器累积）。
- `PropView.renderProp` 返回的 `listeners` 由**调用方负责移除**（`NodeView.redraw`
  先 `removeListeners()` 再重建）；重复渲染前若不先移除会累积，属预期行为，
  测试需模拟调用方职责。
- `ViewProp` 继承 `PortProp`，但走 `createView` 路径（`.prop-card`，无端口槽位），
  判定端口 DOM 时需排除 `ViewProp`。

## 关于 WeakRef / GC 探针

`WeakRef.deref()` + `global.gc()` 在本环境**不可靠**：单对象基线（无任何强引用）在
`gc()` 后 `deref()` 仍返回对象（V8 伪影），而数组场景可正常回收。
因此套件不把 WeakRef 作为断言依据，改为：

- **确定性断言**：删除后索引/监听器/DOM 全部释放；
- **可测量验证**：独立 `memory-check.mjs` 证明堆内存平坦（实测 1000→4000 节点仅 +0.14MB）。
