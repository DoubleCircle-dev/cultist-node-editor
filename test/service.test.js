const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cacheKey = require('../core/service/cacheKey');
const docStore = require('../core/service/docStore');
const graphCache = require('../core/service/graphCache');
const graphStage = require('../core/service/graphStage');
const mapping = require('../core/modLoad/mapping');
const origin = require('../core/modLoad/origin');
const originResource = require('../core/service/originResource');
const serviceApi = require('../core/service');

/**
 * 服务层测试（纯 Node，不需要 vscode 运行时；同一份文件也会在扩展宿主里跑）
 *
 * 覆盖 core/service 的六块职责：
 *   ① 缓存基元（键与签名）     ② 图缓存 / 文档缓存（命中、过期、损坏容错）
 *   ③ 文件收集与建图比对       ④ origin 资源（快照、图片、按需源码）
 *   ⑤ mod 快速加载与监听重载   ⑥ 关键不变量：重载结果 ≡ 从零全量重跑
 *
 * 断言尽量写成「结构性」的（数量关系 / 不变量 / 往返一致），只有少量与仓库内固定
 * fixture 相关的下界，避免 fixture 一改就误报。
 */

const EXT_ROOT = path.resolve(__dirname, '..');
const FIXTURE_MOD = path.join(EXT_ROOT, 'test', 'fixtures', 'sample-mod');

/** 本文件所有用例共用的临时目录（收尾统一删除） */
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cne-service-test-'));
const STORAGE_DIR = path.join(TMP_ROOT, 'storage');

/** 静默的日志回调（服务层默认往 console 打，测试里不需要） */
const noop = () => {};

/**
 * 造一个「假扩展目录」：结构与本仓库一致，但只有最小 origin 数据与图片。
 *
 * 用它而不是真 origin，是为了让「快照命中 / 版本不符回退 / 图片本地优先」这些分支
 * 可确定地复现（真 origin 有 6000+ 节点，且快照是否已生成取决于开发者本机状态）。
 *
 * @returns {string} 假扩展根目录
 */
function makeFakeExtensionRoot() {
    const root = path.join(TMP_ROOT, 'fake-ext');
    const resources = path.join(root, 'core', 'origin_resources');
    const contentDir = path.join(resources, 'StreamingAssets', 'content', 'core');

    fs.mkdirSync(path.join(contentDir, 'elements'), { recursive: true });
    fs.mkdirSync(path.join(resources, 'images', 'elements'), { recursive: true });
    fs.mkdirSync(path.join(resources, 'images', 'aspects'), { recursive: true });

    fs.writeFileSync(
        path.join(contentDir, 'elements', 'mini.json'),
        JSON.stringify({ elements: [{ id: 'e1', label: 'E1', lifetime: 60 }] })
    );
    fs.writeFileSync(path.join(resources, 'images', 'elements', 'e1.png'), 'png-e1');
    fs.writeFileSync(path.join(resources, 'images', 'elements', 'dup.png'), 'png-dup-elements');
    fs.writeFileSync(path.join(resources, 'images', 'aspects', 'dup.png'), 'png-dup-aspects');
    fs.writeFileSync(
        path.join(resources, 'image-index.json'),
        JSON.stringify({
            cdnBase: 'https://cdn.example/',
            images: { e1: ['elements/e1.png'], dup: ['elements/dup.png', 'aspects/dup.png'] },
        })
    );

    return root;
}

/** 把仓库里的示例 mod 复制到临时目录（用例要改文件，不能动 fixture 本体） */
function copyFixtureMod(name) {
    const target = path.join(TMP_ROOT, name);
    fs.cpSync(FIXTURE_MOD, target, { recursive: true });
    return target;
}

