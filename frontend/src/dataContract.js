/**
 * frontend/src/dataContract.js —— core 数据契约（节点图）→ 前端内部形状的适配
 *
 * core 侧的契约为「后端只描述语义，不决定渲染」（见仓库 README／core 的 mapping.js）：
 *
 *   nodes: [{
 *     uid, id, type, category, title, file, source, refCount,
 *     // 每个字段一条：基础属性类型(kind) + 原始值(value) + 连接需求(links) + 中间态转化(materialize)
 *     props: [ { name, kind, value, links: [{ port, direction, targets, multi, extract }], materialize } ],
 *     connections: [...],
 *   }]
 *   edges: [{
 *     id, kind, targetId, amount, status: 'resolved' | 'external-*',
 *     from: { uid, field, port, side, targets, extract, ... },   // 引用关系本身
 *     out:  { uid, category, id, field?, side: 'output', port }, // 连接线**出**线端（已变换好）
 *     in:   { uid, category, id, field?, side: 'input',  port }, // 连接线**入**线端（已变换好）
 *   }]
 *
 * 本模块把它转成前端既有的内部形状，让铺图 / 连线 / 数据选择器这些链路不必知道契约细节：
 *
 *   props   → categories[type][{ id, title, category, file, source, fields, refs, props }]
 *              · `kind` 为 `string | number | boolean` → 进 `fields`（按名填属性）
 *              · `kind` 为 `list | dict`            → 进 `refs`（原始结构，前端按需渲染）
 *   edges   → links[{ from:{category,id,port,field}, to:{category,id,port,field} }]
 *              · `from` = 出线端（画在 output 端口），`to` = 入线端（画在 input 端口）；
 *                朝向已由后端变换完成（如 `alt` 的线是「目标 recipe → 本条目」），
 *                前端只按 `port` 落位，不再自己推断方向。
 *
 * ── 反向：前端 → 中间态（`nodeModelToContractNode` / `nodesToContractGraph`）──
 *
 * 上表是「后端 → 前端」；下面的逆向函数把画布上的节点模型翻译回契约里的中间态 JSON，
 * 供后端还原 mod 字段（后端 `snapshotToMod` 那一侧）。两者共用同一套字段语义：
 *
 * - `props[]` 一条 = 节点上一个属性：`kind` 优先取来源条目的声明、否则按当前值推，
 *   `value` 是当前值（来源 kind 为 `list`/`dict` 时会把被字符串化的值 JSON.parse 还原），
 *   `links` 是该字段的**连接需求**（优先用来源条目的声明，缺声明时由端口能力推）；
 * - 纯端口字段（没有值输入框的 inputs/outputs，`valueType` 为空）不进 `props`，只进 `connections`；
 * - 实际连线不进 `props`，一律汇总成 `edges`（出线端 `out` + 入线端 `in`，朝向取端口 direction）；
 * - 反查不到来源条目的节点（画布上手工建的 test / number 等）也能翻译：
 *   `id` 为空、`source` 记为 `editor`、`materialize` 为 null。
 */

import { ModDataRegistry } from './modDataRegistry.js';

/** 中间态 JSON 的形状标识（与 core 的 GRAPH_FORMAT / GRAPH_VERSION 对齐） */
export const CONTRACT_FORMAT = 'cne-node-graph';

/** 中间态 JSON 的版本号 */
export const CONTRACT_VERSION = 1;

/** 后端给的 kind → 前端内部「标量 / 复合」二分 */
function isScalarKind(kind) {
    return kind === 'string' || kind === 'number' || kind === 'boolean';
}

/**
 * 属性定义（props）→ 前端内部形状的字段拆分
 *
 * @param {Array<{ name: string; kind: string; value: any }>} props - 后端给的属性定义
 * @returns {{ fields: Record<string, any>; refs: Record<string, any> }} 标量 / 复合字段
 */
export function splitProps(props) {
    /** @type {Record<string, any>} */
    const fields = {};
    /** @type {Record<string, any>} */
    const refs = {};

    (props || []).forEach((prop) => {
        if (!prop || !prop.name) return;
        if (isScalarKind(prop.kind)) fields[prop.name] = prop.value;
        else refs[prop.name] = prop.value;
    });

    return { fields, refs };
}

