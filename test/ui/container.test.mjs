import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore } from './helpers/env.mjs';
import { graphToDataPool } from '../../frontend/src/dataContract.js';
import { ModDataRegistry } from '../../frontend/src/modDataRegistry.js';

/**
 * 容器节点（containerNode）测试：把多个节点**合并**成一个大背景容器。
 *
 * 覆盖：合并（展开显示半透明背景框）/ 收起（只留转发端口与透传属性）/ 拆开、
 * 成员显隐与归属浮标、透传变量（文本 / 列表·字典）与双向同步、自动合并开关。
 */

/** 宿主条目（recipes） */
function makeHost() {
  return {
    uid: 'test-ns:recipes:r1',
    id: 'r1',
    type: 'recipes',
    category: 'recipes',
    title: 'r1',
    file: 'recipes/test.json',
    source: 'mod',
    props: [{ name: 'warmup', kind: 'number', value: 30, links: [], materialize: null }],
  };
}

/** 从宿主拆出来的内联子节点（text 节点） */
function makeChild() {
  return {
    uid: 'test-ns:text:c1',
    id: 'c1',
    type: 'text',
    category: 'text',
    title: 'c1',
    file: 'recipes/test.json',
    source: 'mod',
    inline: {
      hostUid: 'test-ns:recipes:r1',
      hostCategory: 'recipes',
      hostId: 'r1',
      field: 'startdescription',
      index: 0,
      syntheticId: true,
    },
    props: [],
  };
}

/** 注册进数据池并返回池内条目 */
function register(entry, namespace = 'test-ns') {
  const pool = graphToDataPool({ namespace, source: 'mod', count: 1, nodes: [entry], edges: [] });
  ModDataRegistry.register(pool);
  return pool.categories[entry.type][0];
}

