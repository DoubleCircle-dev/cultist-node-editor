# UI 单元测试（jsdom + mocha）

针对 `ui/scripts/**`（webview 前端）的单元与集成测试，重点覆盖
**节点生命周期**与**内存泄漏**相关的修复。

## 运行

```bash
# 单元 + 集成测试（含 --expose-gc）
npm run test:ui

# 独立内存泄漏检查（干净进程，测量 GC 后堆内存随节点规模是否增长）
npm run test:ui:memory
```

> 终端里 `node` 若被别名成 `winpty node.exe`（Git Bash），输出重定向会报
> `stdout is not a tty`。请用 `command node` 或 `npm run`（npm 走 cmd，无此别名）。

## 文件结构

| 文件 | 覆盖内容 |
|---|---|
| `eventBus.test.mjs` | L1 根因：`on/off/once/onceExclusive` 按引用移除，不累积 |
| `iEventTarget.test.mjs` | 监听器登记/移除、`removeAllEventListeners`（含 L6 修复） |
| `disposeChain.test.mjs` | 模型 `releaseListeners`（软释放）/`dispose`（全量销毁）责任链 |
| `nodeLifecycle.test.mjs` | 创建/删除/undo/clear/redraw 全生命周期 + 监听器不累积 |
| `memory-check.mjs` | 独立内存检查：批量创建/删除后堆内存平坦 |
| `helpers/domSetup.mjs` | jsdom 全局环境（document/Event/CustomEvent/EventTarget…） |
| `helpers/env.mjs` | 构建 webview 骨架 + 创建/销毁 `ControllerCore` |

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

## 关于 WeakRef / GC 探针

`WeakRef.deref()` + `global.gc()` 在本环境**不可靠**：单对象基线（无任何强引用）在
`gc()` 后 `deref()` 仍返回对象（V8 伪影），而数组场景可正常回收。
因此套件不把 WeakRef 作为断言依据，改为：
- **确定性断言**：删除后索引/监听器/DOM 全部释放；
- **可测量验证**：独立 `memory-check.mjs` 证明堆内存平坦（实测 1000→4000 节点仅 +0.14MB）。
