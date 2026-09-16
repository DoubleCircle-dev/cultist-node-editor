/**
 * frontend/src/dataContract.js —— core 数据契约（节点图）→ 前端内部形状的适配
 *
 * core 侧 modLoad 已改为「三段式流水线」，`modLoaded` / `originLoaded` / `jsonPreviewLoaded`
 * 三个消息统一回发**节点图**（见仓库 README「数据契约（后端 → 前端）」一节）：
 *
 *   { source, namespace, count, scope, nodes, edges, external, warnings, stats }
 *
 * 前端内部仍是「按类别分组的数据条目 + 连接候选」形状（`ModDataRegistry` 数据池 +
 * `ControllerCore.autoLayoutLoadedData` / `connectDataLinks`）。本模块负责两者互转，
 * 于是铺图、连线、数据选择器、查找节点这些既有链路一行都不用改：
 *
 *   nodes          → categories[type][{ id, title, category, file, source, fields, refs }]
 *   edges(resolved)→ links[{ from:{ category, id, field }, to:{ category, id } }]
 *
 * 节点图里 `type` 与 `category` 都是「数据文件最外围键」（= 前端基础节点类型，如 recipes），
 * 一律以 `type` 为准；`external`（跨文件引用）、`warnings`、`stats` 暂不参与铺图。
 */

/**
 * 节点图 → 数据池 + 连接候选
 *
 * 传入的若不是节点图（例如调试时手工构造的旧形状）则原样返回，方便本地排查。
 *
 * @param {any} data - 后端回发的节点图
 * @returns {any} `{ namespace, source, count, categories, links }`（或原样返回的入参）
 */
export function graphToDataPool(data) {
    if (!data || !Array.isArray(data.nodes)) return data;

    /** @type {Record<string, any[]>} */
    const categories = {};
    data.nodes.forEach((node) => {
        if (!node || typeof node !== 'object') return;
        const type = node.type || node.category || 'misc';
        (categories[type] = categories[type] || []).push({
            id: node.id,
            title: node.title,
            category: type,
            file: node.file,
            source: node.source,
            fields: node.fields,
            refs: node.refs,
        });
    });

    // 只有已解析的连接线两端都在本图内；external（跨文件引用）暂不画线
    const links = (data.edges || [])
        .filter((edge) => edge && edge.status === 'resolved' && edge.from && edge.to)
        .map((edge) => ({
            from: { category: edge.from.category || edge.from.type, id: edge.from.id, field: edge.from.field },
            to: { category: edge.to.category || edge.to.type, id: edge.to.id },
        }));

    return { namespace: data.namespace, source: data.source, count: data.count, categories, links };
}
