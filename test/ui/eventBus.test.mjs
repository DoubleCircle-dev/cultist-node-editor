import './helpers/domSetup.mjs';
import { describe, it, beforeEach } from 'mocha';
import assert from 'node:assert/strict';
import { EventBus } from '../../ui/scripts/types/eventBus.js';

/**
 * L1 根因修复验证：EventBus 曾把 listener 包装成新函数注册，
 * 导致 off/removeEventListener 按原始引用永远移不掉 → 监听器永久累积。
 * 本套件验证：on/off、once、onceExclusive 均能正确按引用移除。
 */
describe('EventBus 监听器生命周期（L1 根因修复）', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  /** 统计 bus 上当前注册的监听器总数 */
  function countListeners() {
    const all = bus.getAllEventListeners();
    return Object.values(all).reduce((n, arr) => n + arr.length, 0);
  }

  it('on + off 能按原始引用移除监听器', () => {
    const handler = () => {};
    bus.on('drag:node:success', handler);
    assert.equal(countListeners(), 1, '注册后应有 1 个监听器');
    bus.off('drag:node:success', handler);
    assert.equal(countListeners(), 0, '移除后应为 0 个');
  });

  it('标准事件与非标准事件均可按引用移除', () => {
    const handler = () => {};
    bus.on('change:property:success', handler); // 标准 action:target:status
    bus.on('toggleMenu', handler); // 非标准
    assert.equal(countListeners(), 2);
    bus.off('change:property:success', handler);
    bus.off('toggleMenu', handler);
    assert.equal(countListeners(), 0);
  });

  it('off 移除的是同一个监听器：其它同类型监听器不受影响', () => {
    const a = () => {};
    const b = () => {};
    bus.on('drag:node:success', a);
    bus.on('drag:node:success', b);
    bus.off('drag:node:success', a);
    const left = bus.getAllEventListeners('drag:node:success');
    assert.equal(left.length, 1);
    assert.equal(left[0], b);
  });

  it('once 触发一次后自动移除，不累积', () => {
    let calls = 0;
    bus.once('drag:port:end', () => {
      calls++;
    });
    assert.equal(countListeners(), 1);
    bus.emit('drag:port:end');
    assert.equal(calls, 1);
    assert.equal(countListeners(), 0, 'once 触发后应自动移除');
    bus.emit('drag:port:end');
    assert.equal(calls, 1, '再次触发不应生效');
  });

  it('once 未触发时可按返回的引用手动移除', () => {
    const onceListener = bus.once('drag:port:end', () => {});
    assert.equal(countListeners(), 1);
    bus.off('drag:port:end', onceListener);
    assert.equal(countListeners(), 0);
  });

  it('onceExclusive 触发其一后，两个监听器都被清理', () => {
    let success = 0;
    let failed = 0;
    bus.onceExclusive(
      'drag:node:success',
      'drag:node:failed',
      () => {
        success++;
      },
      () => {
        failed++;
      }
    );
    assert.equal(countListeners(), 2, '注册后应有 2 个监听器');

    bus.emit('drag:node:success');
    assert.equal(success, 1);
    assert.equal(failed, 0);
    assert.equal(countListeners(), 0, '触发其一后两个都应被清理');

    bus.emit('drag:node:failed');
    assert.equal(failed, 0, '清理后不应再触发');
  });

  it('模拟 NodeManager.mousedownHandler 反复调用 onceExclusive 不累积', () => {
    // 每次 mousedown 注册一对，随后一次拖拽成功触发清理
    for (let i = 0; i < 50; i++) {
      bus.onceExclusive('drag:node:success', 'drag:node:failed', () => {}, () => {});
      bus.emit('drag:node:success');
    }
    assert.equal(countListeners(), 0, '50 轮 mousedown 后不应残留监听器');
  });

  it('事件分发能把 detail 传给监听器', () => {
    let got = null;
    bus.on('create:node:finished', (e) => {
      got = e.detail;
    });
    bus.emit('create:node:finished', { nodes: [1, 2] });
    assert.ok(got);
    assert.deepEqual(got.nodes, [1, 2]);
  });
});
