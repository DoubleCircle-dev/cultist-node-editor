import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import { createCore, destroyCore, window } from './helpers/env.mjs';
import { NodeSearchBox } from '../../frontend/src/views/nodeSearchBox.js';

/**
 * 预览模式右上角「搜索节点」框（NodeSearchBox）+ 定位（ControllerCore.focusNode）。
 *
 * 覆盖：
 *  - 关键字匹配 title / id / label（大小写不敏感、支持 `#id` 写法）
 *  - 键盘上下选择、回车定位、Esc 收起
 *  - 点选结果条 → onPick 回调 → focusNode 真正定位并高亮该节点
 */

const { document } = window;

/** @type {any[]} */
const SAMPLE = [
    { id: '11', uid: 11, title: 'Recipes', label: '配方表', type: 'recipe' },
    { id: '12', uid: 12, title: '天气结果', label: 'weather', type: 'text' },
    { id: '13', uid: 13, title: 'Unnamed', label: '', type: 'table' },
];

function mountBox(options = {}) {
    const box = new NodeSearchBox({ getNodes: () => SAMPLE, onPick: () => {}, ...options });
    box.mount(document.body);
    return box;
}

/** 输入关键字并触发 input 事件 */
function type(box, keyword) {
    box.input.value = keyword;
    box.input.dispatchEvent(new window.Event('input'));
}

/** 取结果条标题文本 */
function resultTitles(box) {
    return [...box.resultsEl.querySelectorAll('.node-search-item-title')].map((el) => el.textContent);
}

describe('预览模式搜索节点框（NodeSearchBox）', () => {
    let box;

    beforeEach(() => {
        document.body.innerHTML = '';
        box = null;
    });

    afterEach(() => {
        if (box) box.destroy();
    });

    it('挂载后带输入框，结果列表初始收起', () => {
        box = mountBox();
        assert.ok(document.body.querySelector('.node-search'));
        assert.ok(box.resultsEl.classList.contains('hidden'), '未输入关键字时不应展示结果');
    });

    it('按 title 匹配（大小写不敏感）', () => {
        box = mountBox();
        type(box, 'recipes');
        assert.deepEqual(resultTitles(box), ['Recipes']);
    });

    it('按 id 匹配，且支持 `#id` 写法', () => {
        box = mountBox();
        type(box, '12');
        assert.deepEqual(resultTitles(box), ['天气结果']);

        type(box, '#13');
        assert.deepEqual(resultTitles(box), ['Unnamed']);
    });

    it('按 label 匹配', () => {
        box = mountBox();
        type(box, 'weather');
        assert.deepEqual(resultTitles(box), ['天气结果']);
    });

    it('无匹配时给出空提示', () => {
        box = mountBox();
        type(box, '不存在的关键字');
        assert.equal(resultTitles(box).length, 0);
        assert.equal(box.resultsEl.querySelector('.node-search-empty')?.textContent, '没有匹配的节点');
    });

    it('↓ 键移动高亮项，回车选中该项', () => {
        const picked = [];
        box = mountBox({ onPick: (node) => picked.push(node) });
        type(box, 'r'); // recipes / weather 都含 r

        assert.equal(box.resultsEl.querySelectorAll('.node-search-item').length, 2);
        box.input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
        box.input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));

        assert.equal(picked.length, 1);
        assert.equal(picked[0].id, '12', '应选中第二项（天气结果）');
    });

    it('Esc 收起结果列表', () => {
        box = mountBox();
        type(box, 'recipes');
        assert.ok(!box.resultsEl.classList.contains('hidden'));

        box.input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
        assert.ok(box.resultsEl.classList.contains('hidden'));
    });

    it('destroy 移除 DOM 与全局监听', () => {
        box = mountBox();
        box.destroy();
        assert.equal(document.body.querySelector('.node-search'), null);
        box = null;
    });
});

describe('定位节点（ControllerCore.focusNode）', () => {
    let core;

    beforeEach(async () => {
        ({ core } = await createCore());
    });

    afterEach(() => {
        destroyCore(core);
    });

    it('按 id 与 uid 都能定位，并选中 + 闪烁', () => {
        core.nodeManager.addNode('number', 100, 100);
        const node = core.nodeManager.getNode('1');
        node.setPosition(2000, 3000);

        assert.equal(core.focusNode('1'), true, '按内部 id 应能定位');
        assert.equal(node.selected, true, '定位后应选中该节点');

        node.setSelected(false);
        assert.equal(core.focusNode(node.uid), true, '按 uid 也应能定位');

        const view = core.nodeManager.nodeViews.get(String(node.id));
        assert.ok(view.element.classList.contains('found-flash'), '定位后节点应有闪烁提示');
    });

    it('找不到的 id 返回 false 且不改动选择', () => {
        core.nodeManager.addNode('number', 100, 100);
        assert.equal(core.focusNode('不存在'), false);
        assert.equal(core.focusNode(null), false);
        assert.equal(core.nodes.filter((n) => n.selected).length, 0);
    });

    it('定位会居中：节点中心被移到视口中心', () => {
        core.nodeManager.addNode('number', 100, 100);
        const node = core.nodeManager.getNode('1');
        node.setPosition(2000, 3000);
        node.setRect(300, 240);

        core.focusNode('1');

        const scale = core.canvasManager.transform.scale;
        const viewportW = core.canvasManager.viewport.clientWidth;
        const viewportH = core.canvasManager.viewport.clientHeight;
        const expectedX = viewportW / 2 - (node.x + node.width / 2) * scale;
        const expectedY = viewportH / 2 - (node.y + node.height / 2) * scale;
        assert.ok(Math.abs(core.canvasManager.transform.x - expectedX) < 0.001, '平移量应把节点中心对齐视口中心');
        assert.ok(Math.abs(core.canvasManager.transform.y - expectedY) < 0.001, '纵向同样对齐视口中心');
    });

    it('侧边栏「查找节点」面板发出的 findNode 事件被接住', () => {
        core.nodeManager.addNode('number', 100, 100);
        const node = core.nodeManager.getNode('1');

        core.bus.emit('findNode', { type: 'number', id: node.id, path: '' });

        assert.equal(node.selected, true, 'findNode 事件应触发定位（此前无人监听）');
    });
});
