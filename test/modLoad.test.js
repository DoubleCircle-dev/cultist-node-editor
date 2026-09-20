const assert = require('assert');
const path = require('path');

const modLoad = require('../core/modLoad');
const toData = require('../core/modLoad/toData');
const parse = require('../core/modLoad/parse');
const mapping = require('../core/modLoad/mapping');

/**
 * 数据加载流水线测试（扩展示主集成测试，跑真实 VS Code 里的 Node 环境）
 *
 * 覆盖 core/modLoad 的三段式流水线：
 *   ① parse  ：读文件 → 整份 JSON → 拆最外围键（键 = 前端节点类型）
 *   ② toData ：每个元素 → 与键同名的节点；字段过连接性检测 → 连接线节点（pending）
 *   ③ toData ：全部节点建完后解析连接；连不上 = 文件外节点（external-origin / external-mod），
 *              全局解析时另出「端口悬空」告警
 *
 * 断言尽量写成「结构性」的（数量关系 / 不变量），只有少量与仓库内固定数据相关的下界，
 * 以免 origin 数据更新时误报。
 */

const EXT_ROOT = path.resolve(__dirname, '..');
const ORIGIN_CORE = path.join(EXT_ROOT, 'core', 'origin_resources', 'StreamingAssets', 'content', 'core');
const FIXTURE_MOD = path.join(EXT_ROOT, 'test', 'fixtures', 'sample-mod');
const ASCENSION = path.join(ORIGIN_CORE, 'recipes', 'ascension.json');

