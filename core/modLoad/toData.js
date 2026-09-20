'use strict';

/**
 * core/modLoad/toData.js —— 数据文件 → 节点图（nodes + edges）
 *
 * 三段式流水线（「读文件」那一步在 parse.js）：
 *
 *   ① 拆根键（parse.splitRootKeys / parse.filesToGroups）
 *      读文件 → 拿到整份 JSON → 拆出最外围键（一般 1-2 个，如 recipes / elements）；
 *      键名 = 前端节点类型，值 = 该类型的条目 list，原样交给下一步处理。
 *
 *   ② 建节点 + 连接需求检测（entryToNode / detectConnections）
 *      列表里每个元素 → 一个「与根键同名」的节点（node.type = 根键）；
 *      元素每个字段都变成一条属性定义（原始值 + 由值推出来的基础类型），
 *      其中 mapping 声明了 `link` 的字段再额外抽出目标 id，生成连接线（pending edge）。
 *
 *   ③ 解析待连接（resolveEdges）
 *      本次解析范围内的节点全部建完后（scope='file' 本文件 / scope='global' 本次加载的全部文件），
 *      按 id 建索引把 pending edge 连到目标节点：
 *        · 命中 → `status='resolved'`，带 `to`；
 *        · 未命中 → 不丢弃，标为**文件外节点**（external）：
 *            `external-origin` —— 目标是游戏基础内容（运行时全局导入，前端放「上方引入区」）
 *            `external-mod`    —— 目标是用户自定义引入（前端放「左方引入区」）
 *          scope='global' 时另出「端口悬空，有未实现的目标」警告（按节点字段汇总，不刷屏）。
 *
 * 产物（buildGraph 返回值）：
 *   `{ source, modId, namespace, scope, nodes, edges, external, warnings, stats }`
 *
 * 前端消费：nodes 按 type 实例化基础类型节点 → 每个 prop 按 `kind` 决定渲染（兜底 text）、
 * 按 `link.targets` 限制端口能连什么 → edges 直接按 `out` / `in` 两端画线
 * （朝向已由后端变换好）→ external 进引入区占位 → warnings 进问题提示。
 *
 * 节点结构：`{ uid, id, type, category, title, file, source, inline, props, connections }`
 *   - `type` / `category` = 数据文件的最外围键（= 前端基础节点类型，如 recipes）；
 *   - `inline`= 该节点是不是从**宿主的内联定义**拆出来的：是则写明
 *     `{ hostUid, hostCategory, hostId, field, index, syntheticId }`（如 recipe 里内联的卡槽），根节点为 null；
 *   - `props` = 属性定义，每个字段一条 `{ name, kind, value, link, materialize }`：
 *       · `kind`  = `string | number | boolean | list | dict`（**值本身的 JSON 类型**，前端据此选控件）；
 *       · `value` = 原始值，原样（不加工、不字符串化）；
 *       · `link`  = 连接需求（`direction` / `targets` / `multi` / `extract`），没有就是 null；
 *       · `materialize` = 中间态转化（该抽取成节点/工具节点时给出）；
 *   - `connections` = 连接需求检测结果（字段 → 方向 → 目标 id 列表）。
 *
 * 连接线（edge）结构：
 *   `{ id, kind:'link',
 *      from:{uid,type,category,id,field,side,targets,extract,multi,sources,reverse?},
 *      out:{uid,side:'output',port,field?}, in:{uid,side:'input',port,field?},
 *      targetId, amount,
 *      status:'pending'|'resolved'|'external-origin'|'external-mod', to:{uid,type,category,id}|null }`
 *   —— `from` 是引用关系本身，`out` / `in` 才是给前端的**连接线两端**（已变换朝向）。
 */

const fs = require('fs');
const path = require('path');
const parse = require('./parse');
const mapping = require('./mapping');

/** origin 预加载命名空间 */
const ORIGIN_NS = 'origin';

/** 文件外节点：目标是游戏基础内容（运行时全局导入） */
const EXTERNAL_ORIGIN = 'external-origin';

/** 文件外节点：目标是用户自定义引入（其它 mod / 外部库） */
const EXTERNAL_MOD = 'external-mod';
/** 中间态 JSON 的形状标识（前端 nodeModel ⇄ 中间态互转时校对用） */
const GRAPH_FORMAT = 'cne-node-graph';
const GRAPH_VERSION = 1;

