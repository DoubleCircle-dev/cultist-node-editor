/**
 * frontend/src/layout/flowLayout.js —— 按引用方向铺行的自动布局（左入右出 · 像文字换行一样）
 *
 * 目标：
 * 1. **主流程向右读**：节点按引用顺序从左到右铺，行内每条连线都从输出的右边指向输入的左边；
 *    铺行用的是拓扑顺序，所以任何一条边都不会指向左（环里的回边除外）。
 * 2. **尽可能排在同一行**：每行最多 `rowLimit` 个节点（默认 24，可在设置里改），铺满才换行；
 *    换行点会避开「多条边同时跨过切口」的位置（多分支处不切断），减少线横穿行间。
 * 3. **主次分明**：辅助节点（长文本外化出的文本变量、表格预览等）不占行内位置 ——
 *    只服务一个宿主的贴在宿主正下方；服务多个宿主的收在所在行带的上方左侧，方便看清扇出。
 *
 * 顺序怎么来：
 * - 先用「分层 + 重心排序 + 贪心换序」得到一条与连线尽量一致的次序，当作后继的访问优先级；
 * - 再按拓扑顺序铺行（入边都已放置的节点才可入行），并优先紧接上一个节点的后继 ——
 *   同一串引用连着的节点在行里相邻，线短。
 *
 * 孤立节点（无任何连线）不参与铺行，按网格排在主图下方。
 * 纯函数：不读 DOM，返回 id → {x, y}，便于单测。
 */

/** 默认参数 */
const DEFAULTS = {
    originX: 0,
    originY: 0,
    /** 行内水平间距（前一个节点右边界到下一个节点左边界的空白） */
    gapX: 120,
    /** 行带之间的纵向间距 */
    rowGap: 240,
    /** 一行最多放几个节点（超出换行） */
    rowLimit: 24,
    /** 辅助节点与宿主的间距（也用于同一列内两个辅助节点之间） */
    helperGap: 40,
    /** 辅助列与列之间的水平间距 */
    helperColGap: 40,
    /** 多少条连线算「多连线」节点（达到就开始抬高，方便看清它那一串线） */
    hubMinDegree: 3,
    /** 每多一条连线额外抬高多少像素 */
    hubLiftPerEdge: 40,
    /** 抬高上限 */
    hubMaxLift: 400,
    /** 拿不到节点尺寸时的兜底值（节点 CSS 固定宽 300px） */
    defaultWidth: 300,
    defaultHeight: 240,
    /** 重心法往返轮数（正反交替，最后一轮为正向，保证左→右的阅读顺序占优） */
    barycenterPasses: 8,
    /** 贪心换序轮数（以实际交叉数为目标做局部改进，0 = 关闭） */
    refineSweeps: 8,
    /** 孤立节点网格的列数上限 */
    isolatedColumns: 6,
    /** 孤立节点网格的纵向间距 */
    isolatedGapY: 60,
};

/**
 * 计算「铺行」布局坐标
 *
 * @param {Array<{ id: string | number, width?: number, height?: number, aux?: boolean }>} nodes -
 *   待布局节点；`aux: true` 表示辅助节点（不占行内位置，贴到宿主旁边）
 * @param {Array<{ from: string | number, to: string | number }>} edges - 连线方向：from 的输出端口 → to 的输入端口
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {{
 *   positions: Map<string, { x: number, y: number }>,
 *   bounds: { minX: number, minY: number, maxX: number, maxY: number },
 *   rows: number,
 *   columns: number,
 *   layers: number,
 * }} 坐标表（未传入的 id 不会出现）、整体包围盒、行数、最宽行节点数、层数
 */
