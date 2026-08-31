/**
 * 独立内存泄漏检查（在干净的 Node 进程中运行，避免 mocha 套件内
 * 前序测试的堆碎片干扰）：
 *
 *   批量创建/删除节点，比较不同规模下 GC 后的堆内存。
 *   若堆内存随节点数线性增长 → 说明节点对象被持久持有 → 泄漏。
 *
 * 运行：node --expose-gc test/ui/memory-check.mjs
 */
import './helpers/domSetup.mjs';
import { createCore, destroyCore } from './helpers/env.mjs';

const tick = () => new Promise((r) => setTimeout(r, 20));

const { core } = await createCore();

function measureHeap() {
  for (let i = 0; i < 5; i++) global.gc();
  return process.memoryUsage().heapUsed;
}

// 预热，使分配器进入稳定状态
for (let i = 0; i < 200; i++) {
  core.nodeManager.addNode('blank', 100, 100);
  const id = core.nodeManager.nodes.keys().next().value;
  core.nodeManager.deleteNode(id);
}
core.historyManager.clear();
await tick();

const rounds = [1000, 2000, 4000];
const samples = [];
for (const n of rounds) {
  for (let i = 0; i < n; i++) {
    core.nodeManager.addNode('blank', 100, 100);
    const id = core.nodeManager.nodes.keys().next().value;
    core.nodeManager.deleteNode(id);
  }
  core.historyManager.clear();
  await tick();
  samples.push({ n, heap: measureHeap() });
}

console.log('累计删除节点数 | GC 后堆内存');
samples.forEach((s) => {
  console.log(`${String(s.n).padStart(10)} | ${(s.heap / 1024 / 1024).toFixed(2)} MB`);
});

const first = samples[0].heap;
const last = samples[samples.length - 1].heap;
const growthMB = (last - first) / 1024 / 1024;
console.log(`总增长 ${growthMB.toFixed(2)} MB（阈值 8MB）`);

destroyCore(core);

if (growthMB > 8) {
  console.error('❌ 疑似内存泄漏：堆内存随节点规模显著增长');
  process.exit(1);
}
console.log('✅ 无内存泄漏：堆内存保持平坦');
