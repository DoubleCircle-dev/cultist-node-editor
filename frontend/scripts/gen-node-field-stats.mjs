#!/usr/bin/env node
/**
 * frontend/scripts/gen-node-field-stats.mjs —— 生成 `frontend/src/types/nodeFieldStats.js`
 *
 * 用途：给「节点属性档位」（最低 / 标准 / 全部，见 `frontend/src/types/nodePropertyLevels.js`）
 * 提供事实依据 —— **原版（origin）内容里每个字段在对应类别中的出现率**。
 *
 * 统计口径：
 *   - 只扫 `core/origin_resources/StreamingAssets/content/core/**`，
 *     不含 `content/loc_*`（翻译文件）与 `cultures`（与节点属性无关）；
 *   - 原版文件是 JSON5（尾逗号 / 不带引号的键），用 json5 解析；
 *   - 类别 = 数据文件最外围键；`slots` / `mutations` / `xtriggers` 属于嵌套结构，
 *     从 recipes / elements / verbs 的对应字段里单独汇总成同名类别；
 *   - 出现率 = 该字段出现的条目数 ÷ 该类别条目数（保留 1 位小数）。
 *
 * 用法（仓库根目录）：
 *   node frontend/scripts/gen-node-field-stats.mjs          # 写文件
 *   node frontend/scripts/gen-node-field-stats.mjs --check  # 只比对，不写文件（CI 用）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import json5 from 'json5';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const CONTENT_ROOT = path.join(REPO_ROOT, 'core', 'origin_resources', 'StreamingAssets', 'content', 'core');
const OUT_FILE = path.join(REPO_ROOT, 'frontend', 'src', 'types', 'nodeFieldStats.js');

/**
 * 基础节点类型 → 统计来源类别。
 *
 * 只登记「原版内容里真实存在对应结构」的类型；其余（`test` / `blank` / `extends` /
 * `copies` / `text` / `number` / `nodeSet` / `images`）没有真实数据可依据，
 * 任何档位都不做裁剪。
 */
const NODE_TYPE_SOURCES = {
    recipes: 'recipes',
    elements: 'elements',
    verbs: 'verbs',
    decks: 'decks',
    endings: 'endings',
    legacies: 'legacies',
    achievements: 'achievements',
    levers: 'levers',
    slots: 'slots',
    mutations: 'mutations',
    xtriggers: 'xtriggers',
    morphEffects: 'xtriggers',
};

/** 递归收集数据文件 */
function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full, out);
        else if (/\.json5?$/i.test(name)) out.push(full);
    }
    return out;
}

/** @returns {Map<string, { entries: number, fields: Map<string, number> }>} */
function scan() {
    /** @type {Map<string, { entries: number, fields: Map<string, number> }>} */
    const acc = new Map();

    const bump = (category, entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
        if (!acc.has(category)) acc.set(category, { entries: 0, fields: new Map() });
        const rec = acc.get(category);
        rec.entries += 1;
        for (const key of Object.keys(entry)) rec.fields.set(key, (rec.fields.get(key) || 0) + 1);
    };
    const bumpAll = (category, value) => {
        if (Array.isArray(value)) value.forEach((v) => bump(category, v));
        else bump(category, value);
    };

    for (const file of walk(CONTENT_ROOT)) {
        let data;
        try {
            data = json5.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            continue; // 解析失败的样本跳过：本脚本只统计，不做容错解析
        }
        if (!data || typeof data !== 'object') continue;

        for (const [category, entries] of Object.entries(data)) {
            if (!Array.isArray(entries)) continue;
            bumpAll(category, entries);

            // 嵌套结构 → 单独立账（对应 slots / mutations / xtriggers 三类节点）
            for (const entry of entries) {
                if (!entry || typeof entry !== 'object') continue;
                if (entry.slots) bumpAll('slots', entry.slots);
                else if (entry.slot) bumpAll('slots', entry.slot);
                if (entry.mutations) bumpAll('mutations', entry.mutations);
                if (entry.xtriggers && typeof entry.xtriggers === 'object') {
                    for (const effect of Object.values(entry.xtriggers)) {
                        // 简易写法：值是目标 id 字符串（没有操作数字段，跳过）
                        // 复杂写法：值是操作数对象或操作数数组
                        const operands = Array.isArray(effect) ? effect : effect && typeof effect === 'object' ? [effect] : [];
                        operands.forEach((operand) => bump('xtriggers', operand));
                    }
                }
            }
        }
    }
    return acc;
}

