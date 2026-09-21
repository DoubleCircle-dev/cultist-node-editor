import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';

/**
 * 菜单测试：`MenuManager` 的**数据描述式**菜单（节点右键 / 画布空白右键）。
 *
 * 覆盖：描述 → DOM（图标 / 说明 / 快捷键 / 禁用 / 危险 / 勾选 / 分隔 / 说明行）、点击语义、
 * 键盘（Esc / 上下键）、点内部不关菜单；以及节点菜单项清单与「复制 / 粘贴 / 重命名」等新操作。
 */

describe('菜单（MenuManager 数据描述式）', () => {
  let core;

  beforeEach(async () => {
    ({ core } = await createCore());
  });

  afterEach(() => {
    destroyCore(core);
  });

  /** 建节点并返回模型（`addNode` 不返回模型） */
  function addNode(type, x, y) {
    core.nodeManager.addNode(type, x, y);
    return core.nodes[core.nodes.length - 1];
  }

  /** 当前菜单里的项（按 DOM 顺序） */
  function menuItems() {
    return [...core.menuManager.menuContainer.querySelectorAll('.context-menu-item')];
  }

  /** 当前菜单里的项文本 */
  function menuLabels() {
    return menuItems().map((el) => el.textContent);
  }

  it('showContextMenu：按描述生成菜单（图标 / 说明 / 快捷键 / 危险 / 勾选 / 分隔 / 禁用 / 说明行）', () => {
    let clicked = 0;
    const menu = core.menuManager.showContextMenu(
      [
        { id: 'copy', icon: '⧉', label: '复制', hint: '说明小字', shortcut: 'Ctrl+D', onSelect: () => clicked++ },
        { id: 'danger', label: '危险项', danger: true },
        { separator: true, id: 'checked', label: '开关项', checked: true },
        { id: 'disabled', label: '禁用项', disabled: true, onSelect: () => clicked++ },
        { note: '这是说明行' },
      ],
      { x: 100, y: 100 }
    );

    assert.ok(menu, '应生成菜单');
    assert.equal(menu.className, 'context-menu');
    assert.ok(core.menuManager.isOpen, '应打开菜单');

    const items = menuItems();
    assert.equal(items.length, 4, '说明行不算菜单项');

    assert.equal(items[0].querySelector('.menu-icon').textContent, '⧉', '有图标');
    assert.equal(items[0].querySelector('.menu-label').textContent, '复制');
    assert.equal(items[0].querySelector('.menu-hint').textContent, '说明小字');
    assert.equal(items[0].querySelector('.menu-shortcut').textContent, 'Ctrl+D');

    assert.ok(items[1].classList.contains('is-danger'), '危险项带 is-danger');
    assert.ok(items[2].classList.contains('is-checked'), '开关项带 is-checked');
    assert.equal(menu.querySelectorAll('.context-menu-separator').length, 1, '分隔线按需插入');
    assert.ok(items[3].classList.contains('is-disabled'), '禁用项带 is-disabled');
    assert.equal(menu.querySelector('.context-menu-note').textContent, '这是说明行');

    // 点普通项：先关菜单再执行回调，回调能拿到右键位置
    let gotPosition = null;
    core.menuManager.showContextMenu([{ label: '带位置', onSelect: (api) => (gotPosition = api.position) }], { x: 12, y: 34 });
    menuItems()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(gotPosition, { x: 12, y: 34 }, '回调拿到右键屏幕坐标');
    assert.ok(!core.menuManager.isOpen, '点完关闭菜单');
    assert.equal(clicked, 0, '其他项没被连累');

    // 点禁用项：什么也不发生，菜单也不关（用户还能选别的）
    core.menuManager.showContextMenu([{ label: '禁用项', disabled: true, onSelect: () => clicked++ }], { x: 0, y: 0 });
    menuItems()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(clicked, 0, '禁用项不触发回调');
    assert.ok(core.menuManager.isOpen, '禁用项不关菜单');
  });

  it('交互：点菜单内部 mousedown 不关、点外面关、Esc 关、上下键在项间移动焦点', () => {
    core.menuManager.showContextMenu([{ label: 'A' }, { label: 'B' }], { x: 10, y: 10 });
    const container = core.menuManager.menuContainer;

    menuItems()[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    assert.ok(core.menuManager.isOpen, '点菜单内部不关（否则 click 不触发）');

    document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    assert.ok(!core.menuManager.isOpen, '点外面关');

    // 连续两次 showContextMenu：总是打开（不是 toggle，否则连续右键会看不见菜单）
    core.menuManager.showContextMenu([{ label: 'A' }, { label: 'B' }], { x: 10, y: 10 });
    core.menuManager.showContextMenu([{ label: 'A' }, { label: 'B' }], { x: 10, y: 10 });
    assert.ok(core.menuManager.isOpen, '连续弹出保持打开');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(document.activeElement, menuItems()[0], '↓ 聚焦第一项');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(document.activeElement, menuItems()[1], '↓ 走到第二项');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    assert.equal(document.activeElement, menuItems()[0], '↑ 回到第一项');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(!core.menuManager.isOpen, 'Esc 关菜单');
    assert.ok(container, '容器还在（只是不显示）');
  });

  it('节点右键菜单项：复制 / 重命名 / 删除 / 合并 / 连线 / 属性分组齐全，无连线时「断开」置灰', () => {
    const a = addNode('test', 100, 100);
    const items = core._nodeContextMenuItems(String(a.id), { x: 10, y: 10 });
    const labels = items.map((item) => item.label).filter(Boolean);

    assert.ok(labels.includes('复制节点'));
    assert.ok(labels.includes('重命名'));
    assert.ok(labels.includes('删除节点'));
    assert.ok(labels.some((t) => /合并为容器节点（1 个）/.test(t)), '未选中别的节点时合并自己');

    const disconnect = items.find((item) => item.id === 'disconnect');
    assert.equal(disconnect.disabled, true, '没有连线时「断开全部连线」置灰');
    assert.ok(items.some((item) => item.id === 'toggle-connections'), '有「隐藏 / 显示连接线」');
    assert.ok(items.some((item) => item.danger === true), '删除是危险项');

    const remove = items.find((item) => item.id === 'remove-from-container');
    assert.equal(remove, undefined, '不在容器里就没有「从容器移出」');
  });

  it('节点右键菜单项：容器给展开 / 收起、加入选中节点、转发端口、拆开', () => {
    const a = addNode('test', 100, 100);
    const frame = core.mergeToContainer([a.id]);

    const first = core._nodeContextMenuItems(String(frame.id), null);
    assert.ok(first.some((item) => item.label === '收起容器'), '展开态给「收起容器」');
    assert.ok(first.some((item) => item.label === '拆开容器节点'));
    assert.ok(first.some((item) => item.label === '添加转发端口'));
    assert.ok(
      first.some((item) => item.note && /选中一些容器外的节点/.test(item.note)),
      '没有候选节点时给说明行'
    );

    // 收起后菜单变成「展开容器」
    core.toggleContainer(String(frame.id));
    const second = core._nodeContextMenuItems(String(frame.id), null);
    assert.ok(second.some((item) => item.label === '展开容器'));

    // 选中一个外部节点 → 出现「加入选中节点（1 个）」
    const c = addNode('text', 900, 900);
    c.setSelected(true);
    const third = core._nodeContextMenuItems(String(frame.id), null);
    assert.ok(third.some((item) => item.label && /加入选中节点（1 个）/.test(item.label)));
  });

  it('画布空白处右键：弹出视图菜单（粘贴置灰 / 整理布局 / 适应视图 / 隐藏连接 / 清空）', () => {
    const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });
    core.viewport.dispatchEvent(event);

    const labels = menuLabels();
    assert.ok(labels.some((t) => /粘贴/.test(t)));
    assert.ok(labels.some((t) => /整理布局/.test(t)));
    assert.ok(labels.some((t) => /适应视图/.test(t)));
    assert.ok(labels.some((t) => /隐藏连接线|显示连接线/.test(t)));
    assert.ok(labels.some((t) => /清空画布/.test(t)));
    assert.ok(event.defaultPrevented, '阻止浏览器原生右键菜单');

    const paste = menuItems().find((el) => /粘贴/.test(el.textContent));
    assert.ok(paste.classList.contains('is-disabled'), '剪贴板为空时「粘贴」置灰');
  });

  it('复制：副本带标题与属性值（按属性 id 后缀对齐），并写入剪贴板供「粘贴」', () => {
    const a = addNode('test', 100, 100);
    const before = core.nodes.length;
    const srcIds = (a.detailProperties || []).map((prop) => prop.id);

    const copy = core.duplicateNode(String(a.id));
    assert.ok(copy, '应生成副本');
    assert.equal(core.nodes.length, before + 1);
    assert.equal(copy.type, a.type);
    assert.equal(copy.title, a.title);
    assert.equal(copy.x, a.x + 48, '往右下错开');
    assert.equal(copy.y, a.y + 48);
    assert.ok(copy.selected, '副本选中');
    assert.ok(core.nodeClipboard, '写进剪贴板');

    // 属性值按「去掉节点 id 前缀」的后缀对齐（副本的属性 id 与原节点不同）
    assert.equal((copy.detailProperties || []).length, (a.detailProperties || []).length, '属性数量一致');
    assert.ok(!srcIds.some((id) => String(id) === String(copy.id) + ':x'), '属性 id 没有被原样搬过来');

    // 再套一次仍能对上（说明后缀匹配是可复用的）
    assert.ok(core._applySpecToNode(core._nodeSpecOf(a), copy) > 0, '至少套上一个属性值');

    // 粘贴：在指定屏幕位置建节点
    const pasted = core.pasteNode({ x: 30, y: 40 });
    assert.ok(pasted, '应粘贴出节点');
    assert.equal(pasted.type, copy.type);
    assert.notEqual(String(pasted.id), String(copy.id));

    // 容器节点不复制
    const frame = core.mergeToContainer([String(pasted.id)]);
    assert.equal(core.duplicateNode(String(frame.id)), null, '容器节点不支持复制');
  });

  it('重命名：把焦点送进标题输入框并全选', () => {
    const a = addNode('test', 10, 10);
    assert.equal(core.renameNode(String(a.id)), true);
    const input = core.nodeManager.nodeViews.get(String(a.id)).element.querySelector('.node-title-input');
    assert.equal(document.activeElement, input, '标题输入框获得焦点');
  });

  it('修改可选属性：从菜单打开与节点上按钮同一条链路（无扩展属性时不开并提示）', () => {
    const notices = [];
    core.bus.on('status:message', (e) => notices.push(e.detail.text));

    const plain = addNode('text', 10, 10);
    assert.equal(core.openExtendPropertyPanel(String(plain.id), { x: 5, y: 5 }), false, '没有可选属性 → 不开');
    assert.match(notices[notices.length - 1], /没有可选属性/);

    const test = addNode('test', 200, 200);
    assert.equal(core.openExtendPropertyPanel(String(test.id), { x: 5, y: 5 }), true, '有属性池 → 打开');
    assert.ok(core.menuManager.isOpen, '面板由 MenuManager 呈现');
  });

  it('添加转发端口（菜单）：自动起一个没被占用的名字，可重复添加', () => {
    const a = addNode('test', 100, 100);
    const frame = core.mergeToContainer([a.id]);
    const id = String(frame.id);

    const firstPort = core.addForwardPortByMenu(id);
    assert.ok(firstPort, '应加出端口');
    assert.equal(firstPort.side, 'input');
    const secondPort = core.addForwardPortByMenu(id);
    assert.ok(secondPort, '再点一次应加第二个');
    assert.notEqual(secondPort.key, firstPort.key, '名字不重复');
    assert.equal(core.listForwardPorts(id).length, 2);
  });
});