/** 节点角色：data = 数据条目（写回 content 文件）；tool = 工具节点（只为表达值，不写数据文件） */
const NODE_ROLE = { DATA: 'data', TOOL: 'tool' };

/** 连接线种类：link = 引用关系；contains = 结构拆分；bind = 值绑定/外化（工具节点 → 字段） */
const EDGE_KINDS = ['link', 'contains', 'bind'];
/** 一条汇总告警里最多列几个目标 id（其余折叠成「等 N 个」） */
const WARN_TARGET_LIMIT = 5;

/** 汇总告警条数上限（超出只留一条统计，明细仍在 external 里） */
const WARN_LIMIT = 200;

/**
 * 生成带命名空间的类型 key，避免多来源同名冲突
 *
 * @param {string} namespace - 'origin' 或 mod 标识
 * @param {string} category - recipes / elements / ...
 * @param {string} rawId - 条目原始 id
 * @returns {string} 命名空间化的键
 */
function namespaceKey(namespace, category, rawId) {
    return `${namespace}:${category}:${rawId}`;
}

/**
 * 节点唯一键（uid）：命名空间 + 类别 + 原始 id，跨来源/类别都不冲突
 *
 * @param {string} namespace - 命名空间
 * @param {string} category - 类别（= 节点类型）
 * @param {string} id - 条目原始 id
 * @returns {string} 节点 uid
 */
function nodeUid(namespace, category, id) {
    return namespaceKey(namespace, category, id);
}

/**
 * 连接性检测（第 ② 步核心）：把一个条目的字段过一遍 mapping 声明的**连接需求**。
 *
 * 判定依据**只有** mapping.js 里带 `link` 的字段规则（本体表 + 启用中的插件）——
 * 没声明的字段一律当普通属性处理，不猜、不推断（避免误连线）。
 *
 * 实现已在 `mapping.connectionsOf`（mapping 的职责就是「加连接」），这里保留同名入口
 * 供 `toData` 内部与既有调用方使用，**不再维护第二份实现**（曾经两边各一份，
 * 新增 `reverse` 这类规则字段时极易漏改一边）。
 *
 * @param {string} category - 类别（= 节点类型 = 数据文件最外围键）
 * @param {Record<string, any>} entry - 原始条目
 * @returns {ReturnType<typeof mapping.connectionsOf>} 连接性检测结果（一个「端口 + 方向」一条）
 */
function detectConnections(category, entry) {
    return mapping.connectionsOf(category, entry);
}

/**
 * 条目 → 节点（第 ② 步产物）
 *
 * 节点只带语义信息（后端不做渲染决策）：
 *   - `props`：每个字段一条 `{ name, kind, value, link, materialize }`；
 *   - `connections`：连接需求检测结果（字段 → 方向 → 目标 id）。
 *
 * @param {string} category - 类别（= 数据文件最外围键 = 前端节点类型）
 * @param {Record<string, any>} entry - 原始条目
 * @param {{ source?: 'origin'|'mod'; namespace: string; file?: string }} source - 来源信息
 * @param {any} [inline] - 该节点是不是从宿主的内联定义拆出来的（是则写明宿主与字段），见 expandEntry
 * @returns {{
 *     uid: string; id: string; type: string; category: string; title: string;
 *     file: string; source: string; role: 'data'|'tool';
 *     inline: any;
 *     props: Array<Record<string, any>>;
 *     connections: ReturnType<typeof detectConnections>;
 *     refCount: number;
 * }} 节点
 */
function entryToNode(category, entry, source, inline = null) {
    const rule = mapping.ruleFor(category);
    const props = mapping.helpers.buildProps(entry, rule);
    const connections = detectConnections(category, entry);
    const id = String(entry.id == null ? '' : entry.id);
    // 标题取数据里的 label（游戏内显示名），没写就退回 id
    const title = String(entry.label || entry.id || 'untitled');

    return {
        uid: nodeUid(source.namespace, category, id),
        id,
        type: category,
        category,
        title,
        file: source.file || '',
        source: source.source || 'mod',
        // 本函数只建数据条目；字段声明 materialize.as='tool' 时由 expandEntry 建工具节点。
        role: NODE_ROLE.DATA,
        inline,
        props,
        connections,
        refCount: connections.reduce((n, c) => n + c.targetIds.length, 0),
    };
}

