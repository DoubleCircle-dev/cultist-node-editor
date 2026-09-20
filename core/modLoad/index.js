'use strict';

/**
 * core/modLoad/index.js —— mod 纯函数层统一入口（显式分组导出）
 *
 * 拆分出的专门子工具（均不依赖 vscode，可独立加载/测试/复用）：
 *   - detect : synopsis.json 检测 / 定位 / 安全读 json
 *   - create : 新建 mod 基础结构（synopsis.json + content/）
 *   - parse  : 原始 mod json/json5 读取解析 + **最外围键拆分**
 *              （analyzeModJSON5 → modInfo.content；splitRootKeys / filesToGroups → 给 toData 的组）
 *   - toData : 数据文件 → 节点图（三段式：拆根键 → 建节点/连接性检测 → 解析连接）
 *             产物 `{ nodes, edges, external, warnings, stats }`；规则白名单在 mapping
 *   - origin : origin 游戏基础内容加载（源文件加载 + 随包分发的中间态快照）
 *             产物 `{ nodes, edges, ... }`；快照读写见 origin.js（snapshot 相关导出）
 *   - mapping: 类别映射规则（titleOf / 连接性检测白名单 inputs·outputs / 属性字段）
 *   - plugins: 字段映射插件注册表（TRM / 导入扩展等扩展字段的挂载点）
 *     —— mapping 只收原版本体字段，扩展字段一律以插件形式补充；
 *     写 JSON 插件文件 → `plugins.loadFile(path)` 或设置 `cultistNodeEditor.fieldPlugins`。
 *
 * ⚠️ 本目录只放**纯函数流水线**（不依赖 vscode，也不持有缓存与状态）。
 *    「加载结果缓存 / 工作区监听 / origin 资源索引 / 生命周期」在 `core/service/`：
 *      const service = require('./core/service');  // 纯服务层（可 headless 跑）
 *      const host = require('./core/service/host'); // vscode 环境绑定（storage / watcher / 设置）
 *
 * 用法：
 *   // 需要哪个函数就点名到子模块（归属一目了然，编辑器 F12/ctrl+点击直达定义）：
 *   const modLoad = require('./core/modLoad');
 *   modLoad.detect.findSynopsisInFolder(folder);
 *   modLoad.parse.analyzeModJSON5(modPath);
 *   modLoad.parse.filesToGroups(modInfo.content);
 *   modLoad.toData.contentFilesToData(modInfo.content, opts);
 *   modLoad.toData.singleFileToData(filePath);
 *
 *   // mod 功能「编排」（依赖 vscode：弹窗/校验/postMessage）不在本入口——
 *   // 统一放 core/modLoad/handlers.js，由 extension.js 直接转发调用：
 *   const modHandlers = require('./core/modLoad/handlers');
 *   modHandlers.handleReadMod(panel);
 *
 * 注：原「...require() 扁平铺开」已废弃——它无法从入口看出函数来源、同名会静默覆盖，
 *     还会把模块内部工具（如 toData 的 buildGraph/resolveEdges）一并泄露给调用方。
 */

const detect = require('./detect');
const create = require('./create');
const parse = require('./parse');
const toData = require('./toData');
const origin = require('./origin');
const mapping = require('./mapping');
const plugins = require('./plugins');

module.exports = {
    detect,
    create,
    parse,
    toData,
    origin,
    mapping,
    plugins,
};