suite('modLoad 数据加载流水线', () => {
    test('① parse.splitRootKeys：集合文件按最外围键拆成组', () => {
        const split = parse.splitRootKeys({ recipes: [{ id: 'a' }, { id: 'b' }] });
        assert.strictEqual(split.mode, 'collection');
        assert.strictEqual(split.groups.length, 1);
        assert.strictEqual(split.groups[0].category, 'recipes');
        assert.strictEqual(split.groups[0].entries.length, 2);
    });

    test('① parse.splitRootKeys：多个最外围键 → 多组；单对象文件 → 整份当一个条目', () => {
        const multi = parse.splitRootKeys({ recipes: [{ id: 'a' }], elements: [{ id: 'e' }] });
        assert.deepStrictEqual(
            multi.groups.map((g) => g.category),
            ['recipes', 'elements']
        );

        const single = parse.splitRootKeys({ name: 'mod', version: '1.0.0' }, { category: 'synopsis' });
        assert.strictEqual(single.mode, 'single-object');
        assert.strictEqual(single.groups[0].isArray, false);
        assert.strictEqual(single.groups[0].category, 'synopsis');
    });

    test('① parse.filesToGroups：类别取最外围键，文件信息随组带出', () => {
        const { groups } = parse.filesToGroups([
            { relativePath: 'recipes/a.json', fileName: 'a.json', data: { recipes: [{ id: 'a' }] } },
            { relativePath: 'elements/e.json', fileName: 'e.json', data: { elements: [{ id: 'e' }] } },
        ]);
        assert.deepStrictEqual(
            groups.map((g) => g.category),
            ['recipes', 'elements']
        );
        assert.strictEqual(groups[0].relativePath, 'recipes/a.json');
    });

    test('① parse.filesToGroups：无条目列表的文件（如 synopsis.json）被跳过并记录', () => {
        const { groups, issues } = parse.filesToGroups([
            { relativePath: 'synopsis.json', fileName: 'synopsis.json', data: { name: 'x' } },
        ]);
        assert.strictEqual(groups.length, 0);
        assert.strictEqual(issues.length, 1);
    });

    test('② toData.buildGraph：节点类型 = 最外围键，标量进 fields、引用字段进 connections', () => {
        const graph = toData.buildGraph(
            [
                {
                    category: 'recipes',
                    relativePath: 'recipes/a.json',
                    entries: [
                        {
                            id: 'r1',
                            label: '研习',
                            warmup: 10,
                            requirements: { e1: 1 },
                            effects: { e2: 2 },
                            linked: [{ id: 'r2' }],
                        },
                        { id: 'r2', label: '后续' },
                        { id: 'e1', label: '元素1' },
                        { id: 'e2', label: '元素2' },
                    ],
                },
                { category: 'elements', relativePath: 'elements/e.json', entries: [] },
            ],
            { namespace: 'test', scope: 'global' }
        );

        const r1 = graph.nodes.find((n) => n.id === 'r1');
        assert.strictEqual(r1.type, 'recipes');
        assert.strictEqual(r1.category, 'recipes');
        assert.strictEqual(r1.uid, 'test:recipes:r1');
        // 属性：每个字段一条 { name, kind, value, links, materialize }（value 是原始值，不加工）
        const warmup = r1.props.find((p) => p.name === 'warmup');
        assert.strictEqual(warmup.kind, 'number');
        assert.strictEqual(warmup.value, 10);
        assert.deepStrictEqual(warmup.links, [], '没人声明的字段只有原始值，没有连接需求');
        const reqs = r1.props.find((p) => p.name === 'requirements');
        assert.strictEqual(reqs.kind, 'dict');
        assert.deepStrictEqual(reqs.value, { e1: 1 }, '原始值原样给出（不字符串化）');
        assert.strictEqual(reqs.links[0].targets[0], 'elements', '连接需求里带目标类别');

        const fields = r1.connections.map((c) => `${c.side}:${c.port}`).sort();
        assert.deepStrictEqual(fields, ['input:linked', 'input:requirements', 'output:effects']);
        assert.strictEqual(r1.refCount, 3);
    });

    test('③ 本次范围内全部节点建完后才连接：同文件内引用解析为 resolved', () => {
        const graph = toData.buildGraph(
            [
                {
                    category: 'recipes',
                    entries: [{ id: 'a', linked: [{ id: 'b' }] }, { id: 'b' }],
                },
            ],
            { namespace: 'test', scope: 'file' }
        );
        const edge = graph.edges.find((e) => e.from.id === 'a' && e.from.field === 'linked');
        assert.strictEqual(edge.status, 'resolved');
        assert.strictEqual(edge.to.category, 'recipes');
        assert.strictEqual(edge.to.id, 'b');
        assert.strictEqual(edge.to.uid, 'test:recipes:b');
        assert.strictEqual(graph.external.length, 0);
    });

    test('③ 连不上的目标 = 文件外节点：scope=file 不告警，scope=global 出「端口悬空」', () => {
        const groups = [{ category: 'recipes', entries: [{ id: 'a', effects: { missing: 1 } }] }];

        const single = toData.buildGraph(groups, { namespace: 'test', scope: 'file' });
        assert.strictEqual(single.external.length, 1);
        assert.strictEqual(single.external[0].status, 'external-origin');
        assert.strictEqual(single.external[0].targetId, 'missing');
        assert.deepStrictEqual(single.warnings, [], '单文件解析不告警');

        const global = toData.buildGraph(groups, { namespace: 'test', scope: 'global' });
        assert.strictEqual(global.warnings.length, 1);
        assert.ok(/端口悬空/.test(global.warnings[0]), `应含「端口悬空」：${global.warnings[0]}`);
        assert.ok(/missing/.test(global.warnings[0]));
    });

    test('③ 有 origin id 索引时区分 external-origin / external-mod', () => {
        const groups = [{ category: 'recipes', entries: [{ id: 'a', effects: { inOrigin: 1, inOtherMod: 1 } }] }];

        const graph = toData.buildGraph(groups, {
            namespace: 'test',
            scope: 'file',
            originIds: new Set(['inOrigin']),
        });
        const byTarget = Object.fromEntries(graph.external.map((e) => [e.targetId, e.status]));
        assert.strictEqual(byTarget.inOrigin, 'external-origin');
        assert.strictEqual(byTarget.inOtherMod, 'external-mod');
    });

    test('② 白名单：未在 mapping 声明的字段不产出连接线', () => {
        const graph = toData.buildGraph(
            [
                {
                    category: 'recipes',
                    entries: [{ id: 'a', comments: { notARef: 1 }, unknownMap: { x: 1 } }],
                },
            ],
            { namespace: 'test', scope: 'file' }
        );
        assert.strictEqual(graph.nodes[0].connections.length, 0);
        assert.strictEqual(graph.edges.length, 0);
    });

    test('② 单文件预览：ascension.json → 全部节点类型为 recipes，文件内 linked 已连接', () => {
        const single = toData.singleFileToData(ASCENSION);
        assert.strictEqual(single.namespace, 'file:ascension');
        assert.strictEqual(single.fileName, 'ascension.json');
        assert.ok(single.nodes.length > 50, `ascension.json 应有大量 recipe 节点，实际 ${single.nodes.length}`);
        // 主节点全是 recipes；内联定义（如 slots）会被拆成各自类别的节点（mapping.splitInline）
        assert.ok(single.nodes.some((n) => n.type === 'recipes' && n.category === 'recipes'));
        assert.ok(
            single.nodes.every((n) => n.type === n.category),
            '每个节点的 type 与 category 一致'
        );
        assert.ok(
            single.nodes.some((n) => n.type === 'slots'),
            'recipe 里内联的卡槽应被拆成 slots 节点'
        );
        assert.ok(
            single.edges.some((e) => e.kind === 'contains'),
            '拆分出来的子节点与宿主之间有包含关系连线'
        );
        assert.deepStrictEqual(single.warnings, [], '单文件解析不告警');
        assert.ok(single.external.length > 0, 'ascension 引用了文件外的元素/动作');

        const resolved = single.edges.filter((e) => e.status === 'resolved');
        assert.ok(resolved.length > 0, '文件内 recipe → recipe 的 linked/alt 应连上');
        assert.ok(resolved.some((e) => e.from.id === 'minorforgevictory_trigger'));
        assert.ok(single.stats.resolved + single.stats.externalOrigin + single.stats.externalMod === single.stats.edges);
    });

    test('③ 多文件（mod）：跨文件连接 + 悬空字段告警', async () => {
        const modInfo = await modLoad.parse.analyzeModJSON5(FIXTURE_MOD);
        const graph = toData.contentFilesToData(modInfo.content, {
            source: 'mod',
            modId: 'sample',
            namespace: 'mod:sample',
        });

        assert.deepStrictEqual([...new Set(graph.nodes.map((n) => n.type))].sort(), ['elements', 'recipes']);
        assert.ok(graph.stats.resolved > 0, 'mod 内 recipe ↔ element / recipe ↔ recipe 应连上');
        assert.ok(graph.warnings.length > 0, '引用了未加载的 origin 目标 → 应有端口悬空告警');

        const recipeEdge = graph.edges.find((e) => e.from.id === 'sample_study0' && e.from.field === 'linked');
        assert.strictEqual(recipeEdge.status, 'resolved');
        assert.strictEqual(recipeEdge.to.id, 'sample_study1');

        const originEdge = graph.external.find((e) => e.targetId === 'study');
        assert.ok(originEdge, 'actionId → study(verb) 在 mod 内不存在 → 记为文件外节点');
        assert.strictEqual(originEdge.status, 'external-origin');
    });

    test('③ origin 全量加载：规模、连接率与状态不变量', () => {
        const graph = toData.loadOriginData(ORIGIN_CORE);

        assert.ok(graph.files.length > 100, `origin 文件数应上百，实际 ${graph.files.length}`);
        assert.ok(graph.nodes.length > 1000, `origin 节点数应上千，实际 ${graph.nodes.length}`);
        assert.ok(graph.edges.length > graph.nodes.length, '连接线应多于节点');
        assert.ok(graph.stats.resolved / graph.stats.edges > 0.9, 'origin 内部连接率应超过 90%');

        assert.ok(
            graph.nodes.every((n) => typeof n.uid === 'string' && n.uid.startsWith('origin:') && n.type === n.category),
            '每个节点都要有命名空间化的 uid，且 type === category'
        );
        assert.ok(
            graph.edges.every((e) => ['resolved', 'external-origin', 'external-mod'].includes(e.status)),
            'edge 状态只能是 resolved / external-*'
        );
        assert.strictEqual(
            graph.external.length,
            graph.stats.externalOrigin + graph.stats.externalMod,
            'external 列表与统计一致'
        );
        assert.strictEqual(graph.stats.externalMod, 0, 'origin 自身加载不传 originIds → 未解析目标统一记 external-origin');
    });

    test('mapping：recipes.actionid = 普通属性 + 连接需求（可连线、也可手填）', () => {
        const rule = mapping.ruleFor('recipes');
        const fieldRule = rule.fields.find((r) => String(r.from).toLowerCase() === 'actionid');
        assert.ok(fieldRule, 'recipes 的 actionid 应声明连接需求');
        assert.strictEqual(fieldRule.link.direction, 'input', '本条目是入线端（线从 verbs 过来）');
        assert.deepStrictEqual(fieldRule.link.targets, ['verbs'], '可连的类别 = verbs');
        assert.strictEqual(fieldRule.link.multi, false, '一个 recipe 只接一个行动框');
        assert.strictEqual(fieldRule.link.extract, 'id');
        // 渲染方式不由后端决定：规则里不该出现控件类型/值类型/标签
        assert.ok(!('type' in fieldRule) && !('valueType' in fieldRule), '后端不声明渲染类型');
        assert.ok(!('label' in fieldRule), '后端不声明展示标签');

        // 数据里两种写法（actionid / actionId）都要认，且「属性值」与「连线」同源
        ['actionid', 'actionId'].forEach((key) => {
            const node = toData.entryToNode('recipes', { id: 'r1', [key]: 'study' }, { namespace: 'test' });
            const prop = node.props.find((p) => String(p.name).toLowerCase() === 'actionid');
            assert.ok(prop, `${key}：属性定义里应有 actionid`);
            assert.strictEqual(prop.kind, 'string', '基础属性类型由原始值推出来');
            assert.strictEqual(prop.value, 'study', `${key}：带上条目里的原始值`);
            assert.strictEqual(prop.links.length, 1);
            assert.strictEqual(prop.links[0].direction, 'input');
            assert.deepStrictEqual(prop.links[0].targets, ['verbs']);
            assert.strictEqual(prop.links[0].multi, false);

            const conn = node.connections.find((c) => String(c.field).toLowerCase() === 'actionid');
            assert.ok(conn, `${key}：应产出连接需求检测结果（连线靠它）`);
            assert.strictEqual(conn.side, 'input');
            assert.deepStrictEqual(
                conn.targetIds.map((t) => t.targetId),
                ['study']
            );
        });

        // 值缺失时不虚报端口；但属性本身照样给出（兜底 text 渲染）
        const empty = toData.entryToNode('recipes', { id: 'r2' }, { namespace: 'test' });
        assert.ok(!empty.connections.some((c) => String(c.field).toLowerCase() === 'actionid'));
        
        // 连接线两端由后端变换好：input 方向 → 出线端是目标、入线端是本条目
        const graph = toData.buildGraph(
            [
                { category: 'recipes', entries: [{ id: 'r1', actionid: 'study' }] },
                { category: 'verbs', entries: [{ id: 'study' }] },
            ],
            { namespace: 'test', scope: 'global' }
        );
        const edge = graph.edges.find((e) => e.targetId === 'study');
        assert.ok(edge, '应产出 actionid → study 的连接线');
        assert.strictEqual(edge.status, 'resolved');
        assert.strictEqual(edge.out.uid, 'test:verbs:study', '出线端 = 目标（verb）');
        assert.strictEqual(edge.out.port, 'link');
        assert.strictEqual(edge.in.uid, 'test:recipes:r1', '入线端 = 本条目');
        assert.strictEqual(edge.in.port, 'input:actionid', '入线端口用数据里的真实字段名');
    });

    test('mapping：加连接 / 拆节点（connectionsOf / splitInline）→ toData 融合包含连线', () => {
        const entry = {
            id: 'r1',
            actionId: 'study',
            effects: { lantern: 2 },
            slots: [{ id: 's1', label: '槽', required: { lantern: 2 } }, { id: 's1' }],
            alt: [{ id: 'r2', chance: 30 }, { id: 'r3', warmup: 5 }],
            internaldeck: { spec: ['card_a'] },
        };

        // ① 加连接：一条「端口 + 方向」一条，参考字段（slots）的 id 引用也在内
        const conns = mapping.connectionsOf('recipes', entry);
        assert.deepStrictEqual(
            conns.map((c) => `${c.side}:${c.port}`).sort(),
            ['input:actionId', 'input:alt', 'output:effects', 'output:slots']
        );

        // ② 拆节点：只有「内联定义」才拆；纯引用（只写 id/chance 这类引用参数）不拆
        const inline = mapping.splitInline('recipes', entry);
        assert.deepStrictEqual(
            inline.map((c) => `${c.category}:${c.field}:${c.index}`).sort(),
            ['decks:internaldeck:0', 'recipes:alt:1', 'slots:slots:0']
        );

        // ③ 融合：拆出来的子节点进图，宿主 → 子节点之间有包含连线
        const graph = toData.buildGraph([{ category: 'recipes', relativePath: 'a.json', entries: [entry] }], {
            namespace: 'test',
            scope: 'global',
        });
        const ids = graph.nodes.map((n) => `${n.type}:${n.id}`).sort();
        assert.ok(ids.includes('slots:s1'), '内联卡槽拆成了 slots 节点');
        assert.ok(ids.includes('recipes:r3'), 'alt 里的内联 recipe 拆成了 recipes 节点');
        assert.ok(ids.some((id) => id.startsWith('decks:')), '内联卡组拆成了 decks 节点');
        assert.ok(!ids.includes('recipes:r2'), '纯引用的 alt 条目不拆节点');

        const contains = graph.edges.filter((e) => e.kind === 'contains');
        assert.ok(contains.length >= 3, `应有宿主→子节点的包含连线，实际 ${contains.length}`);
        assert.ok(
            contains.every((e) => e.status === 'resolved' && e.out.uid && e.in.uid),
            '包含连线两端都在图内，直接解析成 resolved'
        );
        const slotContains = contains.find((e) => e.in.id === 's1');
        assert.strictEqual(slotContains.out.uid, 'test:recipes:r1');
        assert.strictEqual(slotContains.out.port, 'output:slots');

        // 同一条关系不重复画线：内联定义已被包含连线覆盖，同宿主同字段的引用线不再重复
        assert.ok(
            !graph.edges.some((e) => e.kind === 'link' && e.from.id === 'r1' && e.from.field === 'slots' && e.targetId === 's1'),
            '内联定义的引用线与包含连线重复 → 只留包含连线'
        );
        // 拆出来的 slots 节点自己带着条件连线（required → 元素）
        const slotNode = graph.nodes.find((n) => n.type === 'slots' && n.id === 's1');
        assert.ok(
            slotNode.connections.some((c) => c.field === 'required' && c.side === 'input'),
            '槽位条件挂在拆出来的 slots 节点上'
        );
    });

    test('契约面：导出/导入两侧依赖的字段都在（inline / contains / from / out / in / to）', () => {
        const graph = toData.buildGraph(
            [
                {
                    category: 'recipes',
                    relativePath: 'a.json',
                    entries: [
                        {
                            id: 'r1',
                            label: '测试',
                            actionId: 'study',
                            effects: { lantern: 2 },
                            slots: [{ id: 's1', required: { lantern: 1 } }, { id: 's1' }],
                        },
                        { id: 'study' },
                        { id: 'lantern' },
                    ],
                },
            ],
            { namespace: 'test', scope: 'global' }
        );

        assert.strictEqual(graph.format, 'cne-node-graph');
        assert.strictEqual(graph.version, 1);

        // 节点：拆出来的子节点带「内联来源」，根节点为 null
        const host = graph.nodes.find((n) => n.id === 'r1');
        const child = graph.nodes.find((n) => n.type === 'slots' && n.id === 's1');
        assert.strictEqual(host.inline, null, '根节点的 inline 为 null');
        assert.deepStrictEqual(child.inline, {
            hostUid: 'test:recipes:r1',
            hostCategory: 'recipes',
            hostId: 'r1',
            field: 'slots',
            index: 0,
            syntheticId: false,
        });

        // connections：导出侧要的 sources / targetIds 在，渲染期的 label / connected 不在
        const conn = host.connections.find((c) => c.field === 'effects');
        assert.ok(conn.sources.includes('mapping'));
        assert.deepStrictEqual(
            conn.targetIds.map((t) => t.targetId),
            ['lantern']
        );
        assert.ok(!('label' in conn) && !('connected' in conn), 'connections 不带渲染期字段');

        // edges：from / out / in / to 的字段齐全（导出侧按 to / out / in 还原朝向）
        const link = graph.edges.find((e) => e.kind === 'link' && e.from.field === 'actionId');
        ['uid', 'type', 'category', 'id', 'field', 'port', 'side', 'targets', 'extract', 'multi', 'sources'].forEach(
            (k) => assert.ok(k in link.from, `edge.from 缺 ${k}`)
        );
        ['uid', 'type', 'category', 'id', 'side', 'port'].forEach((k) => {
            assert.ok(k in link.out, `edge.out 缺 ${k}`);
            assert.ok(k in link.in, `edge.in 缺 ${k}`);
        });
        assert.ok(link.to.uid.endsWith(':study'), 'edge.to 带上目标节点');
        assert.strictEqual(link.out.port, 'link', '目标那一端是通用入口');
        assert.strictEqual(link.in.port, 'input:actionId');

        // 包含边：宿主 → 拆出来的子节点
        const contains = graph.edges.find((e) => e.kind === 'contains');
        assert.strictEqual(contains.to.uid, 'test:slots:s1');
        assert.strictEqual(contains.out.port, 'output:slots');
        assert.strictEqual(contains.in.port, 'link');
    });

    test('mapping：别名 / 兜底规则（legcies 拼写错误、未知类别）', () => {
        assert.deepStrictEqual(mapping.ruleFor('legcies').fields, mapping.ruleFor('legacies').fields);
        assert.strictEqual(mapping.ruleFor('从未见过的类别'), mapping.fallback);
        assert.deepStrictEqual(mapping.fallback.fields, []);
        // 规则表只描述「连接需求 + 中间态转化」，不带渲染信息
        assert.ok(
            mapping.categories.recipes.fields.every((r) => !('type' in r) && !('label' in r) && !('icon' in r)),
            '规则里不应出现控件类型 / 标签 / 图标'
        );
    });
});