/**
 * 将 mapping 声明为 materialize.as='tool' 的字段表示为工具节点。
 *
 * 工具节点不是 content 条目，故没有可被引用的 id，也不加入 id 索引。它的值由
 * `contains` 边定位回宿主字段；uid 仅供画布和该结构边稳定关联。
 *
 * 节点自带 `tool` 描述符（与内联子节点的 `inline` 对称），因此前端**不需要**反查边
 * 就能知道「这是什么工具、值从哪个宿主的哪个字段来」；怎么渲染这个工具由前端决定。
 *
 * @param {any} host - 持有该字段的数据节点
 * @param {string} field - 字段名
 * @param {string} kind - 字段的基础属性类型
 * @param {any} value - 字段原始值
 * @param {Record<string, any>} materialize - mapping 的 materialize 声明
 * @returns {any} 工具节点
 */
function toolNode(host, field, kind, value, materialize) {
    const type = String(materialize.type || 'tool');
    return {
        uid: `tool:${host.uid}:${field}`,
        id: '',
        type,
        category: type,
        title: `${host.title} · ${field}`,
        file: host.file,
        source: host.source,
        role: NODE_ROLE.TOOL,
        inline: null,
        // 工具节点的来源：宿主与字段。渲染方式（表格/列表/变量控件）由前端按 type 决定
        tool: {
            as: NODE_ROLE.TOOL,
            type,
            hostUid: host.uid,
            hostCategory: host.category,
            hostId: host.id,
            field,
        },
        value,
        props: [{ name: 'value', kind, value, links: [], materialize: null }],
        connections: [],
        refCount: 0,
    };
}

/**
 * 建 id → 节点 索引（跨类别；同 id 多节点时全部保留，解析连线时按 `from.targets` 收敛）
 *
 * @param {{ id: string }[]} nodes - 节点列表
 * @returns {Map<string, any[]>} id 索引
 */
function buildIdIndex(nodes) {
    /** @type {Map<string, any[]>} */
    const index = new Map();
    (nodes || []).forEach((node) => {
        if (!node || !node.id) return;
        if (!index.has(node.id)) index.set(node.id, []);
        index.get(node.id).push(node);
    });
    return index;
}

/**
 * 建「连接线」待连接表（第 ② 步产物）：连接需求检测结果 → 一条条待解析的 edge。
 *
 * edge 的形状（前端只消费 `out` / `in` 两端，不必理解游戏语义）：
 *   - `from`：引用关系本身（谁在哪个字段上声明了引用、方向、目标类别、规则来源）；
 *   - `out` / `in`：**已经变换好的连接线两端**（出线端画在 output 端口，入线端在 input 端口）；
 *   - `targetId` / `to` / `status`：目标解析情况（待解析时 `to=null`、`status='pending'`）。
 *
 * @param {any[]} nodes - 节点列表
 * @returns {any[]} 待连接 edge 列表
 */
function buildPendingEdges(nodes) {
    /** @type {any[]} */
    const edges = [];
    const seen = new Set();

    (nodes || []).forEach((node) => {
        if (!node || !node.id) return; // 无 id 的条目无法被引用
        (node.connections || []).forEach((conn) => {
            conn.targetIds.forEach(({ targetId, amount }) => {
                // 同一字段可能双向都有目标（如 mutations 的 filter / mutate）→ id 里带方向避免撞车
                const id = `${node.uid}.${conn.field}#${conn.side}#${targetId}`;
                if (seen.has(id)) return;
                seen.add(id);

                // **连接线朝向的变换**（后端做完再交给前端）：
                //   conn.side = 'output' → 本条目是出线端（out = 自己，in = 目标）
                //   conn.side = 'input'  → 本条目是入线端（out = 目标，in = 自己）
                // 目标那一端的端口 key 统一是 'link'（通用连接口），未解析时 uid 留空，
                // 由 resolveEdges 命中后补上。
                const self = {
                    uid: node.uid,
                    type: node.type,
                    category: node.category,
                    id: node.id,
                    field: conn.field,
                };
                const selfPort = { side: conn.side, port: `${conn.side}:${conn.port}` };
                const otherPort = { side: conn.side === 'output' ? 'input' : 'output', port: 'link' };
                const out = conn.side === 'output' ? { ...self, ...selfPort } : { uid: null, ...otherPort };
                const into = conn.side === 'output' ? { uid: null, ...otherPort } : { ...self, ...selfPort };

                edges.push({
                    id,
                    kind: 'link',
                    // from = 引用关系本身（谁在哪个字段上声明了这条引用、方向、目标类别、规则来源）
                    from: {
                        ...self,
                        port: conn.port,
                        side: conn.side,
                        targets: conn.targets || [],
                        extract: conn.extract,
                        multi: conn.multi,
                        // 反向记录（alt / linked 这类跳转分支）：书写位置在本条目、判定主体在对端
                        ...(conn.reverse ? { reverse: true } : {}),
                        sources: conn.sources || [], // 该字段的规则来源：mapping（本体）/ 插件 id
                    },
                    targetId,
                    amount,
                    // out / in = 已经变换好的连接线两端（前端照着画即可）
                    out,
                    in: into,
                    status: 'pending',
                    to: null,
                });
            });
        });
    });

    return edges;
}

