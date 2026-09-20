const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mapping = require('../core/modLoad/mapping');
const plugins = require('../core/modLoad/plugins');
const toData = require('../core/modLoad/toData');

/**
 * 字段映射插件测试（`npx mocha --ui tdd test/fieldPlugins.test.js`）
 *
 * 覆盖三件事：
 *   ① 内置插件（TRM / 导入扩展）能挂上 mapping 的规则表，且能禁用、能注销；
 *   ② 「可自定义字段」接口：注册插件（JS / JSON 文件）→ 补充字段、正则字段名、自定义 extract；
 *   ③ 插件不污染 mapping 本体表，连接结果带来源标注（edge.from.sources）。
 *
 * 规则形状（2026-09-20 起）：类别规则只有 `{ wiki, fields }`，每条字段规则
 * `{ from, link?: { direction, targets, multi, extract, keys, port }, materialize? }`
 * —— 后端只描述语义，**不写** label / 控件类型。
 */

/** 每条用例跑完恢复初始状态（内置插件回归默认启用、清掉临时插件与自定义 extract） */
teardown(() => plugins.reset());

/** 造一个只含 1 个类别的图，方便断连接 */
function graphOf(category, entries, options = {}) {
    return toData.buildGraph([{ category, relativePath: 'a.json', entries }], {
        namespace: 'test',
        scope: 'file',
        ...options,
    });
}

/** 取某字段的连接（含方向） */
function connOf(node, field, side) {
    return node.connections.find((c) => c.field === field && (!side || c.side === side));
}

/** 取某类别生效规则表里带 link 的字段规则 */
function linkRules(category, direction) {
    return (mapping.ruleFor(category).fields || []).filter((r) => r.link && (!direction || r.link.direction === direction));
}

