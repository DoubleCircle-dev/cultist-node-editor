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
        assert.strictEqual(r1.fields.warmup, 10);
        assert.ok(r1.refs.requirements && r1.refs.effects, 'refs 保留原始引用结构');

        const fields = r1.connections.map((c) => `${c.side}:${c.field}`).sort();
        assert.deepStrictEqual(fields, ['input:requirements', 'output:effects', 'output:linked']);
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
        assert.ok(single.nodes.every((n) => n.type === 'recipes' && n.category === 'recipes'));
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

    test('mapping：别名 / 兜底规则（legcies 拼写错误、未知类别）', () => {
        assert.strictEqual(mapping.ruleFor('legcies').colorVar, mapping.ruleFor('legacies').colorVar);
        assert.strictEqual(mapping.ruleFor('从未见过的类别'), mapping.fallback);
        assert.deepStrictEqual(mapping.fallback.inputs, []);
    });
});