export function computeFlowLayout(nodes, edges, options = {}) {
    const opts = { ...DEFAULTS };
    Object.keys(options || {}).forEach((key) => {
        if (options[key] != null) opts[key] = options[key];
    });

    const list = normalizeNodes(nodes, opts);
    const empty = {
        positions: new Map(),
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        rows: 0,
        columns: 0,
        layers: 0,
    };
    if (!list.length) return empty;

    const { succ, pred, isolated } = buildAdjacency(list, edges);
    const byId = new Map(list.map((node) => [node.id, node]));
    const isolatedIds = new Set(isolated.map((node) => node.id));

    /** 辅助节点：贴宿主摆放，不参与铺行 */
    const helperIds = new Set(
        list
            .filter((node) => node.aux && !isolatedIds.has(node.id) && (succ.get(node.id) || []).length)
            .map((node) => node.id)
    );
    const flow = list.filter((node) => !helperIds.has(node.id) && !isolatedIds.has(node.id));
    const flowIds = new Set(flow.map((node) => node.id));

    // 1) 分层 + 排序：只为得到「后继访问优先级」（rank）
    const layerOf = assignLayers(flow, succ, pred, flowIds);
    const layers = orderLayers(groupByLayer(flow, layerOf), succ, pred, layerOf, opts.barycenterPasses, opts.refineSweeps);
    /** @type {Map<string, number>} id → 次序（越小越靠前） */
    const rank = new Map();
    let rankSeq = 0;
    layers.forEach((col) => col.forEach((node) => rank.set(node.id, rankSeq++)));

    // 2) 铺行：拓扑顺序 + 优先紧接后继 → 再按行上限切行
    const order = buildFlowOrder(flow, rank, succ, pred);
    const rows = splitRows(order, succ, opts.rowLimit);
    /** @type {Map<string, number>} id → 行号 */
    const rowOf = new Map();
    rows.forEach((row, index) => row.forEach((id) => rowOf.set(id, index)));

    // 3) 连线条数（度）：够多的节点要抬高，方便看清它那一串线
    /** @type {Map<string, number>} */
    const degreeOf = new Map();
    list.forEach((node) => {
        const degree =
            (succ.get(node.id) || []).filter((id) => flowIds.has(id)).length +
            (pred.get(node.id) || []).filter((id) => flowIds.has(id)).length;
        degreeOf.set(node.id, degree);
    });

    // 4) 规划辅助节点归属：单宿主→宿主下方的列；多宿主→宿主所在行带的上方左侧
    const plan = planHelpers(helperIds, succ, byId, rowOf);
    const placed = placeRows(rows, byId, plan, degreeOf, opts);

    /** @type {Map<string, { x: number, y: number }>} */
    const positions = new Map(placed.positions);
    placeHelpers(plan, byId, positions, placed.rowTops, opts);

    // 5) 孤立节点（含没连上的辅助节点）排在主图下方
    const isolatedTop = placed.bottom + (placed.bottom > opts.originY ? opts.rowGap : 0);
    placeIsolated(isolated, byId, opts, isolatedTop, placed.pitchX).forEach((pos, id) => positions.set(id, pos));

    return {
        positions,
        bounds: measureBounds(list, positions, opts),
        rows: rows.length,
        columns: rows.reduce((max, row) => Math.max(max, row.length), 0),
        layers: layers.length,
    };
}

/**
 * 统计「跨切口」的连线数（诊断 / 测试用）：给定顺序里的位置 cut，返回两端分居 cut 两侧的连线数。
 *
 * @param {Array<string | { id: string }>} order - 铺行顺序
 * @param {Array<{ from: string | number, to: string | number }>} edges
 * @param {number} cut - 切口位置（0..order.length）
 * @returns {number}
 */
export function countEdgesAcrossCut(order, edges, cut) {
    const positions = new Map();
    order.forEach((entry, i) => positions.set(String(entry && typeof entry === 'object' ? entry.id : entry), i));
    let count = 0;
    (Array.isArray(edges) ? edges : []).forEach((edge) => {
        if (!edge) return;
        const a = positions.get(String(edge.from));
        const b = positions.get(String(edge.to));
        if (a == null || b == null) return;
        if (Math.min(a, b) < cut && cut <= Math.max(a, b)) count++;
    });
    return count;
}

/**
 * @private 规整节点列表（去重、补默认尺寸、id 统一成字符串）
 * @param {Array<{ id: string | number, width?: number, height?: number, aux?: boolean }>} nodes
 * @param {typeof DEFAULTS} opts
 * @returns {Array<{ id: string, width: number, height: number, aux: boolean }>}
 */
function normalizeNodes(nodes, opts) {
    /** @type {Array<{ id: string, width: number, height: number, aux: boolean }>} */
    const result = [];
    const seen = new Set();
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        if (!node || node.id == null) return;
        const id = String(node.id);
        if (seen.has(id)) return;
        seen.add(id);
        result.push({
            id,
            width: node.width > 0 ? node.width : opts.defaultWidth,
            height: node.height > 0 ? node.height : opts.defaultHeight,
            aux: !!node.aux,
        });
    });
    return result;
}

/**
 * @private 建邻接表与孤立节点分组
 *
 * @param {Array<{ id: string }>} list
 * @param {Array<{ from: string | number, to: string | number }>} edges
 * @returns {{ succ: Map<string, string[]>, pred: Map<string, string[]>, isolated: Array<{ id: string }> }}
 */