/**
 * 文件外节点（`external` / 未解析的边）→ 按「目标类别 + 目标 id」合并
 *
 * 悬空端口节点按这个结果建：同一个目标被多个宿主字段引用时只建一个节点（多连线）。
 *
 * @param {any[] | undefined} external - 契约的 `external` 数组
 * @param {any[] | undefined} edges - 契约的 `edges`（`external` 缺失时回退到 `status !== 'resolved'` 的那些）
 * @returns {Array<{ key: string; targetId: string; category: string; targets: string[]; status: string; refs: any[] }>}
 */
function mergeExternals(external, edges) {
    const list =
        Array.isArray(external) && external.length
            ? external
            : (edges || []).filter((edge) => edge && edge.status && edge.status !== 'resolved');
    /** @type {Map<string, any>} */
    const byKey = new Map();

    list.forEach((edge) => {
        if (!edge || !edge.targetId) return;
        const from = edge.from || {};
        const targets = Array.isArray(from.targets) ? from.targets : [];
        const category = targets[0] || from.category || '';
        const key = `${category}:${edge.targetId}`;
        if (!byKey.has(key)) {
            byKey.set(key, {
                key,
                targetId: String(edge.targetId),
                category,
                targets,
                status: edge.status || '',
                refs: [],
            });
        }
        byKey.get(key).refs.push({
            uid: from.uid,
            category: from.category,
            id: from.id,
            field: from.field,
            side: from.side,
            port: from.port,
            amount: edge.amount == null ? null : edge.amount,
        });
    });

    return Array.from(byKey.values());
}

/**
 * 节点图 → 数据池 + 连接候选
 *
 * 传入的若不是节点图（例如调试时手工构造的旧形状）则原样返回，方便本地排查。
 *
 * @param {any} data - 后端回发的节点图
 * @returns {any} `{ namespace, source, count, categories, links, externals }`（或原样返回的入参）
 */
export function graphToDataPool(data) {
    if (!data || !Array.isArray(data.nodes)) return data;

    /** @type {Record<string, any[]>} */
    const categories = {};
    data.nodes.forEach((node) => {
        if (!node || typeof node !== 'object') return;
        const type = node.type || node.category || 'misc';
        const { fields, refs } = splitProps(node.props);
        (categories[type] = categories[type] || []).push({
            id: node.id,
            uid: node.uid,
            title: node.title,
            category: type,
            file: node.file,
            source: node.source,
            fields,
            refs,
            // 原始属性定义也带上：端口能力 / 连接需求（links[].targets）由前端按它建端口
            props: node.props || [],
            // 内联拆分来源（core 的 node.inline）：导出时据此还原 contains 边 / 内联回宿主字段
            inline: node.inline || null,
        });
    });

    // 只有已解析的连接线两端都在本图内；external（跨文件引用）暂不画线
    const links = (data.edges || [])
        .filter((edge) => edge && edge.status === 'resolved' && edge.out && edge.in && edge.out.uid && edge.in.uid)
        .map((edge) => ({
            // from = 出线端（output 侧），to = 入线端（input 侧）—— 朝向由后端变换好
            from: {
                category: edge.out.category || edge.out.type,
                id: edge.out.id,
                field: edge.out.field || '',
                port: edge.out.port || '',
            },
            to: {
                category: edge.in.category || edge.in.type,
                id: edge.in.id,
                field: edge.in.field || '',
                port: edge.in.port || '',
            },
        }));

    return {
        namespace: data.namespace,
        source: data.source,
        count: data.count,
        categories,
        links,
        // 文件外节点（悬空端口节点按它建：只有端口 + 可跳转）
        externals: mergeExternals(data.external, data.edges),
    };
}

/* ────────────────────── 逆向：前端节点模型 → 中间态 JSON ────────────────────── */

/**
 * 原始值 → 基础属性类型（与 core `mapping.kindOf` 同一套判定）
 *
 * @param {any} value - 任意原始值
 * @returns {'null'|'list'|'string'|'number'|'boolean'|'dict'} 基础属性类型
 */
export function kindOfValue(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'list';
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return t;
    if (t === 'object') return 'dict';
    return 'string';
}

/**
 * 节点的全部叶子属性
 *
 * `NodeModel.properties` 是 getter：端口 hub（inputs/outputs）+ 常驻属性 + 当前模式属性 +
 * 已激活的可选属性 —— 这里递归展开 hub（容器自身不是属性，空 hub 直接丢掉），
 * 得到真正带值 / 带端口的那些属性。
 *
 * ⚠️ 落在「可选属性」池里、当前未勾选的字段**不在这里**（节点上没加载 = 没有当前值），
 * 它们在 `nodeModelToContractNode` 的第二步用来源条目的值补齐。
 *
 * @param {any} nodeModel - 节点模型
 * @returns {any[]} 叶子属性列表
 */
