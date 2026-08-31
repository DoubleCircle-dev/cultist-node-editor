import './helpers/domSetup.mjs';
import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import { IEventTarget } from '../../ui/scripts/types/IEventTarget.js';

/**
 * IEventTarget 监听器登记/移除（含 L6 修复：removeAllEventListeners 的
 * Set 删除无效代码，改为直接清空 Set）
 */
describe('IEventTarget 监听器管理', () => {
  it('addEventListener 会登记监听器', () => {
    const t = new IEventTarget();
    const h = () => {};
    t.addEventListener('a', h);
    assert.equal(t.getAllEventListeners('a').length, 1);
    assert.equal(t.getAllEventListeners('a')[0], h);
  });

  it('removeEventListener 按函数引用精确移除', () => {
    const t = new IEventTarget();
    const h1 = () => {};
    const h2 = () => {};
    t.addEventListener('a', h1);
    t.addEventListener('a', h2);
    t.removeEventListener('a', h1);
    const left = t.getAllEventListeners('a');
    assert.equal(left.length, 1);
    assert.equal(left[0], h2);
  });

  it('removeAllEventListeners 清空全部类型', () => {
    const t = new IEventTarget();
    t.addEventListener('a', () => {});
    t.addEventListener('a', () => {});
    t.addEventListener('b', () => {});
    t.removeAllEventListeners();
    assert.deepEqual(t.getAllEventListeners(), {});
  });

  it('removeAllEventListeners 支持按类型清空', () => {
    const t = new IEventTarget();
    t.addEventListener('a', () => {});
    t.addEventListener('b', () => {});
    t.removeAllEventListeners('a');
    assert.equal(t.getAllEventListeners('a').length, 0);
    assert.equal(t.getAllEventListeners('b').length, 1);
  });

  it('removeAllEventListeners 后不再触发回调', () => {
    const t = new IEventTarget();
    let calls = 0;
    t.addEventListener('a', () => {
      calls++;
    });
    t.removeAllEventListeners();
    t.emit('a');
    assert.equal(calls, 0);
  });

  it('removeAllEventListeners 幂等（可重复调用）', () => {
    const t = new IEventTarget();
    t.addEventListener('a', () => {});
    t.removeAllEventListeners();
    t.removeAllEventListeners();
    assert.deepEqual(t.getAllEventListeners(), {});
  });

  it('emit 将 detail 传给监听器', () => {
    const t = new IEventTarget();
    let got = null;
    t.addEventListener('x', (e) => {
      got = e.detail;
    });
    t.emit('x', { foo: 1 });
    assert.deepEqual(got, { foo: 1 });
  });
});