function buildAdjacency(list, edges) {
    /** @type {Map<string, string[]>} */
    const succ = new Map();
    /** @type {Map<string, string[]>} */
    const pred = new Map();
    list.forEach((node) => {
        succ.set(node.id, []);
        pred.set(node.id, []);
    });

    // 同一对节点之间可能有多条线，铺行只算一次
    const seen = new Set();
    (Array.isArray(edges) ? edges : []).forEach((edge) => {
        if (!edge || edge.from == null || edge.to == null) return;
        const from = String(edge.from);
        const to = String(edge.to);
        if (from === to || !succ.has(from) || !succ.has(to)) return;
        const key = `${from}\u0000${to}`;
        if (seen.has(key)) return;
        seen.add(key);
        succ.get(from).push(to);
        pred.get(to).push(from);
    });

    const isolated = list.filter((node) => !succ.get(node.id).length && !pred.get(node.id).length);
    return { succ, pred, isolated };
}

/**
 * @private 分层：层号 = 最长路径长度；回边（环）直接忽略，保证层号有限
 *
 * 用迭代式 DFS + 逆后序（= 拓扑序）从前向后传播层号，避免深图递归爆栈。
 * 这里只为「后继访问优先级」服务，所以辅助节点不参与。
 *
 * @param {Array<{ id: string }>} flow - 主流程节点
 * @param {Map<string, string[]>} succ
 * @param {Map<string, string[]>} pred
 * @param {Set<string>} flowIds
 * @returns {Map<string, number>} id → 层号
 */
function assignLayers(flow, succ, pred, flowIds) {
    const inFlow = (id) => flowIds.has(id);
    const children = (id) => (succ.get(id) || []).filter(inFlow);
    const parents = (id) => (pred.get(id) || []).filter(inFlow);

    /** @type {string[]} 后序序列 */
    const post = [];
    /** @type {Map<string, number>} 0=未访问 1=访问中 2=已完成 */
    const state = new Map();
    flow.forEach((node) => {
        if (state.get(node.id)) return;
        state.set(node.id, 1);
        const stack = [{ id: node.id, next: 0 }];
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const list = children(frame.id);
            if (frame.next < list.length) {
                const child = list[frame.next++];
                if (!state.get(child)) {
                    state.set(child, 1);
                    stack.push({ id: child, next: 0 });
                }
                continue;
            }
            state.set(frame.id, 2);
            post.push(frame.id);
            stack.pop();
        }
    });

    /** @type {Map<string, number>} */
    const layerOf = new Map();
    for (let i = post.length - 1; i >= 0; i--) {
        const id = post[i];
        const current = layerOf.get(id) || 0;
        layerOf.set(id, current);
        children(id).forEach((child) => {
            layerOf.set(child, Math.max(layerOf.get(child) || 0, current + 1));
        });
    }

    // 纯源节点：紧贴最近的后继（只往右拉，不往左）
    flow.forEach((node) => {
        if (parents(node.id).length) return;
        const list = children(node.id);
        if (!list.length) return;
        const nearest = list.reduce((min, id) => Math.min(min, layerOf.get(id) || 0), Infinity);
        if (Number.isFinite(nearest) && nearest - 1 > (layerOf.get(node.id) || 0)) {
            layerOf.set(node.id, nearest - 1);
        }
    });

    return layerOf;
}

/**
 * @private 按层号分组（保持传入顺序，保证初始相对位置稳定）
 * @param {Array<{ id: string }>} flow
 * @param {Map<string, number>} layerOf
 * @returns {Array<Array<{ id: string }>>} 下标即层号
 */
function groupByLayer(flow, layerOf) {
    /** @type {Array<Array<{ id: string }>>} */
    const layers = [];
    flow.forEach((node) => {
        const index = layerOf.get(node.id) || 0;
        if (!layers[index]) layers[index] = [];
        layers[index].push(node);
    });
    for (let i = 0; i < layers.length; i++) {
        if (!layers[i]) layers[i] = [];
    }
    return layers;
}

/**
 * @private 同层排序：重心法多轮往返 + 贪心相邻换序（用实际交叉数做局部改进）
 *
 * @param {Array<Array<{ id: string }>>} layers
 * @param {Map<string, string[]>} succ
 * @param {Map<string, string[]>} pred
 * @param {Map<string, number>} layerOf
 * @param {number} passes - 重心法轮数
 * @param {number} refineSweeps - 贪心换序轮数
 * @returns {Array<Array<{ id: string }>>}
 */