function leafPropsOf(nodeModel) {
    /** @type {any[]} */
    const out = [];
    const seen = new Set();

    /**
     * @param {any} prop - 待展开的属性
     */
    const visit = (prop) => {
        if (!prop || seen.has(prop)) return;
        seen.add(prop);
        // HubProp（有 addProp）是容器：展开子属性，自身不当作属性
        if (typeof prop.addProp === 'function') {
            ((prop.properties || prop.detailProperties) || []).forEach(visit);
            return;
        }
        out.push(prop);
    };

    ((nodeModel && nodeModel.properties) || []).forEach(visit);
    return out;
}

/**
 * 属性名：`name` 缺省（'undefined'）时退化到 label
 *
 * @param {any} prop - 属性
 * @returns {string}
 */
function propNameOf(prop) {
    if (!prop) return '';
    const name = prop.name && prop.name !== 'undefined' ? String(prop.name) : '';
    return name || String(prop.label || '');
}

/**
 * 端口 → 所属节点模型（端口属性的 `parentNode` 是 WeakRef）
 *
 * @param {any} port - PortModel
 * @returns {any|null} 节点模型
 */
function ownerNodeOfPort(port) {
    const prop = port && port.parentProp;
    const ref = prop && prop.parentNode;
    if (ref && typeof ref.deref === 'function') return ref.deref();
    return ref || null;
}

/**
 * 节点在数据池里的来源条目（按「类别 + 数据 id」反查）
 *
 * 反查得到的是 core 交付的原始属性定义 —— `link` / `materialize` / `kind` 这些
 * 前端渲染层推不出来的语义信息只能从这里取。
 *
 * @param {any} nodeModel - 节点模型
 * @returns {any|null} 数据池条目
 */
function sourceEntryOf(nodeModel) {
    if (!nodeModel) return null;
    const dataId = nodeModel.dataId == null ? '' : String(nodeModel.dataId);
    if (!dataId || !nodeModel.type) return null;
    const entries = ModDataRegistry.getEntries(String(nodeModel.type)) || [];
    return entries.find((item) => item && item.id != null && String(item.id) === dataId) || null;
}

/** 来源条目的缓存（导出时每条属性 / 每条连线都要反查，避免重复线性搜索） */
const __entryCache = new WeakMap();

/**
 * 带缓存的来源条目反查
 *
 * @param {any} nodeModel - 节点模型
 * @returns {any|null} 数据池条目
 */
function cachedEntryOf(nodeModel) {
    if (!nodeModel || typeof nodeModel !== 'object') return null;
    if (!__entryCache.has(nodeModel)) __entryCache.set(nodeModel, sourceEntryOf(nodeModel));
    return __entryCache.get(nodeModel) || null;
}

/**
 * 来源条目里同名字段（大小写不敏感）的属性定义
 *
 * @param {any} entry - 数据池条目
 * @param {string} name - 字段名
 * @returns {any|null}
 */
function declaredPropOf(entry, name) {
    const props = (entry && entry.props) || [];
    const lower = String(name).toLowerCase();
    return props.find((item) => item && item.name && String(item.name).toLowerCase() === lower) || null;
}

/**
 * 字段的连接需求声明（兼容 core 新旧两种 props 形态）
 *
 * - 新契约（`mapping.new.js`）：`props[].link` = `{ direction, targets, multi, extract, keys }`
 * - 前端契约注释的形态：`props[].links` = 同上数组（一个字段两侧都声明时会有两条）
 * - 现网形态（`mapping.js`）：端口属性把声明摊在属性上（`direction` / `requireType` /
 *   `returnType` / `multiConnect` / `extract` / `keys`）
 *
 * @param {any} entry - 数据池条目
 * @param {string} name - 字段名
 * @returns {any[]} 归一后的连接需求列表（无声明 = 空数组）
 */
function declaredLinksOf(entry, name) {
    const hit = declaredPropOf(entry, name);
    if (!hit) return [];

    /** @type {any[]} */
    const list = [];
    if (hit.link) list.push({ ...hit.link });
    if (Array.isArray(hit.links)) hit.links.forEach((item) => item && list.push({ ...item }));

    if (!list.length && hit.type === 'port') {
        list.push({
            direction: hit.direction === 'output' ? 'output' : 'input',
            targets: [hit.requireType || hit.returnType || 'any'],
            multi: hit.multiConnect !== false,
            extract: hit.extract || null,
            ...(hit.keys ? { keys: hit.keys } : {}),
        });
    }

    return list;
}