/**
 * 判定未解析目标的归属。
 *
 * 有 origin id 索引时：命中 → `external-origin`，未命中 → `external-mod`；
 * 没有索引时（例如正在加载 origin 本身）统一按 `external-origin` 记 ——
 * origin 在初始化时全局导入，目标最终会由引入区接上。
 *
 * @param {string} targetId - 未解析的目标 id
 * @param {Set<string>|string[]|null} originIds - origin 条目 id 集合（可选）
 * @returns {'external-origin'|'external-mod'} 文件外节点标记
 */
function classifyExternal(targetId, originIds) {
    if (originIds instanceof Set) return originIds.has(targetId) ? EXTERNAL_ORIGIN : EXTERNAL_MOD;
    if (Array.isArray(originIds)) return originIds.includes(targetId) ? EXTERNAL_ORIGIN : EXTERNAL_MOD;
    return EXTERNAL_ORIGIN;
}

/**
 * 「文件外节点」→ 可读告警（按 节点.字段 汇总，一条告警列多个目标）
 *
 * @param {any[]} external - 未解析的 edge 列表
 * @returns {string[]} 汇总告警
 */
function summarizeExternal(external) {
    /** @type {Map<string, { from: any; targets: string[] }>} */
    const groups = new Map();

    (external || []).forEach((edge) => {
        const key = `${edge.from.uid}.${edge.from.field}#${edge.from.side}`;
        if (!groups.has(key)) groups.set(key, { from: edge.from, targets: [] });
        const group = groups.get(key);
        if (!group.targets.includes(edge.targetId)) group.targets.push(edge.targetId);
    });

    /** @type {string[]} */
    const warnings = [];
    groups.forEach(({ from, targets }) => {
        const shown = targets.slice(0, WARN_TARGET_LIMIT).join(', ');
        const more = targets.length > WARN_TARGET_LIMIT ? ` 等 ${targets.length} 个` : '';
        const origin = (from.sources || []).filter((s) => s !== 'mapping');
        const originText = origin.length ? `，插件 ${origin.join('/')}` : '';
        // 端口性质：反向记录的跳转分支（alt / linked）与普通的需求/效果端口分开描述
        const portText = from.reverse ? '分支' : from.side === 'input' ? '需求' : '效果';
        warnings.push(
            `端口悬空：${from.category}:${from.id} 的 ${from.field}` +
                `（${portText}端口${originText}）引用的目标 [${shown}${more}] 未解析（未实现的目标）`
        );
    });

    if (warnings.length > WARN_LIMIT) {
        const rest = warnings.length - WARN_LIMIT;
        warnings.length = WARN_LIMIT;
        warnings.push(`…另有 ${rest} 个节点字段端口悬空（未实现的目标），明细见 external`);
    }

    return warnings;
}

/**
 * 解析待连接（第 ③ 步）：pending edge + id 索引 → 已连接 edge / 文件外节点 / 告警。
 *
 * 解析规则：
 *   1. **两端都已明确**（如包含连线，建边时就写好了子节点 uid）→ 直接 resolved，不再按 id 重查；
 *   2. 只明确了引用端 → 拿 `targetId` 去 id 索引里找，**多个同 id 节点时按 `from.targets`
 *      声明的目标类别收敛**（仍多义时优先正式定义，不选从宿主字段拆出来的内联节点）；
 *   3. 索引里没有 → 标文件外节点（external-origin / external-mod）。
 *
 * 第 2 条的「收敛」不可省略：内联拆分出来的 slots 节点常常与宿主同 id
 *（Cultist 的 verb.slot.id 就写作 verb.id），不筛类别会把一条引用解成两条。
 *
 * @param {any[]} pending - buildPendingEdges 产物
 * @param {Map<string, any[]>} index - buildIdIndex 产物
 * @param {{ scope?: 'file'|'global'; originIds?: Set<string>|string[]|null }} [options]
 *        scope='global'（读取多个文件）时才产出「端口悬空」告警；scope='file' 只标外部节点。
 * @returns {{ edges: any[]; external: any[]; warnings: string[] }} 解析结果
 */