suite('字段映射插件', () => {
    test('内置插件已注册：trm / import-extension 默认启用', () => {
        const list = plugins.list();
        const trm = list.find((p) => p.id === 'trm');
        const imp = list.find((p) => p.id === 'import-extension');

        assert.ok(trm && trm.builtin && trm.enabled, 'TRM 应为内置且默认启用');
        assert.ok(imp && imp.builtin && imp.enabled, '导入扩展应为内置且默认启用');
        assert.ok(plugins.extractKinds().includes('fucine-ids'), 'TRM 应带来 fucine-ids 自定义 extract');
        assert.ok(plugins.get('trm').categories.recipes.fields, '插件定义可读回（fields 形状）');
    });

    test('插件字段进入生效规则表，且能禁用 / 重新启用', () => {
        assert.ok(
            linkRules('recipes', 'input').some((r) => r.from === 'grandReqs' && r.plugin === 'trm'),
            '启用时 recipes 应含 TRM 的 grandReqs（入向）'
        );

        plugins.disable('trm'); // 变更自动重建规则表
        assert.ok(!linkRules('recipes').some((r) => r.plugin === 'trm'), '禁用后不应再有 TRM 字段');
        assert.ok(
            linkRules('recipes', 'input').some((r) => r.from === 'requirements'),
            '本体字段不受影响'
        );

        plugins.enable('trm');
        assert.ok(linkRules('recipes', 'output').some((r) => r.from === 'movements'), '重新启用后恢复');
    });

    test('插件不污染 mapping 本体表（baseCategories 保持不变）', () => {
        const before = mapping.baseCategories.recipes.fields.length;

        plugins.register({
            id: 'temp-plugin',
            categories: { recipes: { fields: [{ from: 'myReq', link: { direction: 'input', targets: ['elements'], extract: 'map' } }] } },
        });
        mapping.rebuildRules();

        assert.ok(linkRules('recipes', 'input').some((r) => r.from === 'myReq'), '生效表应含插件字段');
        assert.strictEqual(mapping.baseCategories.recipes.fields.length, before, '本体表字段数不应被改');
        assert.ok(
            !mapping.baseCategories.recipes.fields.some((r) => r.from === 'myReq'),
            '本体表里不应出现插件字段'
        );
        assert.ok(
            mapping.baseCategories.recipes.fields.every((r) => r.plugin == null),
            '本体规则不带插件标记'
        );
    });

    test('校验：id / extract / from / link 写错时报出具体错误', () => {
        assert.ok(plugins.validate({ id: 'Bad Id' }).some((e) => /id 非法/.test(e)));
        assert.ok(plugins.validate(null).length, 'null 定义应报错');
        assert.ok(
            plugins
                .validate({ id: 'x', categories: { recipes: { fields: [{ from: 'a', link: { extract: '不存在的种类' } }] } } })
                .some((e) => /extract 未知/.test(e))
        );
        assert.ok(
            plugins.validate({ id: 'x', categories: { recipes: { fields: [{ link: { extract: 'map' } }] } } }).some((e) =>
                /from 必须是字符串或正则/.test(e)
            )
        );
        assert.ok(
            plugins
                .validate({ id: 'x', categories: { recipes: { fields: [{ from: 'a', link: { direction: 'sideways' } }] } } })
                .some((e) => /direction 只能是 input \/ output/.test(e)),
            'direction 只认 input / output'
        );
        assert.ok(
            plugins.validate({ id: 'x', extracts: { 'my-kind': 'not a function' } }).some((e) => /必须是函数/.test(e)),
            'JSON 插件不能带自定义 extract'
        );
        assert.throws(() => plugins.register({ id: '未知 extract', categories: {} }), /插件定义非法/);
    });

    test('自定义插件：categories / allCategories / 新类别 都能补进来', () => {
        plugins.register({
            id: 'my-ext',
            name: '我的扩展',
            allCategories: { fields: [{ from: '$depends', link: { direction: 'input', targets: [], extract: 'scalar-list' } }] },
            categories: {
                recipes: { fields: [{ from: 'myReward', link: { direction: 'output', targets: ['elements'], extract: 'map' } }] },
                mythings: { fields: [{ from: 'myRef', link: { direction: 'input', targets: [], extract: 'scalar-list' } }] },
            },
        });

        assert.ok(linkRules('recipes', 'output').some((r) => r.from === 'myReward' && r.plugin === 'my-ext'));
        assert.ok(linkRules('elements', 'input').some((r) => r.from === '$depends'), 'allCategories 应覆盖其它类别');

        const mythings = mapping.ruleFor('mythings');
        assert.notStrictEqual(mythings, mapping.fallback, '新类别应建出规则而不是走兜底');
        assert.ok(Array.isArray(mythings.fields), '新类别只建 fields，不塞渲染元信息');
        assert.ok(!('icon' in mythings) && !('colorVar' in mythings), '后端不决定渲染（无 icon / colorVar）');

        const graph = graphOf('mythings', [{ id: 't1', myRef: ['e1', 'e2'] }]);
        assert.strictEqual(
            connOf(graph.nodes[0], 'myRef', 'input').targetIds.length,
            2,
            '新类别字段也应产出连接'
        );
    });

    test('规格字段：字段规则里不出现渲染信息（控件类型 / 标签 / 图标）', () => {
        const rules = [...mapping.ruleFor('recipes').fields, ...mapping.ruleFor('elements').fields];
        rules.forEach((r) => {
            assert.ok(!('type' in r), `字段规则不应带控件类型：${JSON.stringify(r.from)}`);
            assert.ok(!('label' in r), `字段规则不应带标签：${JSON.stringify(r.from)}`);
            assert.ok(!('valueType' in r), `字段规则不应带值类型：${JSON.stringify(r.from)}`);
        });
    });

    test('正则 from：一个规则命中多个字段，各记一条连接（属性操作字段）', () => {
        plugins.register({
            id: 'regex-ext',
            categories: {
                recipes: {
                    fields: [
                        {
                            from: /^effects\$(add|remove)$/i,
                            link: { direction: 'output', targets: ['elements'], extract: 'map' },
                        },
                    ],
                },
            },
        });

        const graph = graphOf('recipes', [{ id: 'r1', 'effects$add': { e1: 1 }, 'effects$remove': { e2: 1 }, effects: { e3: 1 } }]);
        const fields = graph.nodes[0].connections.map((c) => c.field).filter((f) => f.includes('$')).sort();
        assert.deepStrictEqual(fields, ['effects$add', 'effects$remove'], '只命中带后缀的两个字段');
        assert.ok(
            !connOf(graph.nodes[0], 'effects$add').targetIds.some((t) => t.targetId === 'e3'),
            '$add / $remove 与基础字段互不干扰'
        );
    });

    test('自定义 extract：TRM 的 fucine-ids 能从 Fucine 表达式里取出 id', () => {
        const fn = plugins.getExtract('fucine-ids');
        // 不带 keys 的用法里插件不碰 ctx（只扫描整个字段值）
        const ctx = { eachItem: () => {}, pickPath: () => [] };
        const target = { extract: 'fucine-ids', keys: [] };

        const ids = (text) => fn(text, target, ctx).map((t) => t.targetId);

        assert.deepStrictEqual(ids({ '[~/extant:funds]': 1 }), ['funds'], '地址前缀不是 id');
        assert.deepStrictEqual(ids({ '[lantern] || [forge]': 3 }), ['lantern', 'forge']);
        assert.deepStrictEqual(ids('[~/situation/slots/card1:mariner.cardorderpuzzle.tracks]'), ['mariner.cardorderpuzzle.tracks']);

        // 端到端：表达式里的 funds 应连到真实节点
        const graph = graphOf('recipes', [{ id: 'r1', grandReqs: { '[~/extant:funds]': 1 } }, { id: 'funds' }]);
        const edge = graph.edges.find((e) => e.from.field === 'grandReqs');
        assert.ok(edge, 'grandReqs 应产出连接');
        assert.strictEqual(edge.targetId, 'funds');
        assert.strictEqual(edge.status, 'resolved');
        assert.deepStrictEqual(edge.from.sources, ['trm'], '插件字段的来源就是插件 id');
    });

    test('自定义 extract 抛错只告警，不影响其它字段与整表加载', () => {
        plugins.registerExtract('boom', () => {
            throw new Error('故意炸一下');
        });
        plugins.register({
            id: 'boom-ext',
            categories: { recipes: { fields: [{ from: 'explode', link: { direction: 'input', targets: [], extract: 'boom' } }] } },
        });

        const graph = graphOf('recipes', [{ id: 'r1', explode: { x: 1 }, effects: { e1: 1 } }]);
        const fields = graph.nodes[0].connections.map((c) => c.field);
        assert.ok(!fields.includes('explode'), '解析失败的字段不产出连接');
        assert.ok(fields.includes('effects'), '其它字段照常工作');
    });

    test('TRM 字段端到端：grandReqs / 槽位催化剂 / movements / 根路径 都能连上', () => {
        const graph = graphOf('recipes', [
            {
                id: 'r1',
                grandReqs: { '[~/extant:funds]': 1 },
                slots: [{ id: 's1', xtrigger: 'fallsick' }],
                movements: { '~/tabletop': 'rose_b' },
                rootAdd: { flagA: 1 },
                completeverb: { work: 1 },
                deckShuffles: ['deck_a'],
            },
            { id: 'funds' },
            { id: 'fallsick' },
            { id: 'rose_b' },
            { id: 'flagA' },
            { id: 'work' },
            { id: 'deck_a' },
        ]);

        const resolved = graph.edges.filter((e) => e.status === 'resolved' && e.from.sources.includes('trm'));
        const byField = Object.fromEntries(resolved.map((e) => [e.from.field, e.targetId]));

        assert.deepStrictEqual(Object.keys(byField).sort(), ['completeverb', 'deckShuffles', 'grandReqs', 'movements', 'rootAdd', 'slots']);
        assert.strictEqual(byField.slots, 'fallsick', '槽位 xtrigger 是催化剂（入端口）');
        const slotConn = connOf(graph.nodes[0], 'slots', 'input');
        assert.ok(slotConn, 'slots 走输入方向');
        assert.strictEqual(slotConn.plugin, 'trm', '连接上标出了规则来源插件');
    });

    test('可自定义字段（不改代码）：从 JSON 文件加载插件', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cne-plugins-'));
        const file = path.join(dir, 'my-fields.json');
        fs.writeFileSync(
            file,
            JSON.stringify({
                id: 'json-fields',
                name: '用户自定义字段',
                categories: { elements: { fields: [{ from: 'myGift', link: { direction: 'output', targets: ['elements'], extract: 'map' } }] } },
            })
        );
        // 顺带放一个坏文件，验证错误收集而不是整批失败
        fs.writeFileSync(path.join(dir, 'broken.json'), '{ oops }');

        const loaded = plugins.loadPath(file);
        assert.deepStrictEqual(loaded.loaded, ['json-fields']);
        assert.ok(linkRules('elements', 'output').some((r) => r.from === 'myGift'), 'JSON 插件应生效');

        const batch = plugins.loadDirectory(dir);
        assert.deepStrictEqual(batch.loaded, ['json-fields'], '目录里合法的一个加载成功');
        assert.strictEqual(batch.errors.length, 1, '坏文件被记为错误');

        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('冲突分析：默认只报多插件互撞，与本体重叠属设计允许的扩展', () => {
        plugins.register({
            id: 'dup-ext',
            categories: { recipes: { fields: [{ from: 'effects', link: { direction: 'output', targets: ['elements'], extract: 'map' } }] } },
        });

        const merged = plugins.mergeInto(mapping.baseCategories);
        assert.ok(
            !plugins.conflicts(merged).some((c) => c.field === 'effects'),
            '插件扩展本体字段（effects）不算冲突'
        );
        assert.ok(
            !plugins.conflicts(merged).some((c) => c.field === 'slots'),
            'TRM 给本体 slots 再加一条规则也不算冲突'
        );

        const withBase = plugins.conflicts(merged, { includeBase: true });
        const hit = withBase.find((c) => c.category === 'recipes' && c.field === 'effects');
        assert.ok(hit, 'includeBase 时应报出与本体重叠');
        assert.deepStrictEqual(hit.sources.sort(), ['dup-ext', 'mapping']);
        assert.strictEqual(hit.direction, 'output', '冲突按「字段 + 方向」记');

        plugins.register({
            id: 'other-ext',
            categories: { recipes: { fields: [{ from: 'effects', link: { direction: 'output', targets: ['elements'], extract: 'map' } }] } },
        });
        const clash = plugins.conflicts(plugins.mergeInto(mapping.baseCategories)).find(
            (c) => c.category === 'recipes' && c.field === 'effects'
        );
        assert.ok(clash, '两个插件同时声明同一字段应报冲突');
        assert.deepStrictEqual(clash.sources.sort(), ['dup-ext', 'other-ext']);

        const graph = graphOf('recipes', [{ id: 'r1', effects: { e1: 1 } }]);
        assert.strictEqual(
            connOf(graph.nodes[0], 'effects', 'output').targetIds.length,
            1,
            '同一目标不会因重复声明而翻倍'
        );
        assert.deepStrictEqual(
            connOf(graph.nodes[0], 'effects', 'output').sources,
            ['mapping', 'dup-ext', 'other-ext'],
            '每个来源都记上'
        );
    });

    test('reset()：清掉临时插件与自定义 extract，内置插件恢复默认', () => {
        plugins.register({ id: 'will-be-cleared', categories: {} });
        plugins.registerExtract('temp-kind', () => []);
        plugins.disable('trm');

        plugins.reset();

        assert.deepStrictEqual(plugins.ids().sort(), ['import-extension', 'trm']);
        assert.strictEqual(plugins.getExtract('temp-kind'), null);
        assert.ok(plugins.isEnabled('trm'));
        assert.ok(
            linkRules('recipes', 'input').some((r) => r.from === 'grandReqs' && r.plugin === 'trm'),
            '内置插件规则重新生效'
        );
    });
});