/**
 * 字段的基础属性类型声明（只认契约里的 kind，渲染类型如 `text` 不当作 kind）
 *
 * @param {any} entry - 数据池条目
 * @param {string} name - 字段名
 * @returns {string|null}
 */
function declaredKindOf(entry, name) {
    const hit = declaredPropOf(entry, name);
    if (!hit) return null;
    if (hit.kind) return hit.kind;
    if (['string', 'number', 'boolean', 'list', 'dict', 'null'].includes(hit.type)) return hit.type;
    return null;
}

/**
 * 字段的中间态转化声明（`{ as: 'node' | 'tool', type, inline? }`）
 *
 * @param {any} entry - 数据池条目
 * @param {string} name - 字段名
 * @returns {any|null}
 */
function declaredMaterializeOf(entry, name) {
    const hit = declaredPropOf(entry, name);
    return (hit && hit.materialize) || null;
}

/**
 * 值还原：来源声明是 `list` / `dict` 时，把被字符串化的原始值 JSON.parse 回来
 *
 * 导入路径（`nodeManager._fillNodeFromData`）对端口 / 复合字段用了 `JSON.stringify`，
 * 严格 JSON 之外的内容（如 Fucine 表达式）parse 失败则原样保留。
 *
 * @param {any} rawValue - 属性当前值
 * @param {string|null} kindHint - 来源声明的 kind
 * @returns {any}
 */
function restoreValue(rawValue, kindHint) {
    if ((kindHint === 'list' || kindHint === 'dict') && typeof rawValue === 'string') {
        try {
            return JSON.parse(rawValue);
        } catch {
            return rawValue;
        }
    }
    return rawValue;
}

/**
 * 数据条目的 id（节点上的 `dataId` 优先，其次来源条目）
 *
 * @param {any} nodeModel - 节点模型
 * @param {any} [entry] - 来源条目
 * @returns {string}
 */
function dataIdOf(nodeModel, entry) {
    const fromNode = nodeModel && nodeModel.dataId != null ? String(nodeModel.dataId) : '';
    if (fromNode) return fromNode;
    return entry && entry.id != null ? String(entry.id) : '';
}

/**
 * 契约里的 uid（core 给的稳定键，如 `origin:recipes:r1`）
 *
 * 画布上的 `nodeModel.uid` 是运行时分配的数字、重建后就会变，所以**导出时必须优先用
 * 来源条目的 uid**（`inline.hostUid` 引用的也是它）；手工创建的节点没有来源，才回退画布 uid。
 *
 * @param {any} nodeModel - 节点模型
 * @param {any} [entry] - 来源条目
 * @returns {string|number} uid
 */
function contractUidOf(nodeModel, entry) {
    if (entry && entry.uid) return entry.uid;
    return nodeModel ? nodeModel.uid : '';
}

/**
 * 该节点是不是「数据节点」（从数据池来的）
 *
 * 判定的反面就是**前端变量节点**：文本变量（`text` / `number` / `images` 等，用于值同步）
 * 以及画布上手工建的 `test` / `blank`。它们是前端自己的工具，不属于后端数据模型，
 * 与数据字段之间的连线是设计内的值同步（值已随属性同步，导出前 flush 一次即可）。
 *
 * @param {any} nodeModel - 节点模型
 * @returns {boolean}
 */
function isDataNode(nodeModel) {
    if (!nodeModel) return false;
    if (cachedEntryOf(nodeModel)) return true;
    return Boolean(nodeModel.dataId);
}

/**
 * 告警明细里的节点描述（`recipes:r1` 形式）
 *
 * @param {any} nodeModel - 节点模型
 * @returns {string}
 */
function describeNode(nodeModel) {
    if (!nodeModel) return '?';
    const id = dataIdOf(nodeModel) || (nodeModel.uid == null ? '' : String(nodeModel.uid));
    return `${nodeModel.type || 'unknown'}:${id || '未命名'}`;
}

/**
 * 端语义：一个端口在契约里代表哪一侧 / 能连什么 / 取值方式
 *
 * 契约的 `direction` 是「**本条目在这条线上是哪一侧**」（`input` = 别的东西指向我），
 * 所以以来源声明为准；模板没按 mapping 建端口时回退画布端口方向，并把两者都带出来。
 *
 * @param {any} node - 端口所属节点模型
 * @param {any} port - PortModel
 * @returns {Record<string, any>} 端信息
 */