function resolveEdges(pending, index, options = {}) {
    const scope = options.scope || 'global';
    /** @type {any[]} */
    const edges = [];
    /** @type {any[]} */
    const external = [];

    (pending || []).forEach((edge) => {
        // 两端都已明确：目标就是已经写在里的那个节点（别再用 id 索引重查，否则会同 id 的兄弟节点也会连上）
        if (edge.out.uid && edge.in.uid) {
            const target = edge.out.uid === edge.from.uid ? edge.in : edge.out;
            edges.push({ ...edge, status: 'resolved', to: pickPatch(target) });
            return;
        }

        const hits = index.get(edge.targetId);
        if (hits && hits.length) {
            pickHits(hits, edge).forEach((hit) => {
                const patch = pickPatch(hit);
                // 目标那一端（uid 为空的一端）补上目标节点信息
                edges.push({
                    ...edge,
                    out: edge.out.uid ? edge.out : { ...edge.out, ...patch },
                    in: edge.in.uid ? edge.in : { ...edge.in, ...patch },
                    status: 'resolved',
                    to: patch,
                });
            });
            return;
        }

        const status = classifyExternal(edge.targetId, options.originIds || null);
        const outside = { ...edge, status, to: null, external: true };
        edges.push(outside);
        external.push(outside);
    });

    return {
        edges,
        external,
        warnings: scope === 'global' ? summarizeExternal(external) : [],
    };
}

/** 取节点信息补到连线端点（uid / type / category / id） */
function pickPatch(node) {
    return { uid: node.uid, type: node.type, category: node.category, id: node.id };
}

/** 两个类别名是否指同一类（容大小写与复数差异：recipes / Recipe / recipe 视为同类） */
function sameCategory(a, b) {
    const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/s$/, '');
    return norm(a) === norm(b);
}

/**
 * id 命中多个节点时的取舍：先按规则声明的目标类别收敛，再优先「正式定义」。
 *
 * @param {any[]} hits - 同 id 的节点列表
 * @param {any} edge - pending edge（用 from.targets 收敛）
 * @returns {any[]} 要连的目标节点（保持原行为：实在分不出就全连，不静默丢引用）
 */
function pickHits(hits, edge) {
    if (hits.length <= 1) return hits;

    const targets = (edge.from && edge.from.targets) || [];
    let pool = targets.length ? hits.filter((h) => targets.some((t) => sameCategory(t, h.category))) : hits;
    if (!pool.length) pool = hits; // 规则没写 / 写的类别对不上 → 退回全连

    if (pool.length > 1) {
        const declared = pool.filter((h) => !h.inline);
        if (declared.length) pool = declared;
    }
    return pool;
}

/** 内联定义拆节点的递归深度上限（防「定义里再套定义」无限展开） */
const MAX_INLINE_DEPTH = 4;

/**
 * 建一个条目的节点，并递归展开它内联定义里的子节点（mapping「拆分节点」的落地）。
 *
 * `mapping.splitInline` 给出该拆出来的内嵌定义（如 recipe 里内联的 slots / 内联 recipe），
 * 这里为它们各自建节点，并补一条**包含关系**连线：宿主 → 子节点。
 *
 * 同一 id 只建一次（数据里同一份定义可能被多处内联引用），所以重复定义不会重复建节点。
 *
 * @param {string} category - 类别
 * @param {Record<string, any>} entry - 条目（内联定义会被补上合成 id）
 * @param {{ source: string; namespace: string; file: string }} origin - 来源信息
 * @param {{ nodes: any[]; pending: any[]; byUid: Map<string, any>; depth: number; inline?: any }} ctx - 累积上下文
 * @returns {any|null} 建出来的节点
 */
