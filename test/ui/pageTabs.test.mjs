import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore, window } from './helpers/env.mjs';
import { TabBar } from '../../frontend/src/views/tabBar.js';

/**
 * 页面（工作区选项卡）测试。
 *
 * 覆盖两层：
 *  - PageManager：切换（无损：模型/连线/属性原样保留，另一页的 DOM 停在停放容器里）、
 *    新建 / 关闭（最后一页只清空）/ 改名 / 排序、快照 → 导入、localStorage 持久化
 *  - TabBar：tab 渲染与激活态、点击切换、✕ / 中键关闭（非空先确认）、双击改名、
 *    拖拽排序、「＋ / 页面管理」浮层（逐页存文件）
 */

const { document } = window;

/** 节点 DOM 是否挂在画布世界层（而不是停在页面停放容器里） */
function isMounted(core, id) {
    const view = core.nodeManager.nodeViews.get(String(id));
    return !!(view && view.element && view.element.parentElement === core.world);
}

/** 画布上直接挂着的节点 DOM 数量 */
function mountedNodeCount(core) {
    return Array.from(core.world.children).filter((el) => el.classList.contains('node')).length;
}

/** 造一对可连的节点并连起来（'1'=数字变量有输出端口，'2'=test 节点有输入端口） */
function buildLinkedPair(core) {
    core.nodeManager.addNode('number', 100, 100);
    core.nodeManager.addNode('test', 300, 100);

    const source = core.nodeManager.getNode('1');
    const target = core.nodeManager.getNode('2');
    const output = source.detailProperties.find((prop) => prop.outputPort);
    const input = target.detailProperties.find((prop) => prop.name === 'testRange');
    assert.ok(output?.outputPort && input?.inputPort, '测试节点应具备可连的端口');

    const connection = core.connectionManager.createProgrammaticConnection(
        source,
        output.outputPort,
        target,
        input.inputPort
    );
    assert.ok(connection, '应能建立程序化连线');
    return { source, target };
}

/** 取一个可写值的属性（按钮类除外） */
function writableProp(model) {
    return model.detailProperties.find((prop) => prop.type !== 'button');
}