suiteTeardown(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

suite('服务层：缓存基元（键与签名）', () => {
    test('键：片段顺序/边界参与计算，同一组片段稳定', () => {
        assert.strictEqual(cacheKey.storageKey('a', 'b'), cacheKey.storageKey('a', 'b'));
        assert.notStrictEqual(cacheKey.storageKey('a', 'b'), cacheKey.storageKey('b', 'a'));
        // 用 \u0000 分隔，避免 ['a','bc'] 与 ['ab','c'] 撞键
        assert.notStrictEqual(cacheKey.storageKey('a', 'bc'), cacheKey.storageKey('ab', 'c'));
        assert.strictEqual(cacheKey.storageKey('a', 'b').length, cacheKey.HASH_LENGTH);
    });

    test('签名：与文件顺序无关，与内容（mtime/size）有关', () => {
        const a = { relativePath: 'a.json', signature: '1:10' };
        const b = { relativePath: 'b.json', signature: '2:20' };
        assert.strictEqual(cacheKey.signatureOf([a, b]), cacheKey.signatureOf([b, a]));

        const changed = { relativePath: 'b.json', signature: '2:21' };
        assert.notStrictEqual(cacheKey.signatureOf([a, b]), cacheKey.signatureOf([a, changed]));
    });

    test('签名：相对路径的正反斜杠归一（Windows 与 POSIX 得到同一个签名）', () => {
        const win = [{ relativePath: 'elements\\a.json', signature: '1:1' }];
        const posix = [{ relativePath: 'elements/a.json', signature: '1:1' }];
        assert.strictEqual(cacheKey.signatureOf(win), cacheKey.signatureOf(posix));
    });

    test('fileSignature：读不到文件时返回 null，不抛错', () => {
        assert.strictEqual(cacheKey.fileSignature(path.join(TMP_ROOT, 'nope.json')), null);
        const file = path.join(TMP_ROOT, 'sig.json');
        fs.writeFileSync(file, 'x');
        assert.match(cacheKey.fileSignature(file), /^\d+:\d+$/);
    });
});

suite('服务层：图缓存与文档缓存', () => {
    const graphFile = path.join(STORAGE_DIR, 'graphs', 'unit.json');
    const docFile = path.join(STORAGE_DIR, 'docs', 'unit.json');

    const graph = {
        format: 'cne-node-graph',
        version: 1,
        namespace: 'test',
        nodes: [{ uid: 'test:recipes:r1', id: 'r1', type: 'recipes' }],
        edges: [],
        stats: { nodes: 1, edges: 0 },
    };

    test('图缓存：未命中 / 命中 / 签名不符 / 版本不符 / 损坏 JSON 都得到正确结论', () => {
        assert.strictEqual(graphCache.readGraphCache(graphFile), null, '文件不存在 → 未命中');

        const written = graphCache.writeGraphCache(graphFile, { graph, signature: 'sig-1' });
        assert.ok(written.ok, '写入应成功');
        assert.ok(written.bytes > 0);

        const hit = graphCache.readGraphCache(graphFile, { signature: 'sig-1' });
        assert.ok(hit, '签名一致 → 命中');
        assert.strictEqual(hit.graph.nodes.length, 1);
        assert.strictEqual(hit.signature, 'sig-1');

        assert.strictEqual(graphCache.readGraphCache(graphFile, { signature: 'sig-2' }), null, '签名不符 → 未命中');

        fs.writeFileSync(graphFile, '{ 这不是 json');
        assert.strictEqual(graphCache.readGraphCache(graphFile), null, '损坏 → 未命中而不是抛错');

        fs.writeFileSync(graphFile, JSON.stringify({ cacheFormat: graphCache.CACHE_FORMAT, cacheVersion: 999, graph }));
        assert.strictEqual(graphCache.readGraphCache(graphFile), null, '版本不符 → 未命中');

        assert.strictEqual(graphCache.removeGraphCache(graphFile), true);
        assert.strictEqual(fs.existsSync(graphFile), false);
    });

    test('文档缓存：往返一致，损坏/缺字段时当作没有缓存', () => {
        assert.strictEqual(docStore.readDoc(docFile).doc, null, '文件不存在 → 没有缓存');

        const doc = { pages: [{ id: 'p1', name: '页 1', nodes: [{ uid: 'a' }] }], activeId: 'p1' };
        const written = docStore.writeDoc(docFile, doc, { meta: { pages: 1 } });
        assert.ok(written.ok);

        const back = docStore.readDoc(docFile);
        assert.deepStrictEqual(back.doc, doc, '文档原样取回（后端不解释其结构）');
        assert.ok(back.savedAt, '应记录保存时间');
        assert.deepStrictEqual(back.meta, { pages: 1 });

        fs.writeFileSync(docFile, JSON.stringify({ docFormat: '别人的格式', doc }));
        assert.strictEqual(docStore.readDoc(docFile).doc, null, '格式不符 → 没有缓存');

        assert.strictEqual(docStore.removeDoc(docFile), true);
    });
});

suite('服务层：文件收集与建图比对', () => {
    const dir = path.join(TMP_ROOT, 'collect', 'content');

    test('签名与文件数：只 stat，不解析', () => {
        fs.mkdirSync(path.join(dir, 'recipes'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'recipes', 'a.json'), JSON.stringify({ recipes: [{ id: 'r1' }] }));

        const first = graphStage.signatureOfDir(dir);
        assert.strictEqual(first.fileCount, 1);
        assert.strictEqual(graphStage.signatureOfDir(dir).signature, first.signature, '内容未变 → 签名不变');

        fs.writeFileSync(path.join(dir, 'recipes', 'b.json'), JSON.stringify({ recipes: [{ id: 'r2' }] }));
        assert.notStrictEqual(graphStage.signatureOfDir(dir).signature, first.signature, '新增文件 → 签名改变');
    });

    test('collectFiles：第二次收集复用上一次的解析结果（parsed=0）', () => {
        const cache = graphStage.createFileCache();

        const first = graphStage.collectFiles(dir, cache);
        assert.strictEqual(first.parsed, 2);
        assert.strictEqual(first.reused, 0);
        assert.strictEqual(first.files.length, 2);
        assert.ok(first.files.every((f) => f.relativePath && f.data), '应带上相对路径与解析结果');

        const second = graphStage.collectFiles(dir, cache);
        assert.strictEqual(second.parsed, 0, '全部命中缓存，不应重新解析');
        assert.strictEqual(second.reused, 2);
        assert.strictEqual(second.signature, first.signature, '签名保持一致');

        // 只改一个文件 → 只重新解析那一个
        fs.writeFileSync(path.join(dir, 'recipes', 'a.json'), JSON.stringify({ recipes: [{ id: 'r1', label: '改了' }] }));
        const third = graphStage.collectFiles(dir, cache);
        assert.strictEqual(third.parsed, 1);
        assert.strictEqual(third.reused, 1);
        assert.notStrictEqual(third.signature, first.signature);
    });

    test('diffGraphs：按 uid / edge.id 得出增删改，并给出变化比例', () => {
        const prev = {
            nodes: [{ uid: 'a', title: 'A' }, { uid: 'b', title: 'B' }],
            edges: [{ id: 'e1', kind: 'link' }, { id: 'e2', kind: 'link' }],
        };
        const next = {
            nodes: [{ uid: 'a', title: 'A' }, { uid: 'b', title: 'B2' }, { uid: 'c', title: 'C' }],
            edges: [{ id: 'e1', kind: 'link' }, { id: 'e3', kind: 'link' }],
        };

        const patch = graphStage.diffGraphs(prev, next);
        assert.deepStrictEqual(patch.addedNodes.map((n) => n.uid), ['c']);
        assert.deepStrictEqual(patch.updatedNodes.map((n) => n.uid), ['b'], '内容变了才算更新');
        assert.deepStrictEqual(patch.removedNodeUids, []);
        assert.deepStrictEqual(patch.addedEdges.map((e) => e.id), ['e3']);
        assert.deepStrictEqual(patch.updatedEdges, []);
        assert.deepStrictEqual(patch.removedEdgeIds, ['e2']);
        assert.strictEqual(patch.changed, 4);
        assert.strictEqual(patch.previous, 4);
        assert.strictEqual(patch.ratio, 1);

        // 没有上一张图 → 一切皆新增，比例按 1（全量）处理
        const cold = graphStage.diffGraphs(null, next);
        assert.strictEqual(cold.addedNodes.length, 3);
        assert.strictEqual(cold.ratio, 1);

        // 变化很小 → 比例小（供调用方判断该发增量还是全量）
        const big = { nodes: Array.from({ length: 100 }, (_, i) => ({ uid: `n${i}`, title: `N${i}` })), edges: [] };
        const bigChanged = { nodes: [...big.nodes, { uid: 'extra', title: 'X' }], edges: [] };
        assert.ok(graphStage.diffGraphs(big, bigChanged).ratio < 0.05);
    });
});

suite('服务层：origin 资源', () => {
    const fakeRoot = makeFakeExtensionRoot();
    const resourcesDir = path.join(fakeRoot, 'core', 'origin_resources');
    const contentDir = path.join(resourcesDir, 'StreamingAssets', 'content', 'core');
    const snapshotFile = path.join(resourcesDir, 'origin.graph.json');

    test('源文件加载 → 生成快照 → 快照有效（且不含 files 中间产物）', () => {
        const snapshot = origin.buildOriginSnapshot(contentDir);
        assert.strictEqual(snapshot.format, origin.SNAPSHOT_FORMAT);
        assert.strictEqual(snapshot.mappingRevision, mapping.revision(), '快照要记下生成时的规则表版本');
        assert.strictEqual(snapshot.graph.files, undefined, '快照不应带上原始文件解析结果');

        const written = origin.writeOriginSnapshot(snapshotFile, snapshot);
        assert.ok(written.ok, '快照应写入成功');

        const loaded = origin.loadOriginSnapshot(snapshotFile, { mappingRevision: mapping.revision() });
        assert.ok(loaded, '版本一致 → 快照可用');
        assert.strictEqual(loaded.graph.nodes.length, snapshot.graph.nodes.length);
        assert.deepStrictEqual(loaded.graph.stats, snapshot.graph.stats);
    });

    test('快照：规则表版本不符 / 损坏 → 判为无效（返回 null 而不是抛错）', () => {
        const snapshot = origin.buildOriginSnapshot(contentDir);
        assert.strictEqual(
            origin.loadOriginSnapshot(snapshotFile, { mappingRevision: 'old-revision' }),
            null,
            '规则表版本不符 → 无效'
        );

        fs.writeFileSync(snapshotFile, '{ 损坏的快照');
        assert.strictEqual(origin.loadOriginSnapshot(snapshotFile), null, '损坏 → 无效');

        fs.writeFileSync(snapshotFile, JSON.stringify({ ...snapshot, version: 999 }));
        assert.strictEqual(origin.loadOriginSnapshot(snapshotFile), null, '格式版本不符 → 无效');

        origin.writeOriginSnapshot(snapshotFile, snapshot); // 复原，供后面的用例用
    });

    test('loadGraph：快照优先；快照不可用时回退源文件', () => {
        const withSnapshot = originResource.createOriginResource({ extensionRoot: fakeRoot });
        const hit = withSnapshot.loadGraph();
        assert.strictEqual(hit.fromSnapshot, true, '应命中快照');
        assert.ok(hit.ids.has('e1'), 'id 索引应包含 origin 条目');

        fs.rmSync(snapshotFile, { force: true });
        const withoutSnapshot = originResource.createOriginResource({ extensionRoot: fakeRoot });
        const fallback = withoutSnapshot.loadGraph();
        assert.strictEqual(fallback.fromSnapshot, false, '快照缺失 → 回退源文件加载');
        assert.strictEqual(
            fallback.graph.nodes.length,
            hit.graph.nodes.length,
            '两条路径产出的节点数应一致'
        );
        assert.strictEqual(fallback.graph.edges.length, hit.graph.edges.length, '连接线也应一致');

        // 复原快照，避免影响后续用例
        origin.writeOriginSnapshot(snapshotFile, origin.buildOriginSnapshot(contentDir));
    });

    test('图片解析：本地优先 → CDN 回退 → 同名多义按类别消歧 → 未命中', () => {
        const res = originResource.createOriginResource({ extensionRoot: fakeRoot });
        const toUrl = (filePath) => `webview-uri:${filePath}`;

        const local = res.resolveImage('e1', 'elements', toUrl);
        assert.strictEqual(local.source, 'local');
        assert.match(local.url, /^webview-uri:/);
        assert.strictEqual(local.rel, 'elements/e1.png');

        const cdn = res.resolveImage('e1', 'elements', null);
        assert.strictEqual(cdn.source, 'cdn', '没有本地路径转换器时退回 CDN');
        assert.strictEqual(cdn.url, 'https://cdn.example/elements/e1.png');

        const disambiguated = res.resolveImage('dup', 'aspects', toUrl);
        assert.strictEqual(disambiguated.rel, 'aspects/dup.png', '同名多义 → 按类别目录收敛');
        assert.strictEqual(disambiguated.ambiguous, false);
        assert.strictEqual(disambiguated.candidates.length, 2, '候选清单要一并给出，便于前端排查');

        const stillAmbiguous = res.resolveImage('dup', 'recipes', toUrl);
        assert.strictEqual(stillAmbiguous.ambiguous, true, '类别对不上 → 仍然多义');
        assert.strictEqual(stillAmbiguous.rel, 'elements/dup.png', '退回第一个候选而不是空');

        const miss = res.resolveImage('nope', 'elements', toUrl);
        assert.strictEqual(miss.source, 'miss');
        assert.strictEqual(miss.url, '');
    });

    test('idsIfLoaded：未加载时返回 null 且不触发加载（不为一次分类就拉整份 origin）', () => {
        const res = originResource.createOriginResource({ extensionRoot: fakeRoot });

        assert.strictEqual(res.idsIfLoaded(), null, '图不在内存里 → null');
        assert.strictEqual(res.idsIfLoaded(), null, '再问一次仍然不应触发加载');

        assert.ok(res.ids().has('e1'), 'ids() 会主动加载');
        assert.ok(res.idsIfLoaded().has('e1'), '加载过之后就能直接拿到');
    });

    test('readSource：按需读取源条目（不预加载 origin 的 JSON 源数据）', () => {
        const res = originResource.createOriginResource({ extensionRoot: fakeRoot });

        const source = res.readSource('origin:elements:e1');
        assert.ok(source, '应取到来源文件');
        assert.ok(source.entry, `应解析出来源条目：${JSON.stringify(source)}`);
        assert.strictEqual(source.category, 'elements');
        assert.strictEqual(source.entry.id, 'e1');
        assert.strictEqual(source.entry.label, 'E1');

        assert.strictEqual(res.readSource('origin:elements:不存在'), null, '节点不在图里 → null');
    });
});

suite('服务层：mod 快速加载与工作区重载', () => {
    test('① 首次加载落盘；新实例直接命中缓存，且不解析任何文件', () => {
        const modPath = copyFixtureMod('mod-cache');
        const first = serviceApi.createService({ extensionRoot: EXT_ROOT, storageDir: STORAGE_DIR, log: noop, warn: noop }).loadMod(modPath);

        assert.strictEqual(first.fromCache, false);
        assert.ok(first.parsed > 0, '首次应真的解析了文件');
        assert.ok(first.graph.nodes.length > 0);
        assert.ok(fs.existsSync(first.cacheFile), '应写出节点图缓存');

        const second = serviceApi
            .createService({ extensionRoot: EXT_ROOT, storageDir: STORAGE_DIR, log: noop, warn: noop })
            .loadMod(modPath);

        assert.strictEqual(second.fromCache, true, '签名一致 → 命中磁盘缓存');
        assert.strictEqual(second.parsed, 0, '命中缓存时一个 json 都不解析');
        assert.strictEqual(second.synopsisOnly, true);
        assert.strictEqual(second.graph.nodes.length, first.graph.nodes.length, '两条路径节点数一致');
        assert.strictEqual(second.graph.edges.length, first.graph.edges.length, '连接线一致');
        assert.strictEqual(second.synopsis.name, '示例 Mod', '命中缓存也要能拿到 synopsis');
    });

    test('② quickLoad=false：跳过缓存，每次重新解析', () => {
        const modPath = copyFixtureMod('mod-noquick');
        const svc = serviceApi.createService({ extensionRoot: EXT_ROOT, storageDir: STORAGE_DIR, log: noop, warn: noop });

        const first = svc.loadMod(modPath);
        assert.strictEqual(first.fromCache, false);

        const again = svc.loadMod(modPath, { quickLoad: false });
        assert.strictEqual(again.fromCache, false, '关掉快速加载后不应命中缓存');
        assert.strictEqual(again.graph.nodes.length, first.graph.nodes.length);
    });

    test('③ 改文件后 refreshMod：只重解析变化的文件，patch 描述增删改', () => {
        const modPath = copyFixtureMod('mod-watch');
        const svc = serviceApi.createService({ extensionRoot: EXT_ROOT, storageDir: STORAGE_DIR, log: noop, warn: noop });

        const before = svc.loadMod(modPath);
        const beforeUids = before.graph.nodes.map((n) => n.uid).sort();

        // 改：元素 e1 的 label；加：一条新元素（内容长度不同 → 签名必然变化）
        fs.writeFileSync(
            path.join(modPath, 'content', 'elements', 'sample_elements.json'),
            JSON.stringify({
                elements: [
                    { id: 'fragmentmoth', label: '蛾之碎片（改过）', description: '一片蛾的碎片，是记忆也是伤疤。', lifetime: 60, isAspect: true, aspects: { moth: 1 } },
                    { id: 'addedbytest', label: '新增元素', lifetime: 1 },
                ],
            })
        );

        const reloaded = svc.refreshMod(modPath);
        assert.ok(reloaded.patch, '有上一张图 → 应给出 patch');
        assert.strictEqual(reloaded.parsed, 1, '只有变化的那个文件被重新解析');
        assert.ok(reloaded.reused >= 1, '其余文件复用解析结果');

        const addedUids = reloaded.patch.addedNodes.map((n) => n.uid);
        const updatedUids = reloaded.patch.updatedNodes.map((n) => n.uid);
        assert.ok(addedUids.some((u) => u.endsWith('addedbytest')), `新增节点应在 patch.addedNodes：${addedUids}`);
        assert.ok(updatedUids.some((u) => u.endsWith('fragmentmoth')), `改动节点应在 patch.updatedNodes：${updatedUids}`);
        assert.deepStrictEqual(reloaded.patch.removedNodeUids, []);
        assert.ok(reloaded.patch.ratio < 1, '只动了一个文件 → 变化比例应远小于 1');

        // 删文件 → 它的节点应出现在 removed 里
        fs.rmSync(path.join(modPath, 'content', 'elements', 'sample_elements.json'));
        const afterDelete = svc.refreshMod(modPath);
        assert.ok(afterDelete.patch.removedNodeUids.length >= 1, '删除文件后应有节点被移除');
        assert.ok(
            afterDelete.graph.nodes.length < reloaded.graph.nodes.length,
            '图规模应缩小'
        );

        assert.ok(beforeUids.length > 0);
    });

    test('④ 不变量：重载结果 ≡ 从零全量重跑（缓存不能改变结果）', () => {
        const modPath = copyFixtureMod('mod-invariant');
        const svc = serviceApi.createService({ extensionRoot: EXT_ROOT, storageDir: STORAGE_DIR, log: noop, warn: noop });

        svc.loadMod(modPath);
        fs.writeFileSync(
            path.join(modPath, 'content', 'recipes', 'extra.json'),
            JSON.stringify({ recipes: [{ id: 'extra_recipe', label: '附加配方', actionId: 'study' }] })
        );
        const fromCachePath = svc.refreshMod(modPath).graph;

        // 全新实例 + force：内存解析缓存与磁盘图缓存都不参与，等于从零跑一遍流水线
        const cold = serviceApi
            .createService({ extensionRoot: EXT_ROOT, storageDir: path.join(TMP_ROOT, 'cold-storage'), log: noop, warn: noop })
            .loadMod(modPath, { force: true }).graph;

        assert.deepStrictEqual(
            fromCachePath.nodes.map((n) => n.uid).sort(),
            cold.nodes.map((n) => n.uid).sort(),
            '节点集合必须完全一致'
        );
        assert.deepStrictEqual(
            fromCachePath.edges.map((e) => e.id).sort(),
            cold.edges.map((e) => e.id).sort(),
            '连接线集合必须完全一致'
        );
        assert.deepStrictEqual(fromCachePath.stats, cold.stats, '统计必须完全一致');
    });

    test('⑥ 命中缓存 + warm：后台预热后，改动只需重解析变化的文件', async () => {
        const modPath = copyFixtureMod('mod-warm');
        const storageDir = path.join(TMP_ROOT, 'warm-storage');
        const make = () => serviceApi.createService({ extensionRoot: EXT_ROOT, storageDir, log: noop, warn: noop });

        make().loadMod(modPath); // 先落一份磁盘缓存

        const svc = make();
        const cached = svc.loadMod(modPath, { warm: true });
        assert.strictEqual(cached.fromCache, true);
        assert.strictEqual(cached.parsed, 0, '命中缓存时仍不应解析任何文件');

        // 预热在 setImmediate 里跑，等它完成
        await new Promise((resolve) => setTimeout(resolve, 50));

        fs.writeFileSync(
            path.join(modPath, 'content', 'recipes', 'extra.json'),
            JSON.stringify({ recipes: [{ id: 'warmed_recipe', label: '预热后新增', actionId: 'study' }] })
        );
        const reloaded = svc.refreshMod(modPath);

        assert.strictEqual(reloaded.parsed, 1, '预热后只应重解析真正变化的文件');
        assert.ok(reloaded.reused >= 2, '其余文件应复用预热好的解析结果');
        assert.ok(reloaded.patch.addedNodes.some((n) => n.uid.endsWith('warmed_recipe')));
    });

    test('⑦ 加载 mod 不会顺带加载 origin（只借用已经加载好的索引）', () => {
        const modPath = copyFixtureMod('mod-lazy-origin');
        const svc = serviceApi.createService({ extensionRoot: EXT_ROOT, storageDir: STORAGE_DIR, log: noop, warn: noop });

        assert.strictEqual(svc.originIdsIfLoaded(), null, '初始状态：origin 未加载');
        svc.loadMod(modPath);
        assert.strictEqual(svc.originIdsIfLoaded(), null, '加载 mod 不应把整份 origin 拉进来');

        svc.loadOrigin();
        assert.ok(svc.originIdsIfLoaded() instanceof Set, '显式加载 origin 之后索引可用');
    });

    test('⑤ 画布文档：保存后能取回；forgetMod 会清掉该 mod 的磁盘缓存', () => {
        const svc = serviceApi.createService({ extensionRoot: EXT_ROOT, storageDir: STORAGE_DIR, log: noop, warn: noop });
        const doc = { pages: [{ id: 'p1', name: '主页面', nodes: [], edges: [] }], activeId: 'p1' };

        assert.ok(svc.saveDoc('unit-workspace', doc).ok);
        assert.deepStrictEqual(svc.loadDoc('unit-workspace').doc, doc);
        assert.strictEqual(svc.loadDoc('other-workspace').doc, null, '不同键互不干扰');

        const modPath = copyFixtureMod('mod-forget');
        const loaded = svc.loadMod(modPath);
        assert.ok(fs.existsSync(loaded.cacheFile));
        svc.forgetMod(modPath);
        assert.strictEqual(fs.existsSync(loaded.cacheFile), false, 'forgetMod 应清掉磁盘缓存');

        svc.dispose();
    });
});
