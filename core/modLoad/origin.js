'use strict';

/**
 * core/modLoad/origin.js —— origin_resources 游戏基础内容（游戏自带的 recipes/elements/...）加载
 *
 * 两种加载方式：
 *   - `loadOriginToData`：**源文件加载** —— walk StreamingAssets/content/core 的 .json
 *     → parse 拆根键 → toData 建节点图。约 180 个文件、约 0.9 s，每次都要重付。
 *   - `loadOriginSnapshot`：**读预生成的中间态 JSON 快照**（nodes + edges）—— 一次 `JSON.parse`。
 *     快照随扩展分发（打包前由 `scripts/gen-origin-snapshot.mjs` 生成），所以运行时零等待。
 *
 * ⚠️ 快照会「冻结」生成当时的规则表，因此快照里记着 `mappingRevision`；读取时与
 * `mapping.revision()` 比对，不一致直接判为无效（返回 null）→ 调用方回退源文件加载。
 * 宁可慢一点，也不能拿旧规则产出的图去骗前端。
 *
 * 由 `core/service/originResource.js` 调用（服务层再缓存图与 id 索引）；
 * 其节点 id 集合供 mod 加载区分 external-origin / external-mod。
 */

const fs = require('fs');
const path = require('path');
const toData = require('./toData');
const mapping = require('./mapping');

/** 快照文件自己的格式标识与版本（中间态 JSON 结构变化时递增，旧快照自动作废） */
const SNAPSHOT_FORMAT = 'cne-origin-snapshot';
const SNAPSHOT_VERSION = 1;

/**
 * 以源文件形式加载 origin 游戏基础内容 → 节点图（nodes + edges，当前实现）。
 *
 * @param {string} originContentDir - .../content/core 绝对路径
 * @returns {ReturnType<typeof toData.loadOriginData>} 节点图（含 nodes / edges / external / warnings / stats / files）
 */
function loadOriginToData(originContentDir) {
    return toData.loadOriginData(originContentDir);
}

/**
 * 源文件加载 → 快照对象（带生成时的规则表版本）。
 *
 * 快照里**不含** `files`（原始 180 个文件的解析结果，约 20 MB 内存对象）：那是加载过程的
 * 中间产物，前端用不到，落盘只会让快照凭空胖一圈。`nodes` / `edges` / `external` /
 * `warnings` / `stats` 全部保留，与源文件加载的产物逐项一致。
 *
 * @param {string} originContentDir - .../content/core 绝对路径
 * @returns {{ format: string; version: number; mappingRevision: string; generatedAt: string; originContentDir: string; graph: any }}
 */
function buildOriginSnapshot(originContentDir) {
    const loaded = loadOriginToData(originContentDir);
    // 复制一份再去掉 files（`files` 是原始 180 个文件的解析结果，约 20 MB，落盘纯属浪费）
    const graph = { ...loaded };
    delete graph.files;

    return {
        format: SNAPSHOT_FORMAT,
        version: SNAPSHOT_VERSION,
        mappingRevision: mapping.revision(),
        generatedAt: new Date().toISOString(),
        originContentDir,
        graph,
    };
}

/**
 * 写快照文件（先写临时文件再 rename，避免生成到一半被读到半截）。
 *
 * @param {string} snapshotFile - 快照文件绝对路径
 * @param {ReturnType<typeof buildOriginSnapshot>} snapshot - 快照对象
 * @returns {{ ok: boolean; file: string; bytes: number; error?: string }} 写入结果
 */
function writeOriginSnapshot(snapshotFile, snapshot) {
    const body = JSON.stringify(snapshot);
    const tmpFile = `${snapshotFile}.tmp`;
    try {
        fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
        fs.writeFileSync(tmpFile, body, 'utf8');
        fs.renameSync(tmpFile, snapshotFile);
    } catch (error) {
        try {
            fs.rmSync(tmpFile, { force: true });
        } catch {
            /* 清理失败无副作用：下次写入会覆盖 */
        }
        return { ok: false, file: snapshotFile, bytes: 0, error: error.message };
    }
    return { ok: true, file: snapshotFile, bytes: Buffer.byteLength(body, 'utf8') };
}

/**
 * 直接加载 origin 的中间态 JSON 快照（nodes + edges）。
 *
 * 文件不存在、JSON 损坏、格式/版本不符、或规则表版本与当前不一致 → 一律返回 null，
 * 由调用方回退 `loadOriginToData`（源文件加载）。快照只能加速，不能成为故障源。
 *
 * @param {string} snapshotFile - 快照文件绝对路径
 * @param {{ mappingRevision?: string }} [options] - 期望的规则表版本（缺省用当前 mapping.revision()）
 * @returns {{ graph: any; generatedAt: string|null; stats: any }|null} 快照图（无效时为 null）
 */
function loadOriginSnapshot(snapshotFile, options = {}) {
    let raw;
    try {
        raw = fs.readFileSync(snapshotFile, 'utf8');
    } catch {
        return null;
    }

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return null;
    }

    if (!payload || payload.format !== SNAPSHOT_FORMAT) return null;
    if (payload.version !== SNAPSHOT_VERSION) return null;

    const expected = options.mappingRevision || mapping.revision();
    if (payload.mappingRevision !== expected) return null;

    const graph = payload.graph;
    if (!graph || graph.format !== 'cne-node-graph' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        return null;
    }

    return { graph, generatedAt: payload.generatedAt || null, stats: graph.stats || null };
}

module.exports = {
    SNAPSHOT_FORMAT,
    SNAPSHOT_VERSION,
    loadOriginToData,
    buildOriginSnapshot,
    writeOriginSnapshot,
    loadOriginSnapshot,
};