describe('页面（工作区选项卡）· PageManager', () => {
    let core;

    beforeEach(async () => {
        window.localStorage.clear();
        ({ core } = await createCore());
    });

    afterEach(() => {
        destroyCore(core);
        core = null;
        window.localStorage.clear();
    });

    it('初始只有一个已激活的空页面', () => {
        const pm = core.pageManager;
        assert.deepEqual(pm.order, ['page_1']);
        assert.equal(pm.activeId, 'page_1');
        assert.equal(pm.activePage.name, '未命名-1');
        assert.equal(pm.activePage.isEmpty, true);
    });

    it('新建页面：原页内容被停放，切回后原样回来（同一批模型对象）', () => {
        const pm = core.pageManager;
        core.nodeManager.addNode('test', 100, 100);
        const first = pm.activePage;
        const model = core.nodeManager.getNode('1');
        assert.equal(isMounted(core, 1), true);

        const second = pm.createPage('第二页');
        assert.equal(pm.activePage, second);
        assert.equal(pm.order.length, 2);
        assert.equal(core.nodes.length, 0, '新页面应是空的');
        assert.equal(mountedNodeCount(core), 0, '画布上不应残留上一页的节点');
        assert.equal(first.nodeCount, 1, '被停放的页面仍记得自己的节点数');
        assert.ok(first.parking && first.parking.hidden, '应生成停放容器');
        assert.equal(first.parking.querySelectorAll('.node').length, 1);

        assert.equal(pm.switchTo(first.id), true);
        assert.equal(core.nodes.length, 1);
        assert.equal(core.nodes[0], model, '切回后应是同一个模型对象（无损切换）');
        assert.equal(isMounted(core, 1), true);
        assert.equal(second.nodeCount, 0);
    });

    it('两页的节点与连线各自独立，id 不撞号', () => {
        const pm = core.pageManager;
        const first = pm.activePage;
        buildLinkedPair(core);
        assert.equal(core.connectionManager.connections.size, 1);

        pm.createPage('第二页');
        assert.equal(core.connectionManager.connections.size, 0, '新页面不应带上别页的连线');
        assert.equal(mountedNodeCount(core), 0);

        core.nodeManager.addNode('blank', 10, 10);
        assert.equal(core.nodeManager.nodes.keys().next().value, '3', 'id 生成器跨页面唯一');

        pm.switchTo(first.id);
        assert.equal(core.nodes.length, 2);
        assert.equal(core.connectionManager.connections.size, 1);
        assert.equal(core.connectionManager.connectionLines.size, 1);
        assert.equal(first.parking.querySelectorAll('path').length, 0, '切回后连线应搬回画布 SVG 层');
    });

    it('关闭非激活页：直接移除（含停放容器），激活页不变', () => {
        const pm = core.pageManager;
        const first = pm.activePage;
        core.nodeManager.addNode('test', 0, 0);
        const second = pm.createPage('第二页');

        assert.equal(pm.closePage(first.id), true);
        assert.deepEqual(pm.order, [second.id]);
        assert.equal(pm.activePage, second);
        assert.equal(pm.getPage(first.id), null);
        assert.equal(core.world.querySelectorAll('.page-parking').length, 0, '停放容器应随页面一起移除');
    });

    it('关闭激活页：自动切到相邻页', () => {
        const pm = core.pageManager;
        const first = pm.activePage;
        const second = pm.createPage('第二页');
        const third = pm.createPage('第三页');
        assert.equal(pm.activeId, third.id);

        assert.equal(pm.closePage(third.id), true);
        assert.equal(pm.activePage, second, '应回落到相邻页而不是空无页面');
        assert.deepEqual(pm.order, [first.id, second.id]);
        assert.equal(core.nodes.length, 0);
    });

    it('最后一个页面不会被删掉：关闭等于清空内容', () => {
        const pm = core.pageManager;
        core.nodeManager.addNode('test', 0, 0);

        assert.equal(pm.closePage(pm.activeId), false, '返回值说明只是清了内容');
        assert.deepEqual(pm.order, ['page_1']);
        assert.equal(core.nodes.length, 0);
        assert.equal(pm.activePage.nodeCount, 0);
    });

    it('改名与排序', () => {
        const pm = core.pageManager;
        assert.equal(pm.renamePage('page_1', '  第一章  '), true);
        assert.equal(pm.getPage('page_1').name, '第一章', '名字要去掉首尾空白');
        assert.equal(pm.renamePage('page_1', '第一章'), false, '名字没变不算改动');
        assert.equal(pm.renamePage('page_1', '   '), false, '空名字不接受');

        const b = pm.createPage('b');
        const c = pm.createPage('c');
        assert.equal(pm.movePage(c.id, 0), true);
        assert.deepEqual(pm.order, [c.id, 'page_1', b.id]);
        assert.equal(pm.movePage(c.id, 0), false, '位置没变不算改动');
    });

    it('快照 → 导入：页面、节点属性、标题与连线都回来', async () => {
        const pm = core.pageManager;
        buildLinkedPair(core);
        const source = core.nodeManager.getNode('1');
        source.title = '快照标题';
        source.label = '快照标签';
        core.pageManager.renamePage(pm.activeId, '第一章');
        const prop = writableProp(source);
        const propKey = prop.id.slice(String(source.id).length);
        assert.ok(propKey, '应能取到属性稳定键');
        prop.value = '快照值';

        const doc = pm.snapshot();
        assert.equal(doc.pages.length, 1);
        assert.equal(doc.pages[0].nodes.length, 2);
        assert.equal(doc.pages[0].connections.length, 1);

        const { core: core2 } = await createCore();
        try {
            const stats = core2.pageManager.importDocument(doc);
            assert.deepEqual(stats, { pages: 1, nodes: 2, connections: 1 });
            assert.deepEqual(core2.pageManager.order, ['page_1']);
            assert.equal(core2.pageManager.activePage.name, '第一章');

            const restored = core2.nodeManager.getNode('1');
            assert.equal(restored.title, '快照标题');
            assert.equal(restored.label, '快照标签');
            assert.equal(restored.detailProperties.find((p) => p.id === String(restored.id) + propKey).value, '快照值');
            assert.equal(core2.nodeManager.getNode('2').type, 'test');
            assert.equal(core2.connectionManager.connections.size, 1);
            assert.equal(core2.connectionManager.connectionLines.size, 1, '连线 DOM 也应重建');
        } finally {
            destroyCore(core2);
        }
    });

    it('导入兼容旧格式（{ nodes, connections }）并整体替换现有页面', async () => {
        const pm = core.pageManager;
        core.nodeManager.addNode('test', 0, 0);
        const legacy = { nodes: [{ id: 7, uid: 7, type: 'blank', x: 5, y: 6 }], connections: [] };

        const stats = pm.importDocument(legacy);
        assert.deepEqual(stats, { pages: 1, nodes: 1, connections: 0 });
        assert.deepEqual(pm.order, ['page_1'], '导入是整体替换');
        assert.equal(core.nodes.length, 1);
        assert.equal(core.nodeManager.getNode('7').type, 'blank');
    });

    it('开启持久化：内容写进 localStorage，新核心能恢复', async () => {
        const pm = core.pageManager;
        pm.enablePersistence();
        core.nodeManager.addNode('test', 10, 10);
        pm.renamePage('page_1', '第一章');
        pm.createPage('第二页');
        core.nodeManager.addNode('blank', 5, 5);

        assert.equal(pm.save(), true);
        assert.ok(window.localStorage.getItem('nodeEditor.pages'), '应写进 localStorage');

        const { core: core2 } = await createCore();
        try {
            core2.pageManager.enablePersistence();
            assert.deepEqual(core2.pageManager.order, ['page_1', 'page_2']);
            assert.deepEqual(
                core2.pageManager.pageList.map((page) => page.name),
                ['第一章', '第二页']
            );
            assert.equal(core2.pageManager.getPage('page_1').nodeCount, 1);
            assert.equal(core2.pageManager.getPage('page_2').nodeCount, 1);
            assert.equal(core2.pageManager.activePage.id, 'page_2', '激活页也要记住');
        } finally {
            destroyCore(core2);
        }
    });

    it('未开启持久化时不碰 localStorage', () => {
        core.nodeManager.addNode('test', 0, 0);
        assert.equal(core.pageManager.save(), false);
        assert.equal(window.localStorage.getItem('nodeEditor.pages'), null);
    });

    it('pageForImport：空页直接用（顺手按来源改名），非空页另开一页，同名页切回去', () => {
        const pm = core.pageManager;
        const first = pm.pageForImport('Mod:甲');
        assert.equal(first, pm.activePage, '空页面直接用来铺图');
        assert.equal(first.name, 'Mod:甲', '空的默认页应改成数据来源的名字');

        core.nodeManager.addNode('test', 0, 0);
        const second = pm.pageForImport('Mod:乙');
        assert.notEqual(second, first);
        assert.equal(second.name, 'Mod:乙');
        assert.equal(pm.order.length, 2);

        core.nodeManager.addNode('test', 0, 0);
        const again = pm.pageForImport('Mod:甲');
        assert.equal(again, first, '同名页面应切回去而不是再开一个');
        assert.equal(pm.order.length, 2);
        assert.equal(pm.activeId, first.id);
    });
});