function portEndOf(node, port) {
    const prop = port.parentProp || null;
    const name = propNameOf(prop);
    const entry = cachedEntryOf(node);
    const declaredList = declaredLinksOf(entry, name);
    const canvasSide = port.direction === 'output' ? 'output' : 'input';
    const declared =
        declaredList.find((item) => (item.direction === 'output' ? 'output' : 'input') === canvasSide) || declaredList[0] || null;

    return {
        node,
        port,
        name,
        uid: contractUidOf(node, entry),
        canvasSide,
        side: declared && (declared.direction === 'input' || declared.direction === 'output') ? declared.direction : canvasSide,
        targets: (declared && declared.targets) || (port.dataType && port.dataType !== 'any' ? [port.dataType] : []),
        extract: (declared && declared.extract) || null,
        multi: declared && declared.multi !== undefined ? declared.multi : port.maxLinks !== 1,
        sources: declared ? [declared.plugin || 'mapping'] : [],
        hasDeclaration: Boolean(declared),
    };
}

/**
 * 判定一条连线两端的语义侧：`[out, in]`
 *
 * 规则（按契约「direction = 本条目在这条线上是哪一侧」）：
 *   1. 只有一端有声明 → 完全按声明定侧（另一端取反），不看画布端口画在哪边；
 *   2. 两端都有声明且不冲突 → 按声明定侧；
 *   3. 都没声明、或两端声明冲突 → 回退画布端口方向；仍判不出则返回 [null, null]（丢弃该边）。
 *
 * @param {Record<string, any>} endA - 一端
 * @param {Record<string, any>} endB - 另一端
 * @returns {[Record<string, any>|null, Record<string, any>|null]} [出线端, 入线端]
 */
function resolveSides(endA, endB) {
    if (endA.hasDeclaration && endB.hasDeclaration) {
        if (endA.side !== endB.side) return endA.side === 'output' ? [endA, endB] : [endB, endA];
    } else if (endA.hasDeclaration) {
        return endA.side === 'output' ? [endA, endB] : [endB, endA];
    } else if (endB.hasDeclaration) {
        return endB.side === 'output' ? [endB, endA] : [endA, endB];
    } else if (endA.canvasSide === 'output' && endB.canvasSide !== 'output') {
        return [endA, endB];
    } else if (endB.canvasSide === 'output' && endA.canvasSide !== 'output') {
        return [endB, endA];
    }
    return [null, null];
}

/**
 * 一条连线 → 契约里的 edge（引用关系 `from` + 两端 `out` / `in` + 目标 `to`）
 *
 * 朝向：`direction` 是「本条目在这条线上是哪一侧」，所以 `out` / `in` 由**声明的**方向定，
 * 而不是画布上端口画在哪一侧 —— `alt` / `linked` / `inductions` 的跳转条件写在目标身上
 * （声明 `direction: 'input'`），后端交给前端时已经变换成「目标 → 本条目」，导出时按同一套语义还原。
 *
 * @param {Record<string, any>} endA - 一端（`portEndOf` 结果）
 * @param {Record<string, any>} endB - 另一端
 * @returns {Record<string, any>|null} edge
 */
function buildEdge(endA, endB) {
    const [out, inEnd] = resolveSides(endA, endB);
    if (!out || !inEnd) return null;

    // from = 引用关系本身（声明所在的那一端）
    const fromEnd = endA.hasDeclaration ? endA : endB.hasDeclaration ? endB : null;
    // 没有 mapping 声明 → 不是契约里的引用关系（如文本变量同步线），导出时跳过
    if (!fromEnd) return null;

    const outId = dataIdOf(out.node);
    const inId = dataIdOf(inEnd.node);
    // 契约里 targetId / to 指的是「引用目标」（出线端），与 from.side 无关：
    // alt 这类声明成 input 的关系，出线端是目标条目，targetId 才是那个目标。
    const targetId = outId;
    // 端口 key = `<side>:<端口名>`，只有声明那侧知道端口名；目标端统一走通用入口 `link`
    const isSelf = (end) => end === fromEnd;
    const portOf = (end) => (isSelf(end) ? `${end.side}:${fromEnd.name}` : 'link');

    return {
        id: `${fromEnd.uid}.${fromEnd.name}#${fromEnd.side}#${targetId}`,
        kind: 'link',
        from: {
            uid: fromEnd.uid,
            type: fromEnd.node.type,
            category: fromEnd.node.type,
            id: dataIdOf(fromEnd.node),
            field: fromEnd.name,
            port: fromEnd.name,
            side: fromEnd.side,
            targets: fromEnd.targets,
            extract: fromEnd.extract,
            multi: fromEnd.multi,
            sources: fromEnd.sources,
        },
        targetId,
        amount: null,
        out: {
            uid: out.uid,
            type: out.node.type,
            category: out.node.type,
            id: outId,
            ...(isSelf(out) ? { field: fromEnd.name } : {}),
            side: 'output',
            port: portOf(out),
        },
        in: {
            uid: inEnd.uid,
            type: inEnd.node.type,
            category: inEnd.node.type,
            id: inId,
            ...(isSelf(inEnd) ? { field: fromEnd.name } : {}),
            side: 'input',
            port: portOf(inEnd),
        },
        status: 'resolved',
        to: { uid: out.uid, type: out.node.type, category: out.node.type, id: outId },
    };
}