function expandEntry(category, entry, origin, ctx) {
    const id = String(entry.id == null ? '' : entry.id);
    const uid = id ? nodeUid(origin.namespace, category, id) : null;
    if (uid && ctx.byUid.has(uid)) return ctx.byUid.get(uid); // 同一 id 只建一次

    const node = entryToNode(category, entry, origin, ctx.inline || null);
    ctx.nodes.push(node);
    if (uid) ctx.byUid.set(uid, node);
    ctx.pending.push(...buildPendingEdges([node]));

    node.props
        .filter((prop) => prop.materialize && prop.materialize.as === NODE_ROLE.TOOL)
        .forEach((prop) => {
            const childNode = toolNode(node, prop.name, prop.kind, prop.value, prop.materialize);
            ctx.nodes.push(childNode);
            ctx.byUid.set(childNode.uid, childNode);
            ctx.pending.push(toolContainmentEdge(node, prop.name, childNode));
        });

    if (ctx.depth >= MAX_INLINE_DEPTH) return node;

    mapping.splitInline(category, entry).forEach((child) => {
        // 内联定义常常没写 id → 用「宿主 id#字段#序号」合成一个稳定 id
        const synthetic = child.entry.id == null || child.entry.id === '';
        const childId = String(synthetic ? `${id || category}#${child.field}#${child.index}` : child.entry.id);
        const childNode = expandEntry(child.category, { ...child.entry, id: childId }, origin, {
            ...ctx,
            depth: ctx.depth + 1,
            // 内联来源：前端（与写回 mod 时）要靠它知道这个节点是从谁身上拆出来的
            inline: {
                hostUid: node.uid,
                hostCategory: node.category,
                hostId: node.id,
                field: child.field,
                index: child.index,
                syntheticId: synthetic,
            },
        });
        ctx.pending.push(containmentEdge(node, child, childNode));
    });

    return node;
}

/**
 * 包含关系连线：宿主条目 → 它内联定义拆出来的子节点
 *
 * 出线端 = 宿主的 `output:<字段名>`；入线端 = 子节点的通用入口（`link`）。
 * 两端都在图里，resolveEdges 会把它标成 resolved。
 *
 * @param {any} host - 宿主节点
 * @param {{ field: string; index: number; category: string }} child - splitInline 的产物
 * @param {any} childNode - 拆出来的子节点
 * @returns {any} 连接线
 */
function containmentEdge(host, child, childNode) {
    return {
        id: `${host.uid}.${child.field}#inline#${childNode.uid}`,
        kind: 'contains',
        from: {
            uid: host.uid,
            type: host.type,
            category: host.category,
            id: host.id,
            field: child.field,
            port: child.field,
            side: 'output',
            targets: [child.category],
            extract: 'inline',
            multi: true,
            sources: ['mapping'],
        },
        targetId: childNode.id,
        amount: null,
        out: {
            uid: host.uid,
            type: host.type,
            category: host.category,
            id: host.id,
            field: child.field,
            side: 'output',
            port: `output:${child.field}`,
        },
        in: {
            uid: childNode.uid,
            type: childNode.type,
            category: childNode.category,
            id: childNode.id,
            side: 'input',
            port: 'link',
        },
        status: 'pending',
        to: null,
    };
}

/**
 * 工具性包含关系：宿主字段 → 从该字段拆出的工具节点。
 *
 * 与内联数据条目的 contains 边共享形状，但工具节点没有数据 id；两端 uid 均明确，
 * resolveEdges 会直接将它解析为 resolved。
 *
 * @param {any} host - 宿主数据节点
 * @param {string} field - 产生工具节点的字段
 * @param {any} childNode - 工具节点
 * @returns {any} 工具节点的包含边
 */
function toolContainmentEdge(host, field, childNode) {
    return {
        id: `${host.uid}.${field}#tool#${childNode.uid}`,
        kind: 'contains',
        from: {
            uid: host.uid,
            type: host.type,
            category: host.category,
            id: host.id,
            field,
            port: field,
            side: 'output',
            targets: [childNode.category],
            extract: 'tool',
            multi: false,
            sources: ['mapping'],
        },
        targetId: '',
        amount: null,
        out: {
            uid: host.uid,
            type: host.type,
            category: host.category,
            id: host.id,
            field,
            side: 'output',
            port: `output:${field}`,
        },
        in: {
            uid: childNode.uid,
            type: childNode.type,
            category: childNode.category,
            id: childNode.id,
            side: 'input',
            port: 'link',
        },
        status: 'pending',
        to: null,
    };
}