describe('页面（工作区选项卡）· TabBar', () => {
    let core;
    let bar;

    beforeEach(async () => {
        window.localStorage.clear();
        ({ core } = await createCore());
        bar = null;
    });

    afterEach(() => {
        if (bar) bar.destroy();
        bar = null;
        destroyCore(core);
        core = null;
        window.localStorage.clear();
    });

    /**
     * @param {any} [options]
     * @returns {TabBar}
     */
    function mount(options = {}) {
        bar = new TabBar({ pageManager: core.pageManager, confirm: () => true, ...options });
        return bar;
    }

    /** @param {string} id @returns {HTMLElement} */
    function tabOf(id) {
        const tab = document.querySelector(`.page-tab[data-page-id="${id}"]`);
        assert.ok(tab, `应存在页面 ${id} 的 tab`);
        return /** @type {HTMLElement} */ (tab);
    }

    /** 派发一个带坐标的鼠标事件（拖拽需要 clientX 判断落点） */
    function mouse(el, type, clientX = 0) {
        el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
    }

    it('渲染页面 tab 与右侧按钮区', () => {
        mount();
        assert.equal(document.querySelectorAll('#pageTabsList .page-tab').length, 1);
        assert.equal(tabOf('page_1').classList.contains('active'), true);
        assert.ok(document.querySelector('.tabs-actions .tabs-add'), '应有「＋」新建按钮');
        assert.ok(document.querySelector('.tabs-actions .page-manager-btn'), '应有「页面管理」按钮');
    });

    it('「＋」新建页面并切过去', () => {
        mount();
        /** @type {HTMLElement} */ (document.querySelector('.tabs-add')).click();
        assert.equal(core.pageManager.order.length, 2);
        assert.equal(core.pageManager.activeId, 'page_2');
        assert.equal(document.querySelectorAll('#pageTabsList .page-tab').length, 2);
        assert.equal(tabOf('page_2').classList.contains('active'), true);
        assert.equal(tabOf('page_1').classList.contains('active'), false);
    });

    it('点击 tab 切换页面', () => {
        mount();
        core.pageManager.createPage('第二页');
        mouse(tabOf('page_1'), 'click');
        assert.equal(core.pageManager.activeId, 'page_1');
        assert.equal(tabOf('page_1').classList.contains('active'), true);
    });

    it('点 ✕ 关闭空页面（不弹确认），中键同样能关', () => {
        let confirmed = 0;
        mount({ confirm: () => { confirmed++; return true; } });
        core.pageManager.createPage('第二页');

        /** @type {HTMLElement} */ (tabOf('page_2').querySelector('.tab-close')).click();
        assert.deepEqual(core.pageManager.order, ['page_1']);
        assert.equal(confirmed, 0, '空页面不该弹确认');

        core.pageManager.createPage('第三页');
        tabOf('page_3').dispatchEvent(new window.MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
        assert.deepEqual(core.pageManager.order, ['page_1']);
    });

    it('内容非空的页面关闭前要确认，取消则不关', () => {
        mount({ confirm: () => false });
        core.nodeManager.addNode('test', 0, 0);
        core.pageManager.createPage('第二页');
        core.nodeManager.addNode('test', 0, 0);

        /** @type {HTMLElement} */ (tabOf('page_2').querySelector('.tab-close')).click();
        assert.equal(core.pageManager.order.length, 2, '用户取消时不应关闭');

        bar.confirm = () => true;
        /** @type {HTMLElement} */ (tabOf('page_2').querySelector('.tab-close')).click();
        assert.deepEqual(core.pageManager.order, ['page_1']);
    });

    it('双击 tab 就地改名（回车提交，Esc 取消）', () => {
        mount();
        mouse(tabOf('page_1'), 'dblclick');
        const input = /** @type {HTMLInputElement} */ (tabOf('page_1').querySelector('.tab-rename-input'));
        assert.ok(input, '双击后应出现改名输入框');

        input.value = '第一章';
        input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(core.pageManager.getPage('page_1').name, '未命名-1', 'Esc 应放弃改名');

        mouse(tabOf('page_1'), 'dblclick');
        const again = /** @type {HTMLInputElement} */ (tabOf('page_1').querySelector('.tab-rename-input'));
        again.value = '第一章';
        again.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        assert.equal(core.pageManager.getPage('page_1').name, '第一章');
        assert.equal(tabOf('page_1').querySelector('.tab-name').textContent, '第一章');
        assert.equal(tabOf('page_1').querySelector('.tab-rename-input'), null);
    });

    it('拖拽 tab 调整页面顺序', () => {
        mount();
        core.pageManager.createPage('b');
        core.pageManager.createPage('c');

        tabOf('page_3').dispatchEvent(new window.Event('dragstart', { bubbles: true, cancelable: true }));
        // jsdom 没有布局（getBoundingClientRect 全 0）→ clientX 0 落在左半边，10 落在右半边
        mouse(tabOf('page_1'), 'dragover', 0); // 落在 page_1 左半边 → 插到它前面
        assert.equal(tabOf('page_1').classList.contains('drop-before'), true);
        mouse(tabOf('page_1'), 'drop', 0);

        assert.deepEqual(core.pageManager.order, ['page_3', 'page_1', 'page_2']);
        assert.equal(document.querySelectorAll('.page-tab.dragging, .page-tab.drop-before').length, 0, '拖拽标记要清掉');
    });

    it('「页面管理」浮层：列页面、逐页存文件、新建与关闭', () => {
        /** @type {string[]} */
        const saved = [];
        mount({ onSavePage: (pageId) => saved.push(pageId), confirm: () => true });
        core.nodeManager.addNode('test', 0, 0);

        /** @type {HTMLElement} */ (document.querySelector('.page-manager-btn')).click();
        const panel = document.querySelector('.page-manager-panel');
        assert.ok(panel, '应打开页面管理浮层');
        assert.equal(panel.querySelectorAll('.page-item').length, 1);
        assert.equal(panel.querySelector('.page-item-meta').textContent, '1 节点 / 0 连线');

        // 逐页保存：交给外部注入的回调（宿主保存对话框 / 浏览器下载）
        /** @type {HTMLElement} */ (panel.querySelector('.page-item-btn[data-act="save"]')).click();
        assert.deepEqual(saved, ['page_1']);

        // 新建页面
        /** @type {HTMLElement} */ (panel.querySelector('[data-act="new"]')).click();
        assert.equal(core.pageManager.order.length, 2);
        assert.equal(panel.querySelectorAll('.page-item').length, 2);

        // 「保存全部」走 onSaveAll
        let savedAll = 0;
        bar.onSaveAll = () => { savedAll++; };
        /** @type {HTMLElement} */ (panel.querySelector('[data-act="save-all"]')).click();
        assert.equal(savedAll, 1);

        // 关掉浮层
        /** @type {HTMLElement} */ (panel.querySelector('.close-panel')).click();
        assert.equal(panel.classList.contains('hidden'), true);
    });

    it('destroy 后不再订阅页面变化', () => {
        mount();
        bar.destroy();
        bar = null;
        core.pageManager.createPage('第二页');
        assert.equal(document.querySelectorAll('#pageTabsList .page-tab').length, 0, 'tab 列表应清空');
        assert.equal(document.querySelector('.tabs-actions'), null, '自己建的按钮区应移除');
    });
});