function orderLayers(layers, succ, pred, layerOf, passes, refineSweeps = 0) {
    let current = layers.map((list) => list.slice());
    if (current.length < 2) return current;

    /** 同层内的相邻节点不参与重心（对排序没有意义） */
    const crossLayer = (neighbors) => {
        const filtered = new Map();
        neighbors.forEach((ids, id) => {
            filtered.set(
                id,
                ids.filter((other) => layerOf.get(other) !== layerOf.get(id))
            );
        });
        return filtered;
    };
    const succCross = crossLayer(succ);
    const predCross = crossLayer(pred);

    for (let pass = 0; pass < Math.max(0, passes); pass++) {
        const useSucc = pass % 2 === 1;
        const neighbors = useSucc ? succCross : predCross;
        const index = indexPositions(current);
        const next = current.slice();
        const order = [];
        for (let i = 0; i < next.length; i++) order.push(i);
        if (useSucc) order.reverse(); // 反向轮次：从最右列往回排

        order.forEach((layerIndex) => {
            if (next[layerIndex].length < 2) return;
            next[layerIndex] = sortByBarycenter(next[layerIndex], neighbors, index);
            updateIndex(index, next[layerIndex]);
        });
        current = next;
    }

    if (refineSweeps > 0) refineOrder(current, succCross, predCross, refineSweeps);
    return current;
}

/**
 * @private 贪心换序：反复扫描（正反交替），相邻两节点换位能减少交叉数就换
 *
 * 交换相邻的 u、v 只会改变「与 u 相连的边」和「与 v 相连的边」之间的交叉关系
 * （其它边与 u、v 的相对次序不变），所以只算这两个节点的局部增量，不必重算全图。
 *
 * @param {Array<Array<{ id: string }>>} layers
 * @param {Map<string, string[]>} succ
 * @param {Map<string, string[]>} pred
 * @param {number} sweeps
 */
function refineOrder(layers, succ, pred, sweeps) {
    /** @type {Map<string, number>} id → 层内序号 */
    const index = new Map();
    layers.forEach((list) => list.forEach((node, i) => index.set(node.id, i)));

    for (let sweep = 0; sweep < sweeps; sweep++) {
        const order = [];
        for (let i = 0; i < layers.length; i++) order.push(i);
        if (sweep % 2 === 1) order.reverse();

        let improved = false;
        order.forEach((li) => {
            const list = layers[li];
            for (let i = 0; i + 1 < list.length; i++) {
                const u = list[i];
                const v = list[i + 1];
                if (swapDelta(u.id, v.id, succ, pred, index) >= 0) continue;
                list[i] = v;
                list[i + 1] = u;
                index.set(u.id, i + 1);
                index.set(v.id, i);
                improved = true;
            }
        });
        if (!improved) break;
    }
}

/**
 * @private 同层内相邻的 u（前）、v（后）对调后，交叉数的变化量（负数 = 变少）
 *
 * 换位前 u 在上、v 在下：共同后继里 b1 在 b2 之下（d > 0）就是交叉，共同前驱同理。
 *
 * @param {string} u
 * @param {string} v
 * @param {Map<string, string[]>} succ
 * @param {Map<string, string[]>} pred
 * @param {Map<string, number>} index - id → 层内序号
 * @returns {number}
 */
function swapDelta(u, v, succ, pred, index) {
    const uSucc = succ.get(u) || [];
    const vSucc = succ.get(v) || [];
    const uPred = pred.get(u) || [];
    const vPred = pred.get(v) || [];
    let before = 0;
    let after = 0;

    uSucc.forEach((b1) => {
        vSucc.forEach((b2) => {
            const d = (index.get(b1) || 0) - (index.get(b2) || 0);
            if (d > 0) before++;
            else if (d < 0) after++;
        });
    });
    uPred.forEach((a1) => {
        vPred.forEach((a2) => {
            const d = (index.get(a1) || 0) - (index.get(a2) || 0);
            if (d > 0) before++;
            else if (d < 0) after++;
        });
    });

    return after - before;
}

/**
 * @private 记录每个节点在其所在列中的相对位置（序号 / 本层节点数）
 * @param {Array<Array<{ id: string }>>} layers
 * @returns {Map<string, { i: number, n: number }>}
 */
function indexPositions(layers) {
    /** @type {Map<string, { i: number, n: number }>} */
    const index = new Map();
    layers.forEach((list) => updateIndex(index, list));
    return index;
}

/**
 * @private 刷新某一列节点的相对位置
 * @param {Map<string, { i: number, n: number }>} index
 * @param {Array<{ id: string }>} list
 */
function updateIndex(index, list) {
    list.forEach((node, i) => index.set(node.id, { i, n: Math.max(1, list.length) }));
}

/**
 * @private 按邻居的平均相对位置排序；无邻居的节点保持原位（用自身序号当重心）
 * @param {Array<{ id: string }>} list
 * @param {Map<string, string[]>} neighbors
 * @param {Map<string, { i: number, n: number }>} index
 * @returns {Array<{ id: string }>}
 */