/**
 * 包含连线（`kind: 'contains'`）：宿主条目 → 它内联定义拆出来的子节点
 *
 * 只靠端口连线认不出「这是谁拆出来的」，所以子节点上带了 core 给的 `inline`
 * （`{ hostUid, hostCategory, hostId, field, index, syntheticId }`），本函数据此还原。
 * 出线端 = 宿主的 `output:<字段名>`，入线端 = 子节点的通用入口 `link`。
 *
 * @param {any} child - 子节点模型
 * @param {Record<string, any>} inline - 子节点上的 `inline` 元数据
 * @returns {Record<string, any>} contains 边
 */
function buildContainsEdge(child, inline) {
    const childType = String(child.type || '');
    const childId = dataIdOf(child);
    const childUid = contractUidOf(child, cachedEntryOf(child));
    const hostType = String(inline.hostCategory || '');
    return {
        id: `${inline.hostUid}.${inline.field}#inline#${childUid}`,
        kind: 'contains',
        from: {
            uid: inline.hostUid,
            type: hostType,
            category: hostType,
            id: inline.hostId == null ? '' : String(inline.hostId),
            field: inline.field,
            port: inline.field,
            side: 'output',
            targets: [childType],
            extract: 'inline',
            multi: true,
            sources: ['mapping'],
        },
        targetId: childId,
        amount: null,
        out: {
            uid: inline.hostUid,
            type: hostType,
            category: hostType,
            id: inline.hostId == null ? '' : String(inline.hostId),
            field: inline.field,
            side: 'output',
            port: `output:${inline.field}`,
        },
        in: {
            uid: childUid,
            type: childType,
            category: childType,
            id: childId,
            side: 'input',
            port: 'link',
        },
        status: 'resolved',
        to: { uid: childUid, type: childType, category: childType, id: childId },
    };
}

/**
 * 前端节点模型 → 中间态节点 JSON（契约里的 nodes 元素）
 *
 * @param {any} nodeModel - 节点模型（NodeModel）
 * @param {{ entry?: any; namespace?: string; source?: string; file?: string }} [options]
 *   - `entry` 可显式指定来源条目，缺省按「类别 + dataId」从数据池反查
 * @returns {{
 *     uid: number | string;
 *     id: string;
 *     type: string;
 *     category: string;
 *     title: string;
 *     file: string;
 *     source: string;
 *     refCount: number;
 *     props: any[];
 *     connections: any[];
 * }} 中间态节点
 */