describe('容器节点（合并 / 收起 / 透传）', () => {
  let core;

  beforeEach(async () => {
    ({ core } = await createCore());
    ModDataRegistry.categories = {};
    ModDataRegistry.sources = {};
    ModDataRegistry.files = {};
    ModDataRegistry.externals = {};
    ModDataRegistry.index = new Map();
  });

  afterEach(() => {
    destroyCore(core);
  });

  /** 建节点并返回模型（`addNode` 不返回模型） */
  function addNode(type, x, y) {
    core.nodeManager.addNode(type, x, y);
    return core.nodes[core.nodes.length - 1];
  }

  it('合并：容器包住成员、默认展开成半透明背景框，成员原地保留并挂归属浮标', () => {
    const a = addNode('test', 100, 100);
    const b = addNode('test', 520, 320);

    const frame = core.mergeToContainer([a.id, b.id]);
    assert.ok(frame, '应合并出容器节点');
    assert.equal(core.isContainer(frame.id), true);
    assert.deepEqual(core.containerMembers(frame.id), [String(a.id), String(b.id)]);

    const frameView = core.nodeManager.nodeViews.get(String(frame.id));
    assert.ok(frameView.element.classList.contains('node-container-expanded'), '默认展开');
    assert.ok(frameView.element.querySelector('.node-container-resize'), '展开态有缩放手柄');
    assert.ok(frameView.element.querySelector('.node-icon.node-icon-subgraph'), '标题左侧是子图图标');
    assert.equal(frameView.element.querySelector('.node-badge-count').textContent, '2 个节点');
    assert.ok(frameView.element.querySelector('.node-fold-toggle'), '有展开 / 收起按钮');

    // 背景框把两个成员都包住（成员原地不动）
    // ⚠️ jsdom 量不到尺寸，`onMounted()` 会把 model.width 写回 0，所以看记账里的框尺寸
    const rect = core.containerNodes.get(String(frame.id)).rect;
    assert.ok(frame.x < a.x && frame.y < a.y, '容器在成员左上方');
    assert.ok(frame.x + rect.w > b.x, '容器右边界盖住最右成员');
    assert.ok(frame.y + rect.h > b.y, '容器下边界盖住最下成员');
    assert.equal(a.x, 100, '成员位置不变');

    const aView = core.nodeManager.nodeViews.get(String(a.id));
    assert.ok(!aView.element.classList.contains('node-container-member-hidden'), '展开态成员可见');
    assert.equal(aView.element.querySelector('.node-member-tag').textContent, `↳ ${frame.title}`);
  });

  it('收起：成员与它们的连线一起隐藏，只留转发端口与透传属性；再展开恢复', () => {
    const a = addNode('text', 100, 100);
    const b = addNode('test', 520, 320);
    const frame = core.mergeToContainer([a.id, b.id]);
    const aView = core.nodeManager.nodeViews.get(String(a.id));

    // 成员之间连一条线，收起时它也要跟着藏
    const aOut = a.detailProperties.map((p) => p && p.outputPort).find(Boolean);
    const bIn = b.detailProperties.map((p) => p && p.inputPort).find(Boolean);
    if (aOut && bIn) core.connectionManager.createProgrammaticConnection(a, aOut, b, bIn);
    const connection = [...core.connectionManager.connections.values()][0];

    assert.equal(core.toggleContainer(frame.id), true, '切到收起');
    const frameView = core.nodeManager.nodeViews.get(String(frame.id));
    assert.ok(frameView.element.classList.contains('node-container-collapsed'));
    assert.equal(frameView.element.querySelector('.node-container-resize'), null, '收起态没有缩放手柄');
    assert.ok(aView.element.classList.contains('node-container-member-hidden'), '成员收起');
    if (connection) {
      assert.ok(document.getElementById(connection.id).classList.contains('connection-hidden'), '成员的连线也收起');
    }

    assert.equal(core.toggleContainer(frame.id), false, '切回展开');
    assert.ok(!aView.element.classList.contains('node-container-member-hidden'), '成员恢复显示');
  });

  it('拆开：容器自身删掉，成员留在原地并摘掉归属浮标', () => {
    const a = addNode('test', 100, 100);
    const b = addNode('test', 520, 320);
    const frame = core.mergeToContainer([a.id, b.id]);
    const frameId = String(frame.id);

    assert.equal(core.splitContainer(frameId), true);
    assert.equal(core.isContainer(frameId), false);
    assert.equal(core.nodeManager.nodes.has(frameId), false, '容器节点已从画布删掉');

    const aView = core.nodeManager.nodeViews.get(String(a.id));
    assert.ok(!aView.element.classList.contains('node-container-member-hidden'));
    assert.equal(aView.element.querySelector('.node-member-tag'), null, '成员浮标已摘掉');
    assert.equal(a.x, 100, '成员位置不变');
  });

  it('透传：成员的文本变量 / 列表·字典变量 变成容器上带标签的 Hub，双向同步', () => {
    const variable = addNode('text', 100, 100);
    core.nodeManager.addToolNode('list', { title: '参数表', x: 520, y: 320, rows: [{ value: 'a' }] });
    const tool = core.nodes[core.nodes.length - 1];

    const frame = core.mergeToContainer([variable.id, tool.id]);
    const hubs = frame.properties.filter((prop) => prop.containerPassthrough);
    assert.equal(hubs.length, 2, '文本变量与列表·字典变量 各一个透传 hub');
    assert.ok(
      hubs.every((hub) => hub.showLabel),
      '透传 hub 标了 showLabel（按设置画成标签栏 / 右下角图标）'
    );
    assert.deepEqual(
      hubs.map((hub) => hub.label),
      [variable.title, tool.title],
      'hub 标签 = 来源节点标题'
    );

    // 容器上改 → 写回成员节点
    const variableProp = variable.detailProperties.find(
      (prop) => prop.type === 'text' || prop.type === 'textarea-preview'
    );
    const proxy = frame.detailProperties.find((prop) => prop.passthroughSourceId === String(variable.id));
    assert.ok(variableProp && proxy, '代理属性已挂到容器上');
    proxy.changeValue('容器里改的值');
    assert.equal(variableProp.value, '容器里改的值', '改动写回了成员节点');

    // 成员节点里改 → 回流到容器
    variableProp.changeValue('里面改的值');
    assert.equal(proxy.value, '里面改的值', '成员侧的改动回流到容器');
  });

  it('透传按设置开关：关掉「透传变量」后容器上不再有变量 hub', () => {
    const variable = addNode('text', 100, 100);
    const frame = core.mergeToContainer([variable.id]);

    assert.equal(frame.properties.filter((prop) => prop.containerPassthrough).length, 1);
    core.setting.passthroughVariables = false;
    core._refreshContainerViews(String(frame.id));
    assert.equal(
      frame.properties.filter((prop) => prop.containerPassthrough).length,
      0,
      '关掉开关后透传 hub 被摘掉'
    );
  });

  it('容器尺寸自动撑到「包住全部成员」（只长不缩），最小尺寸也是它', () => {
    const a = addNode('test', 100, 100);
    const b = addNode('test', 520, 320);
    const frame = core.mergeToContainer([a.id, b.id]);
    a.setRect(300, 400);
    b.setRect(300, 400);
    a.setPosition(frame.x + 20, frame.y + 60);
    b.setPosition(frame.x + 360, frame.y + 500);

    // 手工把框缩到装不下
    frame.setRect(200, 150);

    const min = core._resizeMinSize(String(frame.id));
    assert.ok(min.w >= 360 + 300 + 12, `最小宽度要包住最右成员，实际 ${min.w}`);
    assert.ok(min.h >= 500 + 400 + 12, `最小高度要包住最下成员，实际 ${min.h}`);

    assert.equal(core._fitContainerToMembers(String(frame.id)), true, '应该自动撑大');
    assert.ok(frame.width >= min.w && frame.height >= min.h, '撑大后装得下所有成员');
    assert.deepEqual(core.containerNodes.get(String(frame.id)).rect, { w: frame.width, h: frame.height });

    // 已经装得下 → 不再改（只长不缩）
    const before = [frame.width, frame.height];
    assert.equal(core._fitContainerToMembers(String(frame.id)), false);
    assert.deepEqual([frame.width, frame.height], before);

    // 收起态不撑（卡片尺寸本来就由内容决定）
    core.toggleContainer(frame.id);
    frame.setRect(200, 150);
    assert.equal(core._fitContainerToMembers(String(frame.id)), false);
  });

  it('成员不能拖到框外：越界时被夹回容器内', () => {
    const a = addNode('test', 100, 100);
    const b = addNode('test', 520, 320);
    const frame = core.mergeToContainer([a.id, b.id]);
    const record = core.containerNodes.get(String(frame.id));
    // 容器框尺寸 ± 成员尺寸都给定（jsdom 量不到，手动铺上）
    frame.setRect(900, 700);
    a.setRect(200, 120);
    b.setRect(200, 120);

    // 手动拖到框外（右上角外面）
    a.setPosition(frame.x + 5000, frame.y - 5000);
    assert.equal(core._clampContainerMembers([a.id]), 1, '夹回一个成员');
    assert.ok(a.x >= frame.x, '左边界不外溢');
    assert.ok(a.x + a.width <= frame.x + frame.width, '右边界不外溢');
    assert.ok(a.y >= frame.y + 40, '不会盖住 title 栏');
    assert.ok(a.y + a.height <= frame.y + frame.height, '下边界不外溢');
    assert.equal(b.x, 520, '没越界的成员不动');

    // 收起态不参与回夹（成员本来就不可见）
    core.toggleContainer(frame.id);
    a.setPosition(frame.x - 999, frame.y - 999);
    assert.equal(core._clampContainerMembers([a.id]), 0, '收起态不夹');
    assert.equal(record.collapsed, true);
  });

  it('拖动展开的容器：成员被并进本次拖动集合（跟着一起走），拖完恢复原选中态', () => {
    const a = addNode('test', 100, 100);
    const b = addNode('test', 520, 320);
    const frame = core.mergeToContainer([a.id, b.id]);

    // 模拟拖动流程：nodeActionManager 会把同一个数组实例当成本次拖动集合
    const dragged = [frame];
    core.bus.emit('drag:node:start', { originalEvent: { button: 0 }, selectedNodes: dragged });
    assert.ok(dragged.includes(a) && dragged.includes(b), '成员并进了拖动集合');
    assert.ok(a.selected && b.selected, '成员先选上（拖动逻辑中途会重取 selectedNodes）');

    // NodeManager 会在 drag:node:success 时把选中清成「只选被点的那个」→ 补选要跟得上
    a.setSelected(false);
    b.setSelected(false);
    frame.setSelected(true);
    core.bus.emit('drag:node:success', {});
    assert.ok(a.selected && b.selected, '补选后成员仍在选中集合里（才会跟着动 / 进撤销）');

    core.bus.emit('drag:node:end', { nodeIds: dragged.map((n) => n.id), dx: 10, dy: 10 });
    assert.ok(!a.selected && !b.selected, '拖完恢复原来的选中态');

    // 收起态的容器不拉成员
    core.toggleContainer(frame.id);
    const dragged2 = [frame];
    core.bus.emit('drag:node:start', { originalEvent: { button: 0 }, selectedNodes: dragged2 });
    assert.deepEqual(dragged2, [frame], '收起态只拖容器自己');
    core.bus.emit('drag:node:end', {});
  });

  it('自动合并开关：默认不合并，打开后把后端拆出来的内联子节点合并成容器', () => {
    core.nodeManager.addNodeFromData('recipes', register(makeHost()), 0, 0);
    core.nodeManager.addNodeFromData('text', register(makeChild()), 400, 0);

    assert.equal(core.attachInlineContainers().containers, 0, '默认不合并');
    assert.equal(core.containerNodes.size, 0);

    core.setting.inlineAutoMerge = true;
    const stats = core.attachInlineContainers();
    assert.equal(stats.containers, 1, '宿主 + 子节点合成一个容器');
    assert.equal(stats.members, 2);
    assert.equal(core.containerMemberOf.size, 2);

    // 再关掉设置 → 容器被拆开
    core.setting.inlineAutoMerge = false;
    assert.equal(core.detachContainers(), 1);
    assert.equal(core.containerNodes.size, 0);
  });

  it('右键菜单：点菜单内部不会把菜单藏掉（否则 click 不触发），点菜单项真的合并出容器', () => {
    const a = addNode('test', 100, 100);
    const b = addNode('test', 520, 320);
    const menuContainer = core.menuManager.menuContainer;
    const position = { x: 10, y: 20 };

    a.setSelected(true);
    b.setSelected(true);
    core.bus.emit('node:contextmenu', { nodeId: a.id, node: a, position });
    assert.ok(menuContainer.classList.contains('active'), '右键应弹出菜单');
    const findItem = (re) => [...menuContainer.querySelectorAll('.context-menu-item')].find((el) => re.test(el.textContent));
    const item = findItem(/合并为容器节点/);
    assert.ok(item, '有「合并为容器节点」菜单项');
    assert.match(item.textContent, /合并为容器节点（2 个）/);

    // 点菜单内部：`MenuManager._onMouseDown` 不能摘 active ——
    // 一摘菜单就 display:none，mousedown 与 mouseup 之间元素被藏起来 → click 根本不触发
    item.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    assert.ok(menuContainer.classList.contains('active'), '点菜单内部不关菜单');

    // 点画布空白：关
    document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    assert.ok(!menuContainer.classList.contains('active'), '点外面关菜单');

    // 再右键一次：应重新弹出而不是被 toggle 关掉（否则连续右键第二次就没菜单）
    a.setSelected(true);
    b.setSelected(true);
    core.bus.emit('node:contextmenu', { nodeId: a.id, node: a, position });
    assert.ok(menuContainer.classList.contains('active'), '连续右键菜单保持打开');

    findItem(/合并为容器节点/).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(core.containerNodes.size, 1, '点菜单项应真的合并出容器');
    const frameId = [...core.containerNodes.keys()][0];
    assert.deepEqual(core.containerMembers(frameId), [String(a.id), String(b.id)], '选中的两个节点都进了容器');
    assert.ok(!menuContainer.classList.contains('active'), '点完菜单项收起菜单');
  });

  it('内容范围从标题栏下方开始：成员压到 header 时把框往上提，成员世界坐标不动', () => {
    const a = addNode('test', 100, 100);
    const frame = core.mergeToContainer([a.id]);
    frame.setRect(500, 400);
    core.containerNodes.get(String(frame.id)).rect = { w: 500, h: 400 };

    // 把成员摆到贴着框顶（jsdom 量不到 header → 退到常数 40，barrier = frame.y + 40 + 12）
    a.setPosition(Math.round(frame.x) + 20, Math.round(frame.y) + 5);
    const memberY = a.y;
    const frameY = frame.y;

    assert.equal(core._ensureHeaderSpace(String(frame.id)), true, '应把框往上提');
    assert.equal(a.y, memberY, '成员世界坐标不动');
    assert.ok(frame.y < frameY, '框往上长');
    assert.ok(a.y >= frame.y + 40 + 12, '成员落在标题barrier 下方');
    // 幂等：修好后再调不再动
    assert.equal(core._ensureHeaderSpace(String(frame.id)), false);
    assert.equal(frame.y, core.nodes.find((n) => String(n.id) === String(frame.id)).y);
  });

  it('已在容器内的节点不能和容器外的节点直接合并（不会凭空多出第二个容器）', () => {
    const notices = [];
    core.bus.on('status:message', (e) => notices.push(e.detail.text));

    const a = addNode('test', 100, 100);
    const b = addNode('test', 520, 320);
    const c = addNode('test', 900, 100);
    const frame = core.mergeToContainer([a.id, b.id]);
    assert.equal(core.containerNodes.size, 1);

    // 成员 + 外部节点 → 拒绝（这正是「出现两个容器节点」的来源）
    assert.equal(core.mergeToContainer([a.id, c.id]), null, '混合选中不合并');
    assert.equal(core.containerNodes.size, 1, '不会多出第二个容器');
    assert.deepEqual(core.containerMembers(frame.id), [String(a.id), String(b.id)], '原容器成员不变');
    assert.equal(core.containerMemberOf.has(String(c.id)), false, '外部节点没被抢走');
    assert.match(notices[notices.length - 1], /已在容器内/);

    // 全是成员 → 也拒绝（要嵌套先移出）
    assert.equal(core.mergeToContainer([a.id, b.id]), null);
    assert.match(notices[notices.length - 1], /已经在容器里/);
    assert.equal(core.containerNodes.size, 1);
  });

  it('加入选中节点：右键容器菜单可把外部节点放进容器（排到成员下方并撑大框）', () => {
    const a = addNode('test', 100, 100);
    const frame = core.mergeToContainer([a.id]);
    const c = addNode('test', 1200, 900); // 远在框外
    const frameId = String(frame.id);
    const notices = [];
    core.bus.on('status:message', (e) => notices.push(e.detail.text));

    c.setSelected(true);
    core.bus.emit('node:contextmenu', { nodeId: frameId, node: frame, position: { x: 5, y: 5 } });
    const menu = core.menuManager.menuContainer;
    const addItem = [...menu.querySelectorAll('.context-menu-item')].find((el) => /加入选中节点/.test(el.textContent));
    assert.ok(addItem, '容器菜单有「加入选中节点」');
    assert.match(addItem.textContent, /加入选中节点（1 个）/);

    addItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(core.containerMembers(frameId), [String(a.id), String(c.id)], '外部节点成为成员');
    assert.equal(core.containerMemberOf.get(String(c.id)), frameId);
    assert.match(notices[notices.length - 1], /加入 1 个节点/);

    // 不在框内的成员被摆进内容区：左对齐内容区、排在原成员下方
    assert.equal(c.x, Math.round(frame.x) + 12, '摆到内容区左侧');
    assert.ok(c.y > a.y, '排在已有成员下方');

    const view = core.nodeManager.nodeViews.get(String(c.id));
    assert.equal(view.element.querySelector('.node-member-tag').textContent, `↳ ${frame.title}`, '挂上归属浮标');
    assert.ok(!view.element.classList.contains('node-container-member-hidden'), '展开态可见');

    // 重复加入：已经在里面了 → 菜单不再给「加入选中节点」
    core.bus.emit('node:contextmenu', { nodeId: frameId, node: frame, position: { x: 5, y: 5 } });
    assert.ok(
        ![...menu.querySelectorAll('.context-menu-item')].some((el) => /加入选中节点/.test(el.textContent)),
        '成员已在容器里时不再提供加入项'
    );
    assert.equal(core.addToContainer(frameId, [c.id]), 0, '重复加入无效果');
  });

  it('拒绝加入：已属于别的容器的节点、以及容器的父级（会成环）', () => {
    const a = addNode('test', 100, 100);
    const b = addNode('test', 520, 320);
    const frameA = core.mergeToContainer([a.id]); // a 属于 A
    const frameB = core.mergeToContainer([b.id]); // b 属于 B
    const notices = [];
    core.bus.on('status:message', (e) => notices.push(e.detail.text));

    assert.equal(core.addToContainer(String(frameB.id), [a.id]), 0, '已在其它容器里 → 拒绝');
    assert.match(notices[notices.length - 1], /已在其它容器里/);
    assert.deepEqual(core.containerMembers(String(frameB.id)), [String(b.id)], '拒绝时一个都不加');

    // 把父容器塞进子容器 → 成环，拒绝
    assert.equal(core.addToContainer(String(frameA.id), [b.id]), 0);
    assert.equal(core.addToContainer(String(frameA.id), [String(frameA.id)]), 0, '不能把自己加进去');
  });

  it('从容器移出：成员右键移出后留在原地，容器还在、浮标摘掉', () => {
    const a = addNode('test', 100, 100);
    const b = addNode('test', 520, 320);
    const frame = core.mergeToContainer([a.id, b.id]);
    const frameId = String(frame.id);
    const aX = a.x;

    // 菜单项：成员不再提供「合并」，只给「从容器移出」
    core.bus.emit('node:contextmenu', { nodeId: String(a.id), node: a, position: { x: 5, y: 5 } });
    const menu = core.menuManager.menuContainer;
    const labels = [...menu.querySelectorAll('.context-menu-item')].map((el) => el.textContent);
    assert.ok(labels.some((t) => /从容器移出/.test(t)), '成员菜单有「从容器移出」');
    assert.ok(!labels.some((t) => /合并为容器节点/.test(t)), '成员菜单不再提供合并');
    assert.ok(menu.querySelector('.context-menu-note'), '并给出说明行');

    [...menu.querySelectorAll('.context-menu-item')]
        .find((el) => /从容器移出/.test(el.textContent))
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.deepEqual(core.containerMembers(frameId), [String(b.id)]);
    assert.equal(core.containerMemberOf.has(String(a.id)), false);
    assert.equal(a.x, aX, '节点留在原地');
    assert.equal(core.isContainer(frameId), true, '容器还在');
    const view = core.nodeManager.nodeViews.get(String(a.id));
    assert.equal(view.element.querySelector('.node-member-tag'), null, '浮标已摘掉');
    assert.equal(core.removeFromContainer(String(a.id)), false, '再移出一次无效');
  });
});