function sortByBarycenter(list, neighbors, index) {
    const size = Math.max(1, list.length);
    const scored = list.map((node, i) => {
        const ids = (neighbors.get(node.id) || []).filter((id) => index.has(id));
        const barycenter = ids.length
            ? ids.reduce((sum, id) => {
                  const pos = index.get(id);
                  return sum + (pos.i / pos.n) * size; // 归一到本层的序号尺度
              }, 0) / ids.length
            : i;
        return { node, barycenter, i };
    });
    scored.sort((a, b) => a.barycenter - b.barycenter || a.i - b.i);
    return scored.map((item) => item.node);
}

/**
 * @private 铺行顺序：拓扑顺序（保证边都指向右）+ 后继紧邻（一个节点的后继连续排在一起）
 *
 * 用「按层推进」而不是深度优先：放完一个节点后，把它的后继按优先级排进待放队列，
 * 于是同一串引用的节点在行里连成一段；扇出很大的枢纽，它的一整串后继也不会被别的节点插开，
 * 换行时才可能整串挪到下一行而不是被切成两半。
 *
 * @param {Array<{ id: string }>} flow
 * @param {Map<string, number>} rank - 越小越靠前（来自分层排序，作为并列时的优先级）
 * @param {Map<string, string[]>} succ
 * @param {Map<string, string[]>} pred
 * @returns {string[]}
 */