/**
 * 组装中间态 JSON：组（根键 + 条目 list）→ 节点图（nodes / edges / external / warnings）。
 *
 * 流水线分工：`parse` 解析 JSON → **`mapping` 加连接、拆节点**（connectionsOf / splitInline）
 * → 本函数把两者的产物**融合**成中间态 JSON。前端拿它建 nodeModel，也可以反向把
 * nodeModel 导回这个形状（值 + 端口），再由后端按 mapping 补回连接需求写回 mod JSON。
 *
 * 第 ② 步建全部节点与待连接表 → 第 ③ 步在「本次解析范围」内解析连接。
 *
 * @param {Array<{ category: string; entries: any[]; relativePath?: string; file?: string }>} groups
 *        parse.filesToGroups / splitRootKeys 产物
 * @param {{
 *     source?: 'origin'|'mod';
 *     modId?: string;
 *     namespace?: string;
 *     scope?: 'file'|'global';
 *     originIds?: Set<string>|string[]|null;
 *     fileCount?: number;
 * }} [options] - 解析选项（originIds 用于区分 external-origin / external-mod）
 * @returns {{
 *     source: string; modId: string; namespace: string; scope: string;
 *     nodes: any[]; edges: any[]; external: any[]; warnings: string[];
 *     stats: { files: number; nodes: number; edges: number; resolved: number; externalOrigin: number; externalMod: number; danglingFields: number };
 * }} 节点图
 */
function buildGraph(groups, options = {}) {
    const source = options.source || 'mod';
    const modId = options.modId || '';
    const namespace = options.namespace || modId || 'mod';
    const scope = options.scope || 'global';

    /** @type {any[]} */
    const nodes = [];
    /** @type {any[]} */
    const pending = [];
    /** @type {Map<string, any>} uid → 节点（同一 id 的内联定义只建一次） */
    const byUid = new Map();

    (groups || []).forEach((group) => {
        (group.entries || []).forEach((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
            expandEntry(group.category, entry, { source, namespace, file: group.relativePath || group.file || '' }, {
                nodes,
                pending,
                byUid,
                depth: 0,
            });
        });
    });

    const index = buildIdIndex(nodes);
    // 融合时去重：内联定义已经被「包含关系」连线表达过了（宿主 → 拆出来的子节点），
    // 同宿主同字段再指向同一个目标就只留包含连线，不重复画两条
    const contained = new Set(
        pending.filter((e) => e.kind === 'contains').map((e) => `${e.from.uid}.${e.from.field}#${e.targetId}`)
    );
    const merged = pending.filter(
        (e) => e.kind === 'contains' || !contained.has(`${e.from.uid}.${e.from.field}#${e.targetId}`)
    );
    const { edges, external, warnings } = resolveEdges(merged, index, { ...options, scope });

    return {
        format: GRAPH_FORMAT,
        version: GRAPH_VERSION,
        source,
        modId,
        namespace,
        scope,
        nodes,
        edges,
        external,
        warnings,
        stats: {
            files: options.fileCount == null ? (groups || []).length : options.fileCount,
            nodes: nodes.length,
            edges: edges.length,
            resolved: edges.filter((e) => e.status === 'resolved').length,
            externalOrigin: external.filter((e) => e.status === EXTERNAL_ORIGIN).length,
            externalMod: external.filter((e) => e.status === EXTERNAL_MOD).length,
            danglingFields: warnings.length,
        },
    };
}

/**
 * ContentFiles（`parse.analyzeModJSON5` 的 `modInfo.content` 结构）→ 节点图。
 *
 * 读取/拆根键交给 parse（`filesToGroups`），本函数只做「建节点 + 连接性检测 + 解析连接」，
 * 解析范围 = 本次加载的所有文件（scope='global'，因此悬空端口会出告警）。
 *
 * @param {{ relativePath?: string; fileName?: string; data: any; error?: string|null }[]} contentFiles
 * @param {{
 *     source?: 'origin'|'mod';
 *     modId?: string;
 *     namespace?: string;
 *     scope?: 'file'|'global';
 *     originIds?: Set<string>|string[]|null;
 *     fallbackCategory?: string;
 * }} [options] - originIds：origin 条目 id 集合，用于区分 external-origin / external-mod；
 *                fallbackCategory：文件没有数组键时的类别兜底（一般给所在目录名）
 * @returns {ReturnType<typeof buildGraph> & { issues: { file: string; message: string }[] }} 节点图（含跳过文件说明）
 */