export function nodeModelToContractNode(nodeModel, options = {}) {
    const entry = options.entry || sourceEntryOf(nodeModel);
    const category = String((nodeModel && nodeModel.type) || (entry && entry.category) || 'misc');
    const id = dataIdOf(nodeModel, entry);

    /** @type {any[]} */
    const props = [];
    /** @type {any[]} */
    const connections = [];
    let refCount = 0;

    /** 已翻译的字段名（小写），供第二步去重 */
    const handled = new Set();

    leafPropsOf(nodeModel).forEach((prop) => {
        const name = propNameOf(prop);
        if (!name) return;
        handled.add(name.toLowerCase());

        const ports = [prop.inputPort, prop.outputPort].filter(Boolean);
        const declaredList = declaredLinksOf(entry, name);
        const declaredFor = (port) => {
            const direction = port.direction === 'output' ? 'output' : 'input';
            return declaredList.find((d) => (d.direction === 'output' ? 'output' : 'input') === direction) || declaredList[0] || null;
        };
        const targetsOf = (port) => {
            const declared = declaredFor(port);
            return (declared && declared.targets) || (port.dataType && port.dataType !== 'any' ? [port.dataType] : []);
        };
        const multiOf = (port) => {
            const declared = declaredFor(port);
            return declared && declared.multi !== undefined ? declared.multi : port.maxLinks !== 1;
        };
        const extractOf = (port) => {
            const declared = declaredFor(port);
            return (declared && declared.extract) || null;
        };
        const sourcesOf = (port) => {
            const declared = declaredFor(port);
            return declared && declared.plugin ? [declared.plugin] : [];
        };
        // 语义方向以来源声明为准（模板上的端口方向只影响渲染），两者不一致时在 portSide 里留痕
        const sideOf = (port) => {
            const declared = declaredFor(port);
            if (declared && (declared.direction === 'input' || declared.direction === 'output')) return declared.direction;
            return port.direction === 'output' ? 'output' : 'input';
        };
        const portSideOf = (port) => (port.direction === 'output' ? 'output' : 'input');

        ports.forEach((port) => {
            refCount += (port.links || []).length;
            connections.push({
                field: name,
                port: name,
                side: sideOf(port),
                portSide: portSideOf(port), // 诊断用：画布端口方向；与 side 不一致 = 模板没按 mapping 建端口
                targets: targetsOf(port),
                extract: extractOf(port),
                multi: multiOf(port),
                sources: sourcesOf(port),
                targetIds: (port.links || []).map((peer) => dataIdOf(ownerNodeOfPort(peer))).filter((value) => value !== ''),
            });
        });

        const declared = declaredPropOf(entry, name);
        const declaredValue = declared ? declared.value : undefined;
        const current = prop.value;
        const hasCurrent = current !== undefined && current !== null && current !== '';

        // 纯端口（`type:'port'`、没有值输入框、来源也没有值，如 prerequisite / alt）只表达连接性。
        // ⚠️ 两种情况必须交付为属性：
        //   ① 普通属性（number / text…）即便带输入端口（能接前端变量节点做值同步），那也是属性；
        //   ② 模板做成了纯端口、但来源字段本身有值（如 recipes.effects 的 `{lantern:1}`）——
        //      不交付就等于把这个值丢掉。
        if (prop.type === 'port' && !prop.valueType && declaredValue === undefined) return;

        const kindHint = declaredKindOf(entry, name);
        // 节点上没值（模板没给默认值 / 数据没填进来）时，用来源条目的值兜底
        const value = restoreValue(hasCurrent ? current : declaredValue, kindHint);
        props.push({
            name,
            kind: kindHint || kindOfValue(value),
            value,
            // 连接需求：每个端口一条（声明优先，缺声明时由端口能力推）
            links: ports.map((port) => ({
                port: name,
                direction: sideOf(port),
                targets: targetsOf(port),
                multi: multiOf(port),
                extract: extractOf(port),
            })),
            materialize: declaredMaterializeOf(entry, name),
        });
    });

    // 第二步：来源条目里有、节点上没加载的字段（落在「可选属性」池里未勾选，或模板未覆盖）。
    // 这些字段在画布上没有当前值，用来源条目的值补齐 —— 否则导出时会被静默丢掉。
    ((entry && entry.props) || []).forEach((decl) => {
        if (!decl || !decl.name) return;
        const name = String(decl.name);
        if (handled.has(name.toLowerCase())) return;
        handled.add(name.toLowerCase());

        const links = declaredLinksOf(entry, name).map((item) => ({
            port: name,
            direction: item.direction === 'output' ? 'output' : 'input',
            targets: item.targets || [],
            multi: item.multi !== undefined ? item.multi : true,
            extract: item.extract || null,
            plugin: item.plugin || null,
        }));

        props.push({
            name,
            kind: decl.kind || kindOfValue(decl.value),
            value: decl.value,
            links,
            materialize: decl.materialize || null,
        });

        if (!decl.link && !Array.isArray(decl.links)) return; // 没声明连接需求的字段不进 connections
        links.forEach((link) => {
            connections.push({
                field: name,
                port: name,
                side: link.direction,
                portSide: link.direction,
                targets: link.targets,
                extract: link.extract,
                multi: link.multi,
                sources: link.plugin ? [link.plugin] : [],
                targetIds: [], // 节点上还（在属性池里，未加载），自然没有连线
            });
        });
    });

    return {
        uid: contractUidOf(nodeModel, entry),
        id,
        type: category,
        category,
        title: (nodeModel && (nodeModel.title || nodeModel.label)) || id,
        file: options.file || (entry && entry.file) || '',
        // 数据来源；前端变量节点 / 手工建的 test 等）没有来源，记为 editor
        source: options.source || (entry && entry.source) || 'editor',
        refCount,
        // 内联拆分来源（core 的 node.inline；根节点为 null）：保留 id 供身份 / 对账，
        // 「要不要把合成 id 写回数据」由后端看 inline.syntheticId 决定
        inline: (nodeModel && nodeModel.inline) || null,
        props,
        connections,
    };
}