/** 类别 → `{ 字段: 出现率 }`（按出现率降序、同率按字段名升序，保证输出稳定） */
function buildTable() {
    const acc = scan();
    const table = {};
    for (const nodeType of Object.keys(NODE_TYPE_SOURCES)) {
        const rec = acc.get(NODE_TYPE_SOURCES[nodeType]);
        if (!rec || !rec.entries) continue;
        /** @type {Record<string, number>} */
        const fields = {};
        const sorted = [...rec.fields.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        for (const [name, count] of sorted) fields[name] = Math.round((count / rec.entries) * 1000) / 10;
        table[nodeType] = { entries: rec.entries, fields };
    }
    return table;
}

/** @param {{ entries: number, fields: Record<string, number> }} rec */
function renderRecord(rec) {
    const lines = Object.entries(rec.fields).map(([name, pct]) => `        ${JSON.stringify(name)}: ${pct},`);
    return ['{', `    entries: ${rec.entries},`, '    fields: {', ...lines, '    },', '},'].join('\n');
}

function renderFile(table) {
    const body = Object.entries(table)
        .map(([nodeType, rec]) => `    ${nodeType}: ${renderRecord(rec).replace(/\n/g, '\n    ')}`)
        .join('\n');
    const now = new Date();
    const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
    return `/**
 * nodeFieldStats.js —— 原版（origin）内容字段出现率（**自动生成，请勿手改**）
 *
 * 生成命令：\`node frontend/scripts/gen-node-field-stats.mjs\`（最近生成：${date}）
 * 数据来源：\`core/origin_resources/StreamingAssets/content/core/**\` 全量条目
 *
 * 结构：基础节点类型 → { entries: 样本条目数, fields: { 原版字段名: 出现率(%) } }
 *   - 字段名保留原版写法（如 \`actionid\` / \`decayTo\`），与属性名比较时**大小写不敏感**；
 *   - \`slots\` / \`mutations\` / \`xtriggers\` 的样本来自 recipes / elements / verbs 的嵌套结构；
 *   - 没有对应原版结构的节点类型（test / blank / extends / copies / text / number /
 *     nodeSet / images）不在此表中，档位裁剪对它们不生效。
 *
 * 消费方：\`frontend/src/types/nodePropertyLevels.js\`（按出现率裁剪「常驻属性」，
 * 被裁掉的一律进「修改可选属性」池，不做丢弃）。
 */

export const NODE_FIELD_STATS = {
${body}
};

export default NODE_FIELD_STATS;
`;
}

function main() {
    const table = buildTable();
    const content = renderFile(table);
    const checkOnly = process.argv.includes('--check');

    if (checkOnly) {
        const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
        const same = current.replace(/最近生成：\d{4}-\d{2}-\d{2}/, '') === content.replace(/最近生成：\d{4}-\d{2}-\d{2}/, '');
        console.log(same ? '✅ nodeFieldStats.js 与当前原版数据一致' : '❌ nodeFieldStats.js 已过期，请重新生成');
        process.exit(same ? 0 : 1);
    }

    fs.writeFileSync(OUT_FILE, content, 'utf8');
    console.log(`✅ 已写入 ${path.relative(REPO_ROOT, OUT_FILE).replace(/\\/g, '/')}`);
    for (const [nodeType, rec] of Object.entries(table)) {
        console.log(`   ${nodeType.padEnd(12)} ${String(rec.entries).padStart(5)} 条 / ${Object.keys(rec.fields).length} 个字段`);
    }
}

main();
