import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import { computeFlowLayout, countEdgesAcrossCut } from '../../frontend/src/layout/flowLayout.js';

/**
 * 铺行布局（按引用方向左入右出）纯函数测试。
 *
 * 覆盖：
 *  - 连线一律指向右（拓扑顺序铺行）
 *  - 尽可能排在同一行：每行不超过上限，链条尽量不拆行
 *  - 换行点避开多分支（跨切口的连线最少）
 *  - 辅助节点不占行内位置：单宿主排到宿主**左侧的辅助列**（与宿主垂直居中、叠不下就加列）；
 *    多宿主收在行带上方左侧
 *  - 多连线节点抬高、孤立节点排在主图下方；环、自环、悬空连线不会崩
 *  - 不重叠（同节点之间）
 */

/** 造一个定尺寸节点 */
const node = (id, height = 200, aux = false) => ({ id, width: 300, height, aux });

/** 取节点坐标（缺失即断言失败） */
function posOf(layout, id) {
    const pos = layout.positions.get(id);
    assert.ok(pos, `节点 ${id} 应有坐标`);
    return pos;
}

/** 两两检查有没有重叠 */
function assertNoOverlap(layout, nodes) {
    const list = nodes.map((n) => ({ ...n, ...posOf(layout, n.id) }));
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
            assert.ok(!overlap, `${a.id} 与 ${b.id} 不应重叠`);
        }
    }
}