function buildFlowOrder(flow, rank, succ, pred) {
    /** @type {Map<string, number>} 剩余未放置的前驱数 */
    const pending = new Map();
    flow.forEach((node) => pending.set(node.id, (pred.get(node.id) || []).length));
    const ready = new Set();
    flow.forEach((node) => {
        if (!pending.get(node.id)) ready.add(node.id);
    });

    const byRank = (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
    /** @type {string[]} 待放置队列（同一批后继按优先级排好，连着放） */
    const queue = [...ready].sort(byRank);

    /** @type {string[]} */
    const order = [];
    const placed = new Set();

    /**
     * 把刚放置节点的、已经就绪的后继排进队列
     * @param {string} id
     */
    const enqueueReadyChildren = (id) => {
        const children = (succ.get(id) || []).filter(
            (child) => ready.has(child) && !placed.has(child) && !queue.includes(child)
        );
        children.sort(byRank);
        queue.push(...children);
    };

    while (placed.size < flow.length) {
        let pick = null;
        while (queue.length) {
            const id = queue.shift();
            if (!placed.has(id) && ready.has(id)) {
                pick = id;
                break;
            }
        }
        // 兜底：环导致队列里没有就绪节点时，取未放置里次序最前的
        // （环中的回边只能指向左，可接受）
        if (!pick) {
            const rest = [];
            flow.forEach((node) => {
                if (!placed.has(node.id)) rest.push(node.id);
            });
            pick = rest.sort(byRank)[0] ?? null;
        }
        if (!pick) break;

        order.push(pick);
        placed.add(pick);
        ready.delete(pick);
        (succ.get(pick) || []).forEach((id) => {
            const left = (pending.get(id) ?? 1) - 1;
            pending.set(id, left);
            if (left <= 0) ready.add(id);
        });
        enqueueReadyChildren(pick);
    }
    return order;
}

/**
 * @private 切行：在「每行 ≤ rowLimit」的前提下，让跨行连线总数最少，同时尽量把行铺满
 *
 * 用动态规划在所有切点里取全局最优（贪心只看当前行，容易为了避开一次跨线把行切碎）：
 *   代价(切在 c) = 跨过 c 的连线数 + 少放的节点数 × slotWeight
 * slotWeight 表示「少放一个节点」折算成多少条跨线 —— 只有省下的跨线足够多才值得提前换行，
 * 于是枢纽节点会被连同它的后继一起挪到下一行，而不是把一串分支切成两半。
 *
 * @param {string[]} order
 * @param {Map<string, string[]>} succ
 * @param {number} rowLimit
 * @returns {string[][]}
 */
function splitRows(order, succ, rowLimit) {
    const limit = Math.max(1, Math.floor(rowLimit) || 1);
    if (order.length <= limit) return order.length ? [order.slice()] : [];

    /** 每条向前边在顺序里的跨度；只统计向前边（向后边与行内次序无关） */
    const position = new Map(order.map((id, i) => [id, i]));
    /** @type {Array<[number, number]>} */
    const spans = [];
    order.forEach((id) => {
        const a = position.get(id) ?? 0;
        (succ.get(id) || []).forEach((child) => {
            const b = position.get(child);
            if (b != null && b > a) spans.push([a, b]);
        });
    });
    const cutCost = (c) => spans.reduce((n, [a, b]) => n + (a < c && c <= b ? 1 : 0), 0);

    const slotWeight = 0.5;
    const total = order.length;
    /** @type {number[]} dp[i] = 前 i 个节点排完的最小代价 */
    const dp = new Array(total + 1).fill(Infinity);
    /** @type {number[]} 回溯用的切点 */
    const from = new Array(total + 1).fill(0);
    dp[0] = 0;

    for (let end = 1; end <= total; end++) {
        const startFrom = Math.max(0, end - limit);
        const cut = end >= total ? 0 : cutCost(end); // 最后一段之后不用再切
        for (let start = startFrom; start < end; start++) {
            if (!Number.isFinite(dp[start])) continue;
            const slack = limit - (end - start); // 这一行少放几个
            const cost = dp[start] + cut + slack * slotWeight;
            if (cost < dp[end] - 1e-9) {
                dp[end] = cost;
                from[end] = start;
            }
        }
    }

    /** @type {string[][]} */
    const rows = [];
    let end = total;
    while (end > 0) {
        const start = from[end];
        rows.push(order.slice(start, end));
        end = start;
    }
    rows.reverse();
    return rows;
}

/**
 * @private 规划辅助节点归属
 *
 * - 只服务一个宿主 → 排到宿主**左侧的辅助列**（与宿主垂直居中，线短且方向正确）；
 * - 服务多个宿主 → 收在「最靠上那个宿主所在行带」的上方左侧（线从上方扇出，看得清）。
 *
 * @param {Set<string>} helperIds
 * @param {Map<string, string[]>} succ
 * @param {Map<string, { id: string, height: number }>} byId
 * @param {Map<string, number>} rowOf
 * @returns {{
 *   left: Map<string, string[]>,
 *   above: Array<{ helpers: string[], hosts: string[], row: number }>,
 * }}
 */
function planHelpers(helperIds, succ, byId, rowOf) {
    /** @type {Map<string, string[]>} 宿主 id → 排在它左侧的辅助节点（按连接顺序） */
    const left = new Map();
    /** @type {Map<number, Array<{ helpers: string[], hosts: string[] }>>} 行号 → 收在行带上方的辅助节点组 */
    const aboveByRow = new Map();

    helperIds.forEach((id) => {
        const hosts = (succ.get(id) || []).filter((hostId) => byId.has(hostId));
        if (!hosts.length) return;
        const rowIndexes = hosts.map((hostId) => rowOf.get(hostId)).filter((row) => row != null);
        if (hosts.length === 1 && rowIndexes.length === 1) {
            const hostId = hosts[0];
            const list = left.get(hostId) || [];
            list.push(id);
            left.set(hostId, list);
            return;
        }
        if (!rowIndexes.length) return;
        const row = Math.min(...rowIndexes);
        const groups = aboveByRow.get(row) || [];
        groups.push({ helpers: [id], hosts });
        aboveByRow.set(row, groups);
    });

    /** @type {Array<{ helpers: string[], hosts: string[], row: number }>} */
    const above = [];
    aboveByRow.forEach((groups, row) => {
        above.push({ helpers: groups.flatMap((group) => group.helpers), hosts: groups.flatMap((group) => group.hosts), row });
    });
    above.sort((a, b) => a.row - b.row);
    return { left, above };
}

/**
 * @private 一个宿主的辅助节点排几列、每列叠几个
 *
 * 「根据数量来」：先看宿主旁边一列能叠几个（按宿主高度算），叠不下就往左再加一列。
 *
 * @param {string[]} ids - 该宿主的辅助节点（按顺序）
 * @param {{ height: number }} host - 宿主节点
 * @param {Map<string, { height: number }>} byId
 * @param {typeof DEFAULTS} opts
 * @returns {{ columns: number, perColumn: number, colWidth: number }}
 */
function helperLayoutOf(ids, host, byId, opts) {
    const count = (ids || []).length;
    const colWidth = ids.reduce((max, id) => Math.max(max, byId.get(id)?.width || 0), 0);
    if (!count) return { columns: 0, perColumn: 0, colWidth };
    const maxHeight = ids.reduce((max, id) => Math.max(max, byId.get(id)?.height || 0), 0);
    const perColumn = Math.max(1, Math.round((host.height + opts.helperGap) / (maxHeight + opts.helperGap)));
    return { columns: Math.ceil(count / perColumn), perColumn, colWidth };
}

/**
 * @private 逐行摆放：行内从左到右，节点在行带内垂直居中
 *
 * - 行带高度 = 最高的「节点 + 其下方辅助节点栈」；
 * - 行内每个节点占的宽度按它的辅助节点列数加宽（至少一列），邻居的辅助节点不会互相撞上；
 * - 多连线的节点会抬高（连线越多抬得越高），行带上方预留相应空隙，让那一串线有空间展开。
 *
 * @param {string[][]} rows
 * @param {Map<string, { id: string, width: number, height: number }>} byId
 * @param {{ below: Map<string, string[]>, above: Array<{ helpers: string[], hosts: string[], row: number }> }} plan
 * @param {Map<string, number>} degreeOf - id → 连线条数
 * @param {typeof DEFAULTS} opts
 * @returns {{
 *   positions: Map<string, { x: number, y: number }>,
 *   rowTops: Map<number, number>,
 *   bottom: number,
 *   pitchX: number,
 * }}
 */
function placeRows(rows, byId, plan, degreeOf, opts) {
    /** @type {Map<string, { x: number, y: number }>} */
    const positions = new Map();
    /** @type {Map<number, number>} 行号 → 行带顶部 y */
    const rowTops = new Map();
    /** @type {Map<number, number>} 行号 → 行带高度 */
    const bandHeights = new Map();
    let bottom = opts.originY;
    let pitchX = opts.defaultWidth + opts.gapX;

    /** 抬高量：连线越多抬得越高（0 = 不高抬） */
    const liftOf = (id) => {
        const degree = degreeOf.get(id) || 0;
        if (degree < opts.hubMinDegree) return 0;
        return Math.min(opts.hubMaxLift, (degree - opts.hubMinDegree + 1) * opts.hubLiftPerEdge);
    };

    /**
     * 节点在行内占的宽度：宿主左边预留辅助列（按列数加宽，至少一列），
     * 邻居的辅助节点就不会撞上，也不会跑到邻居那一栏去。
     *
     * @param {{ id: string, width: number, height: number }} node
     * @returns {number}
     */
    const slotWidth = (node) => {
        const ids = plan.left.get(node.id) || [];
        const { columns, colWidth } = helperLayoutOf(ids, node, byId, opts);
        const gutter = columns * colWidth + columns * opts.helperColGap;
        return Math.max(node.width, node.width + gutter);
    };
    /** 辅助列占的宽度（含与宿主之间的间距） */
    const gutterOf = (node) => {
        const ids = plan.left.get(node.id) || [];
        const { columns, colWidth } = helperLayoutOf(ids, node, byId, opts);
        return columns * colWidth + columns * opts.helperColGap;
    };
    /** 辅助列整体占的高度（宿主旁的列叠起来有多高） */
    const helperStackHeight = (node) => {
        const ids = plan.left.get(node.id) || [];
        if (!ids.length) return 0;
        const { perColumn } = helperLayoutOf(ids, node, byId, opts);
        const tallest = ids.reduce((max, id) => Math.max(max, byId.get(id)?.height || 0), 0);
        const inFirstColumn = Math.min(ids.length, perColumn);
        return inFirstColumn * tallest + (inFirstColumn - 1) * opts.helperGap;
    };
    const aboveHeightOf = (rowIndex) => {
        const entry = plan.above.find((item) => item.row === rowIndex);
        const fromHelpers = entry
            ? entry.helpers.reduce((max, id) => Math.max(max, (byId.get(id)?.height || 0) + opts.helperGap), 0)
            : 0;
        const fromLift = (rows[rowIndex] || []).reduce((max, id) => Math.max(max, liftOf(id) + opts.helperGap), 0);
        return Math.max(fromHelpers, fromLift);
    };

    rows.forEach((row, rowIndex) => {
        const nodes = row.map((id) => byId.get(id)).filter(Boolean);
        if (!nodes.length) return;

        // 行带高度：节点本身，以及（辅助列叠得比宿主还高时）辅助列的高度
        const bandHeight = nodes.reduce(
            (max, node) => Math.max(max, node.height, helperStackHeight(node)),
            0
        );
        let y = opts.originY;
        if (rowIndex > 0) {
            y = (rowTops.get(rowIndex - 1) ?? opts.originY) + (bandHeights.get(rowIndex - 1) ?? 0) + opts.rowGap;
        }
        // 上方留白：多宿主的辅助节点 + 多连线节点的抬高量
        y += aboveHeightOf(rowIndex);
        rowTops.set(rowIndex, y);
        bandHeights.set(rowIndex, bandHeight);

        let x = opts.originX;
        nodes.forEach((node) => {
            const centered = y + (bandHeight - node.height) / 2;
            // 多连线的节点抬高：它那一串线有更多纵向空间可以展开，看着不乱
            positions.set(node.id, { x: Math.round(x + gutterOf(node)), y: Math.round(centered - liftOf(node.id)) });
            x += slotWidth(node) + opts.gapX;
        });
        pitchX = Math.max(pitchX, x - opts.gapX - opts.originX);
        bottom = Math.max(bottom, y + bandHeight);
    });

    return { positions, rowTops, bottom, pitchX };
}

/**
 * @private 摆辅助节点：排在宿主左侧的辅助列里
 *
 * - 一列能叠几个按宿主高度算（叠不下就往左再加一列）；
 * - 列内自上而下叠放，整列与宿主垂直居中（线都汇集到宿主左边的各个输入端口）；
 * - 列 0 紧贴宿主左侧，列号越大越靠左。
 *
 * @param {{ left: Map<string, string[]>, above: Array<{ helpers: string[], hosts: string[], row: number }> }} plan
 * @param {Map<string, { id: string, width: number, height: number }>} byId
 * @param {Map<string, { x: number, y: number }>} positions
 * @param {Map<number, number>} rowTops
 * @param {typeof DEFAULTS} opts
 */
function placeHelpers(plan, byId, positions, rowTops, opts) {
    plan.left.forEach((ids, hostId) => {
        const host = positions.get(hostId);
        const hostNode = byId.get(hostId);
        if (!host || !hostNode) return;
        const { columns, perColumn, colWidth } = helperLayoutOf(ids, hostNode, byId, opts);
        if (!columns) return;

        // 先按列分组，逐列竖向叠放并居中对齐到宿主
        for (let c = 0; c < columns; c++) {
            const inColumn = ids.slice(c * perColumn, (c + 1) * perColumn);
            if (!inColumn.length) continue;
            const stackHeight =
                inColumn.reduce((sum, id) => sum + (byId.get(id)?.height || 0), 0) +
                (inColumn.length - 1) * opts.helperGap;
            let y = host.y + (hostNode.height - stackHeight) / 2;
            const x = host.x - opts.helperGap - (c + 1) * colWidth - c * opts.helperColGap;
            inColumn.forEach((id) => {
                const helper = byId.get(id);
                if (!helper) return;
                positions.set(id, { x: Math.round(x), y: Math.round(y) });
                y += helper.height + opts.helperGap;
            });
        }
    });

    plan.above.forEach((entry) => {
        const rowTop = rowTops.get(entry.row);
        if (rowTop == null) return;
        const hostXs = entry.hosts.map((hostId) => positions.get(hostId)?.x).filter((x) => x != null);
        let x = hostXs.length ? Math.min(...hostXs) - opts.helperGap : opts.originX;
        entry.helpers.forEach((id) => {
            const helper = byId.get(id);
            if (!helper) return;
            x -= helper.width;
            positions.set(id, { x: Math.round(x), y: Math.round(rowTop - helper.height - opts.helperGap) });
            x -= opts.helperGap;
        });
    });
}

/**
 * @private 孤立节点：按网格排在主图下方（先填满一列再换下一列，与主图同向阅读）
 * @param {Array<{ id: string, width: number, height: number }>} list
 * @param {Map<string, { id: string, width: number, height: number }>} byId
 * @param {typeof DEFAULTS} opts
 * @param {number} startY
 * @param {number} pitchX
 * @returns {Map<string, { x: number, y: number }>}
 */
function placeIsolated(list, byId, opts, startY, pitchX) {
    /** @type {Map<string, { x: number, y: number }>} */
    const positions = new Map();
    if (!list.length) return positions;

    const columnCount = Math.max(1, Math.min(opts.isolatedColumns, list.length));
    const rowCount = Math.ceil(list.length / columnCount);
    const rowHeight = Math.max(
        opts.defaultHeight,
        ...list.map((node) => byId.get(node.id)?.height || node.height || opts.defaultHeight)
    );

    list.forEach((node, i) => {
        const column = Math.floor(i / rowCount);
        const row = i % rowCount;
        positions.set(node.id, {
            x: opts.originX + column * Math.max(pitchX, opts.defaultWidth + opts.gapX),
            y: startY + row * (rowHeight + opts.isolatedGapY),
        });
    });
    return positions;
}

/**
 * @private 依据坐标与尺寸算出整体包围盒
 * @param {Array<{ id: string, width: number, height: number }>} list
 * @param {Map<string, { x: number, y: number }>} positions
 * @param {typeof DEFAULTS} opts
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
function measureBounds(list, positions, opts) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    list.forEach((node) => {
        const pos = positions.get(node.id);
        if (!pos) return;
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + node.width);
        maxY = Math.max(maxY, pos.y + node.height);
    });
    if (!Number.isFinite(minX)) {
        return { minX: opts.originX, minY: opts.originY, maxX: opts.originX, maxY: opts.originY };
    }
    return { minX, minY, maxX, maxY };
}
