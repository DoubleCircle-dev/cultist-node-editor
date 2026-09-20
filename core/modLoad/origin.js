'use strict';

/**
 * core/modLoad/origin.js —— origin_resources 游戏基础内容（游戏自带的 recipes/elements/...）加载
 *
 * 加载方式演进：
 *   - 【当前】loadOriginToData：仍以**源文件形式**加载（walk StreamingAssets/content/core 的 .json → parse 拆根键 → toData 建节点图）。
 *   - 【后续优化】loadOriginSnapshot：origin 内容稳定不变，可**预先生成中间态 JSON 快照**（nodes + edges），
 *     前端直接加载快照，免去每次源文件解析/转换的开销。
 *
 * 由 core/modLoad/handlers.js 的 preloadOrigin 调用（打开编辑器时预加载游戏基础内容），
 * 同时其节点 id 集合会被缓存，供 mod 加载区分 external-origin / external-mod。
 */

const toData = require('./toData');

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
 * 【预留 / 后续优化】直接加载 origin 的中间态 JSON 快照（nodes + edges）。
 *
 * origin 内容稳定不变，可先跑一次源文件加载并落盘中间态快照（含 edges），
 * 之后前端加载直接读取该快照，跳过源文件解析与连接解析。
 *
 * @param {string} snapshotFile - 中间态 JSON 快照绝对路径
 * @returns {Promise<{ source: string, namespace: string, nodes: any[], edges: any[], external?: any[], warnings?: string[], stats?: any, file?: string }>}
 */
async function loadOriginSnapshot(snapshotFile) {
    //TODO: 实现中间态快照的生成与直接加载。当前 origin 仍走 loadOriginToData（源文件）。
    throw new Error(
        'loadOriginSnapshot 尚未实现：origin 中间态快照生成/缓存为后续优化；当前请用 loadOriginToData（源文件加载）'
    );
}

module.exports = {
    loadOriginToData,
    loadOriginSnapshot,
};