describe('computeFlowLayout（按引用方向铺行）', () => {
    it('连线一律指向右：每条边的目标都在源点右边', () => {
        const nodes = [node('a'), node('b'), node('c'), node('d')];
        const edges = [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
            { from: 'a', to: 'd' },
        ];
        const layout = computeFlowLayout(nodes, edges);
        edges.forEach((edge) => {
            assert.ok(
                posOf(layout, edge.to).x > posOf(layout, edge.from).x,
                `${edge.from}→${edge.to} 应指向右`
            );
        });
        assertNoOverlap(layout, nodes);
    });

    it('同一串引用尽量排在同一行（同一 y）', () => {
        const ids = ['a', 'b', 'c', 'd', 'e'];
        const nodes = ids.map((id) => node(id));
        const edges = [];
        for (let i = 0; i < ids.length - 1; i++) edges.push({ from: ids[i], to: ids[i + 1] });
        const layout = computeFlowLayout(nodes, edges, { rowLimit: 10 });
        const ys = ids.map((id) => posOf(layout, id).y);
        ys.forEach((y) => assert.equal(y, ys[0], '整条链应排在同一行'));
        assert.equal(layout.rows, 1);
    });

    it('每行不超过上限，超过就换行', () => {
        const nodes = [];
        const edges = [];
        for (let i = 0; i < 10; i++) nodes.push(node(`n${i}`));
        for (let i = 0; i < 9; i++) edges.push({ from: `n${i}`, to: `n${i + 1}` });
        const layout = computeFlowLayout(nodes, edges, { rowLimit: 4 });
        assert.equal(layout.columns, 4, '最宽一行应正好是上限');
        assert.equal(layout.rows, 3, '10 个节点按 4 个一行应排 3 行');
    });

    it('换行点避开多分支：一个节点的后继不会被拆到两行', () => {
        // hub 有 4 个后继，行上限 5 → 若切在后继中间就会跨 3 条边，应该整体挪到下一行
        const nodes = [node('hub')];
        const edges = [];
        for (let i = 0; i < 4; i++) {
            nodes.push(node(`s${i}`));
            edges.push({ from: 'hub', to: `s${i}` });
        }
        const layout = computeFlowLayout(nodes, edges, { rowLimit: 5 });
        const hubY = posOf(layout, 'hub').y;
        const successorRows = [0, 1, 2, 3].map((i) => (posOf(layout, `s${i}`).y === hubY ? 0 : 1));
        const distinct = new Set(successorRows);
        assert.equal(distinct.size, 1, '四个后继应落在同一行');
    });

    it('countEdgesAcrossCut 能数出跨切口的连线', () => {
        const order = ['a', 'b', 'c'];
        const edges = [
            { from: 'a', to: 'c' },
            { from: 'b', to: 'c' },
        ];
        assert.equal(countEdgesAcrossCut(order, edges, 1), 1); // 只有 a→c 跨过 1
        assert.equal(countEdgesAcrossCut(order, edges, 2), 2); // 两条都跨过 2
        assert.equal(countEdgesAcrossCut(order, edges, 0), 0);
    });

    it('辅助节点（单宿主）排在宿主左侧的辅助列，与宿主垂直居中', () => {
        const nodes = [node('host', 400), node('text', 300, true)];
        const edges = [{ from: 'text', to: 'host' }];
        const layout = computeFlowLayout(nodes, edges, { rowLimit: 24 });
        const host = posOf(layout, 'host');
        const text = posOf(layout, 'text');
        assert.ok(text.x < host.x, '辅助节点应在宿主左侧');
        assert.ok(Math.abs(text.x + 300 - host.x) <= 60, '右边缘应贴近宿主左边缘（线短且指向右）');
        assert.equal(text.y, host.y + 50, '应与宿主垂直居中（(400-300)/2）');
        assert.equal(layout.columns, 1, '辅助节点不该占行内位置');
        assert.equal(layout.rows, 1, '宿主与辅助节点同属一行带');
    });

    it('一个宿主的多个辅助节点按数量分列（叠不下就往左再加一列）', () => {
        const nodes = [node('host', 400), node('t1', 300, true), node('t2', 300, true)];
        const edges = [
            { from: 't1', to: 'host' },
            { from: 't2', to: 'host' },
        ];
        const layout = computeFlowLayout(nodes, edges);
        const t1 = posOf(layout, 't1');
        const t2 = posOf(layout, 't2');
        assert.equal(t1.y, t2.y, '都应与宿主垂直居中（同一高度）');
        assert.ok(Math.abs(t2.x - t1.x) >= 300, '叠不下时应当分属不同列');
        assert.ok(t1.x < posOf(layout, 'host').x && t2.x < posOf(layout, 'host').x, '都在宿主左侧');
    });

    it('辅助节点多到叠不下时，同一列里上下叠放', () => {
        const nodes = [node('host', 1200), node('a', 300, true), node('b', 300, true)];
        const edges = [
            { from: 'a', to: 'host' },
            { from: 'b', to: 'host' },
        ];
        const layout = computeFlowLayout(nodes, edges);
        const a = posOf(layout, 'a');
        const b = posOf(layout, 'b');
        assert.equal(a.x, b.x, '宿主够高时两个辅助节点叠在同一列');
        assert.ok(Math.abs(b.y - a.y) >= 300, '同一列里上下分开，不重叠');
    });

    it('多连线的节点会被抬高（方便看清它那一串线）', () => {
        const nodes = [node('plain', 400)];
        const edges = [];
        // plain 只有 0 条线；hub 连出 5 条线
        nodes.push(node('hub', 400));
        for (let i = 0; i < 5; i++) {
            nodes.push(node(`s${i}`, 400));
            edges.push({ from: 'hub', to: `s${i}` });
        }
        const layout = computeFlowLayout(nodes, edges, { rowLimit: 24 });
        assert.ok(posOf(layout, 'hub').y < posOf(layout, 'plain').y, '连线多的节点应比普通节点高');
        for (let i = 0; i < 5; i++) {
            assert.ok(posOf(layout, `s${i}`).x > posOf(layout, 'hub').x, '后继仍在右侧');
        }
    });

    it('辅助节点（多宿主）收在行带上方左侧', () => {
        const nodes = [node('h1', 300), node('h2', 300), node('shared', 200, true)];
        const edges = [
            { from: 'shared', to: 'h1' },
            { from: 'shared', to: 'h2' },
        ];
        const layout = computeFlowLayout(nodes, edges);
        const shared = posOf(layout, 'shared');
        const h1 = posOf(layout, 'h1');
        const h2 = posOf(layout, 'h2');
        assert.ok(shared.y < Math.min(h1.y, h2.y), '应排在宿主上方');
        assert.ok(shared.x < Math.min(h1.x, h2.x), '应排在最左宿主左侧');
    });

    it('孤立节点排在主图下方且不与主图重叠', () => {
        const nodes = [node('a'), node('b'), node('solo1'), node('solo2')];
        const layout = computeFlowLayout(nodes, [{ from: 'a', to: 'b' }]);
        const mainBottom = Math.max(posOf(layout, 'a').y + 200, posOf(layout, 'b').y + 200);
        ['solo1', 'solo2'].forEach((id) => {
            assert.ok(posOf(layout, id).y >= mainBottom, `${id} 应在主图下方`);
        });
        assertNoOverlap(layout, nodes);
    });

    it('互相引用（环）不死循环，坐标有限', () => {
        const layout = computeFlowLayout([node('a'), node('b')], [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'a' },
        ]);
        [posOf(layout, 'a'), posOf(layout, 'b')].forEach((pos) => {
            assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y));
        });
    });

    it('忽略自环与端点不存在的连线', () => {
        const layout = computeFlowLayout(
            [node('a')],
            [
                { from: 'a', to: 'a' },
                { from: 'a', to: '不在图里的节点' },
                { from: null, to: 'a' },
            ]
        );
        assert.equal(layout.rows, 0);
        assert.ok(Number.isFinite(posOf(layout, 'a').x));
    });

    it('平移到原点之外时整体随之偏移（origin 生效）', () => {
        const nodes = [node('a'), node('b')];
        const edges = [{ from: 'a', to: 'b' }];
        const base = computeFlowLayout(nodes, edges);
        const shifted = computeFlowLayout(nodes, edges, { originX: 1000, originY: -500 });
        assert.equal(posOf(shifted, 'a').x - posOf(base, 'a').x, 1000);
        assert.equal(posOf(shifted, 'a').y - posOf(base, 'a').y, -500);
    });

    it('bounds 覆盖全部节点', () => {
        const nodes = [node('a'), node('b'), node('solo')];
        const layout = computeFlowLayout(nodes, [{ from: 'a', to: 'b' }]);
        nodes.forEach((n) => {
            const pos = posOf(layout, n.id);
            assert.ok(pos.x >= layout.bounds.minX && pos.x + n.width <= layout.bounds.maxX);
            assert.ok(pos.y >= layout.bounds.minY && pos.y + n.height <= layout.bounds.maxY);
        });
    });

    it('空输入返回空结果（不抛错）', () => {
        const layout = computeFlowLayout([], []);
        assert.equal(layout.positions.size, 0);
        assert.equal(layout.rows, 0);
        assert.equal(layout.columns, 0);
    });

    it('缺尺寸信息时用兜底尺寸（不产生 NaN）', () => {
        const layout = computeFlowLayout([{ id: 'a' }, { id: 'b' }], [{ from: 'a', to: 'b' }]);
        [posOf(layout, 'a'), posOf(layout, 'b')].forEach((pos) => {
            assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y));
        });
    });

    it('行宽设置生效：默认 24 个一行', () => {
        const nodes = [];
        const edges = [];
        for (let i = 0; i < 30; i++) nodes.push(node(`n${i}`));
        for (let i = 0; i < 29; i++) edges.push({ from: `n${i}`, to: `n${i + 1}` });
        const layout = computeFlowLayout(nodes, edges);
        assert.equal(layout.columns, 24);
        assert.equal(layout.rows, 2);
    });
});