/**
 * 一批节点模型 → 中间态节点图（`nodes` + `edges`）
 *
 * `edges` 由节点自身的端口连线推导（不依赖 ConnectionManager，便于离线/测试使用），
 * 朝向取端口 `direction`：出线端一定是 output 那一侧 —— 与 `graphToDataPool` 的
 * 「from = 出线端」约定一致。
 *
 * @param {Iterable<any>} nodes - 节点模型集合（如 `nodeManager.nodes.values()`）
 * @param {{ namespace?: string; source?: string }} [options]
 * @returns {{ source: string; namespace: string; count: number; nodes: any[]; edges: any[]; stats: Record<string, number> }}
 */
export function nodesToContractGraph(nodes, options = {}) {
    const list = Array.from(nodes || []).filter(Boolean);
    const contractNodes = list.map((model) => nodeModelToContractNode(model, options));
    /** @type {any[]} */
    const edges = [];
    /** @type {string[]} */
    const warnings = [];
    const seen = new Set();
    /** @type {Array<{ from: any; to: any; field: string }>} 跳过（无 mapping 声明）的连线 */
    const skipped = [];

    list.forEach((model) => {
        // 包含连线（宿主 → 拆出来的子节点）：子节点上带 core 给的 inline 元数据，直接还原
        if (model.inline && model.inline.hostUid) edges.push(buildContainsEdge(model, model.inline));

        leafPropsOf(model).forEach((prop) => {
            [prop.inputPort, prop.outputPort].forEach((port) => {
                if (!port) return;
                (port.links || []).forEach((peer) => {
                    // 同一条线会被两端各遍历一次，按端口 id 去重
                    const key = [String(port.id), String(peer && peer.id)].sort().join('|');
                    if (seen.has(key)) return;
                    seen.add(key);

                    const peerNode = ownerNodeOfPort(peer);
                    if (!peerNode) return;
                    const edge = buildEdge(portEndOf(model, port), portEndOf(peerNode, peer));
                    if (edge) edges.push(edge);
                    else skipped.push({ from: model, to: peerNode, field: propNameOf(prop) });
                });
            });
        });
    });

    // 跳过的连线里只有「数据 ↔ 数据」才是问题（缺 mapping 声明，写不回数据）；
    // 「数据 ↔ 前端变量节点」（文本变量 / 列表·字典变量）是设计内的值同步线（值已随属性同步，
    // 导出前 flush 一次即可），不告警。
    const dataToData = skipped.filter((item) => isDataNode(item.from) && isDataNode(item.to));
    const detailLimit = 20;
    dataToData.slice(0, detailLimit).forEach((item) => {
        warnings.push(
            `数据↔数据连线缺 mapping 声明（导出时已跳过）：${describeNode(item.from)}.${item.field} → ${describeNode(item.to)}`
        );
    });
    if (dataToData.length > detailLimit) {
        warnings.push(`…另有 ${dataToData.length - detailLimit} 条同类连线（缺 mapping 声明）`);
    }

    return {
        format: CONTRACT_FORMAT,
        version: CONTRACT_VERSION,
        source: options.source || (contractNodes[0] && contractNodes[0].source) || 'editor',
        namespace: options.namespace || '',
        count: contractNodes.length,
        nodes: contractNodes,
        edges,
        external: [], // 导出侧不含文件外节点：连不上的目标不在画布上（那是导入方向的概念）
        warnings,
        stats: {
            files: 0,
            nodes: contractNodes.length,
            edges: edges.length,
            resolved: edges.length,
            externalOrigin: 0,
            externalMod: 0,
            danglingFields: 0,
            props: contractNodes.reduce((n, node) => n + node.props.length, 0),
        },
    };
}
