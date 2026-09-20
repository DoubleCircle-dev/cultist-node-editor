'use strict';

/**
 * core/modLoad/plugins/trm.js —— The Roost Machine 字段插件（内置）
 *
 * 只声明 **TRM 相对原版新增**的字段（原版字段在 mapping.js 本体里）。
 * 字段来源：wiki《自制模组》的 TRM 章节（`agent-scratch/help.mw`，
 * 提取产物 `agent-scratch/tmp/help-tables-20260920/help-field-tables.md`）。
 *
 * 规则的形状与 mapping.js 本体完全一致：只有「连接需求（link）」与「中间态转化」，
 * **不写** label / 控件类型 —— 渲染是前端的事（兜底 text）。
 *
 * 另外演示了**自定义 extract**：`fucine-ids` —— TRM 大量使用 Fucine 表达式
 * （`[~/extant:funds]`、`[lantern] || [forge]`），表达式本身不是 id，但里头的
 * `funds` / `lantern` / `forge` 是元素 id，值得接上连线。
 */

/** Fucine 表达式里的方括号片段 */
const BRACKET = /\[([^[\]]*)\]/g;

/** 像个 id 的片段（TRM 表达式里出现的标点一律不是 id 的一部分） */
const ID_LIKE = /^[A-Za-z0-9_.-]+$/;

/** 表达式里的地址关键字（`~/extant`、`~/tabletop` …）不是元素 id */
const PATH_WORDS = new Set(['extant', 'tabletop', 'tokens', 'situation', 'slots', 'root', 'card', 'and', 'or', 'not']);

/**
 * 从一段 Fucine 表达式里取出其中的元素 id。
 *
 * `[~/extant:funds]` → `funds`；`[lantern] || [forge]` → `lantern` / `forge`；
 * `[~/situation/slots/card1:mariner.cardorderpuzzle.tracks]` → `mariner.cardorderpuzzle.tracks`。
 *
 * @param {string} text - 表达式文本
 * @returns {string[]} 表达式里提到的 id
 */
function idsFromExpression(text) {
    /** @type {string[]} */
    const out = [];
    BRACKET.lastIndex = 0;
    let m;
    while ((m = BRACKET.exec(text))) {
        m[1]
            .split(/[|&(),:\s]+/)
            .map((token) => token.replace(/^[~/.]+/, '').trim())
            .filter((token) => ID_LIKE.test(token) && !PATH_WORDS.has(token))
            .forEach((token) => out.push(token));
    }
    return out;
}

module.exports = {
    id: 'trm',
    name: 'The Roost Machine',
    version: '2.0.0',
    description: 'TRM 扩展字段：全局需求 / 移动 / 衰变 / 回调 / 根路径、槽位催化剂、性相槽位、动词实例上限、卡组洗牌等',
    homepage: 'https://steamcommunity.com/sharedfiles/filedetails/?id=2625527332',

    /**
     * 自定义 extract：从 Fucine 表达式里抽 id。
     *
     * 支持 `keys`（先按点号路径取出子字段再扫描），没有 `keys` 就扫描整个字段值。
     */
    extracts: {
        'fucine-ids': (value, rule, ctx) => {
            /** @type {{ targetId: string; amount: number|null }[]} */
            const out = [];
            const seen = new Set();
            const take = (text) => {
                if (typeof text !== 'string') return;
                idsFromExpression(text).forEach((id) => {
                    if (seen.has(id)) return;
                    seen.add(id);
                    out.push({ targetId: id, amount: null });
                });
            };

            /** 递归扫描值里的所有字符串（键也算，因为 `{"[funds]": 1}` 的 id 在键上） */
            const scan = (v) => {
                if (typeof v === 'string') take(v);
                else if (Array.isArray(v)) v.forEach(scan);
                else if (v && typeof v === 'object') Object.entries(v).forEach(([k, val]) => (take(k), scan(val)));
            };

            if (Array.isArray(rule.keys) && rule.keys.length) {
                ctx.eachItem(value, (item) => rule.keys.forEach((key) => ctx.pickPath(item, key).forEach(scan)));
            } else {
                scan(value);
            }
            return out;
        },
    },

    categories: {
        recipes: {
            fields: [
                // 全局需求（grandReqs 的元素侧可以写 Fucine 表达式 → 两条规则一起用）
                { from: 'grandReqs', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'grandReqs', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'fucine-ids' } },

                // 槽位催化剂（写在 recipe.slots[].xtrigger 上）
                { from: 'slots', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'nested-id', keys: ['xtrigger'] } },
                { from: 'mutations', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'fucine-ids', keys: ['filter'] } },

                // 产出侧
                { from: 'movements', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map-values' } },
                { from: 'decays', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'nested-map', keys: ['filter'] } },
                { from: 'decays', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'fucine-ids', keys: ['filter'] } },
                { from: 'addCallbacks', link: { direction: 'output', targets: ['recipes'], multi: true, extract: 'map-values' } },
                { from: 'linked', link: { direction: 'output', targets: ['recipes'], multi: true, extract: 'nested-map', keys: ['chances'] } },
                { from: 'rootAdd', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'rootSet', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'completeverb', link: { direction: 'output', targets: ['verbs'], multi: true, extract: 'map' } },
                { from: 'deckShuffles', link: { direction: 'output', targets: ['decks'], multi: true, extract: 'scalar-list' } },
            ],
        },

        elements: {
            fields: [
                // 性相携带的卡槽（TRM）：内嵌定义 → 中间态提取成 slots 节点
                { from: 'aspectSlots', materialize: { as: 'node', type: 'slots', inline: true } },
                { from: 'slots', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'nested-id', keys: ['xtrigger'] } },
            ],
        },
    },
};
