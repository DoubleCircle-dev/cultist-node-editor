#!/usr/bin/env node
/**
 * scripts/gen-origin-snapshot.mjs —— 预生成 origin（游戏基础内容）的中间态 JSON 快照
 *
 * 为什么要预生成：源文件加载要 walk 约 180 个 json、逐份 JSON5 容错解析、再建 6000+ 节点与
 * 2.8 万条连接，约 0.9 s；而且**每次打开编辑器都要重付**。快照把这一切固化成一个文件，
 * 运行时只需一次 `JSON.parse`，所以快照随扩展分发（见 `.gitignore`：产物不进版本库，
 * 但 `package:vsix` 会先生成它、再打进 VSIX）。
 *
 * 快照里记着生成当时的 `mappingRevision`（`mapping.js` + 内置插件的源码摘要）。规则表一改，
 * 版本号就变，运行时读到旧快照会直接判为无效并回退源文件加载 —— 所以**不需要手工维护版本号**，
 * 也不会出现「快照与规则不同版本」的静默错误。
 *
 * 用法：
 *   node scripts/gen-origin-snapshot.mjs          # 生成/覆盖快照
 *   node scripts/gen-origin-snapshot.mjs --check  # 只校验现有快照是否仍然有效（不写盘）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const origin = require(path.join(ROOT, 'core', 'modLoad', 'origin.js'));
const mapping = require(path.join(ROOT, 'core', 'modLoad', 'mapping.js'));

/** origin 数据目录与快照产物路径 */
const CONTENT_DIR = path.join(ROOT, 'core', 'origin_resources', 'StreamingAssets', 'content', 'core');
const SNAPSHOT_FILE = path.join(ROOT, 'core', 'origin_resources', 'origin.graph.json');

/** 人类可读的字节数 */
function human(bytes) {
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
}

/** 只校验：快照存在、格式/版本/规则表版本都对得上 */
function check() {
    const revision = mapping.revision();
    const loaded = origin.loadOriginSnapshot(SNAPSHOT_FILE, { mappingRevision: revision });

    if (!loaded) {
        console.error(`❌ 快照不可用：${SNAPSHOT_FILE}`);
        console.error(`   （文件不存在、已损坏，或规则表版本与 mappingRevision=${revision} 不符）`);
        process.exit(1);
    }

    console.log(`✅ 快照有效：${path.relative(ROOT, SNAPSHOT_FILE)}`);
    console.log(`   生成于 ${loaded.generatedAt}｜规则表版本 ${revision}`);
    console.log(`   ${loaded.graph.nodes.length} 节点 / ${loaded.graph.edges.length} 连接线`);
}

/** 生成：源文件加载 → 写快照 */
function generate() {
    const started = Date.now();
    console.log(`📦 正在从源文件生成 origin 快照：${path.relative(ROOT, CONTENT_DIR)}`);

    const snapshot = origin.buildOriginSnapshot(CONTENT_DIR);
    const built = Date.now();

    const written = origin.writeOriginSnapshot(SNAPSHOT_FILE, snapshot);
    if (!written.ok) {
        console.error(`❌ 快照写入失败：${written.error}`);
        process.exit(1);
    }

    const stats = snapshot.graph.stats || {};
    console.log(`✅ 快照已生成：${path.relative(ROOT, SNAPSHOT_FILE)}（${human(written.bytes)}）`);
    console.log(`   规则表版本 ${snapshot.mappingRevision}｜生成耗时 ${built - started}ms`);
    console.log(
        `   ${snapshot.graph.nodes.length} 节点 / ${snapshot.graph.edges.length} 连接线` +
            `（解析 ${stats.resolved || 0}、文件外 ${(stats.externalOrigin || 0) + (stats.externalMod || 0)}）`
    );
}

if (process.argv.includes('--check')) check();
else generate();