function contentFilesToData(contentFiles, options = {}) {
    const { groups, issues } = parse.filesToGroups(contentFiles, { fallbackCategory: options.fallbackCategory });
    const graph = buildGraph(groups, {
        ...options,
        scope: options.scope || 'global',
        fileCount: (contentFiles || []).length,
    });

    return { ...graph, issues };
}

/**
 * 读取 origin_resources 游戏基础内容（StreamingAssets/content/core）→ 节点图（source='origin'）。
 *
 * 文件遍历与 JSON5 解析由 parse 负责；解析范围为全部 origin 文件（scope='global'）。
 * origin 自身加载时没有 origin id 索引，未解析目标统一记为 `external-origin`。
 *
 * @param {string} originContentDir - .../content/core 绝对路径
 * @returns {ReturnType<typeof buildGraph> & {
 *     files: ReturnType<typeof parse.readAllJSONFilesSync>;
 *     issues: { file: string; message: string }[];
 * }} 节点图（含原始文件列表）
 */
function loadOriginData(originContentDir) {
    /** @type {ReturnType<typeof parse.readAllJSONFilesSync>} */
    const files = [];

    if (!originContentDir || !fs.existsSync(originContentDir)) {
        const empty = buildGraph([], { source: 'origin', modId: ORIGIN_NS, namespace: ORIGIN_NS, scope: 'global', fileCount: 0 });
        return { ...empty, files, issues: [{ file: originContentDir || '', message: 'origin 内容目录不存在' }] };
    }

    files.push(...parse.readAllJSONFilesSync(originContentDir));
    const { groups, issues } = parse.filesToGroups(files);
    const graph = buildGraph(groups, {
        source: 'origin',
        modId: ORIGIN_NS,
        namespace: ORIGIN_NS,
        scope: 'global',
        fileCount: files.length,
    });

    return { ...graph, files, issues };
}

/**
 * 收集节点图里的全部条目 id（不含类别）—— 供 mod 加载时区分 external-origin / external-mod。
 *
 * @param {{ nodes?: { id: string }[] } | null} graph - buildGraph / loadOriginData 产物
 * @returns {Set<string>} id 集合
 */
function collectIds(graph) {
    /** @type {Set<string>} */
    const ids = new Set();
    ((graph && graph.nodes) || []).forEach((node) => {
        if (node && node.id) ids.add(node.id);
    });
    return ids;
}

/**
 * 单个 mod json 文件 → 节点图（功能4：预览；引用可能缺失，仅用于预览）。
 *
 * 解析范围只限本文件（scope='file'）：连不上的目标不告警，只标成文件外节点
 * （`external-origin` / `external-mod`），供前端放进引入区。
 *
 * @param {string} filePath - 待预览的 json 文件绝对路径
 * @param {string} [modId] - 命名空间（默认用文件名）
 * @returns {ReturnType<typeof buildGraph> & {
 *     fileName: string;
 *     category: string;
 *     issues: { file: string; message: string }[];
 *     error?: string;
 * }} 节点图（含文件名与首个类别）
 */
function singleFileToData(filePath, modId) {
    const fileName = path.basename(filePath);
    const ns = modId || `file:${fileName.replace(/\.[^.]+$/, '')}`;

    const file = parse.readJSONFileSync(filePath);
    if (file.error || file.data == null) {
        const empty = buildGraph([], { source: 'mod', namespace: ns, scope: 'file', fileCount: 1 });
        return {
            ...empty,
            fileName,
            category: '',
            issues: [{ file: fileName, message: file.error || '文件为空' }],
            error: file.error || '文件为空',
        };
    }

    const { groups, issues } = parse.filesToGroups([file], {
        fallbackCategory: path.basename(path.dirname(filePath)),
        includeSingle: true, // 单对象条目文件也算一个节点
    });
    const graph = buildGraph(groups, { source: 'mod', namespace: ns, scope: 'file', fileCount: 1 });

    return { ...graph, fileName, category: groups.length ? groups[0].category : '', issues };
}

module.exports = {
    ORIGIN_NS,
    EXTERNAL_ORIGIN,
    EXTERNAL_MOD,
    GRAPH_FORMAT,
    GRAPH_VERSION,
    NODE_ROLE,
    EDGE_KINDS,
    namespaceKey,
    nodeUid,
    detectConnections,
    entryToNode,
    toolNode,
    buildIdIndex,
    buildPendingEdges,
    resolveEdges,
    buildGraph,
    collectIds,
    contentFilesToData,
    loadOriginData,
    singleFileToData,
    FileToData: singleFileToData,
};
