'use strict';

/**
 * core/modLoad/plugins/importExtension.js —— 导入扩展（import extension）字段插件（内置）
 *
 * 手册里与 TRM 并列的另一套扩展：给实体加「元数据字段」（`$derives` / `$extends` / …）
 * 与「属性操作字段」（把普通字段名加上 `$add` / `$remove` / `$append` / `$plus` 之类的后缀）。
 * 字段来源：wiki《自制模组》/ import extension 章节（`agent-scratch/help.mw`）。
 *
 * 这个插件同时演示两件事：
 *   1. `allCategories`：字段对所有类别通用（不必在 12 个类别里各写一遍）；
 *   2. **正则 `from`**：`/^effects\$(add|remove)$/` 这类后缀字段名没法逐一枚举，
 *      用正则可以一次命中多个实际字段（每个实际命中的字段各记一条连接）。
 *
 * 规则形状与 mapping.js 本体一致：只写连接需求（link），不写 label / 控件类型。
 */

/** 属性操作后缀里「带引用值」的那些（`clear` 没有值，不用列） */
const VALUE_OPS = 'add|remove|append|prepend';

module.exports = {
    id: 'import-extension',
    name: '导入扩展（import extension）',
    version: '2.0.0',
    description: '导入扩展的实体元数据与属性操作字段（$derives/$extends/$depends/$incompatible、xxx$add/$append/…）',

    allCategories: {
        fields: [
            // 实体元数据：指向别的模组/实体（不是游戏里的条目 id，故 targets 留空 = 不限）
            { from: '$derives', link: { direction: 'input', targets: [], multi: true, extract: 'scalar-list' } },
            { from: '$extends', link: { direction: 'input', targets: [], multi: true, extract: 'scalar-list' } },
            { from: 'extends', link: { direction: 'input', targets: [], multi: true, extract: 'scalar-list' } }, // 旧写法
            { from: '$depends', link: { direction: 'input', targets: [], multi: true, extract: 'scalar-list' } },
            { from: '$incompatible', link: { direction: 'input', targets: [], multi: true, extract: 'scalar-list' } },

            // 属性操作：需要什么（字段名被替换成 `xxx$add` / `xxx$append` 形式）
            { from: new RegExp(`^requirements\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
            { from: new RegExp(`^extantreqs\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
            { from: new RegExp(`^tablereqs\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
            { from: new RegExp(`^xtriggers\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
            { from: new RegExp(`^slots\\$(append|prepend)$`, 'i'), link: { direction: 'input', targets: ['slots'], multi: true, extract: 'nested-map' } },

            // 属性操作：产出什么
            { from: new RegExp(`^effects\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
            { from: new RegExp(`^deckeffects\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'output', targets: ['decks'], multi: true, extract: 'map' } },
            { from: new RegExp(`^aspects\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
            { from: new RegExp(`^purge\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
            { from: new RegExp(`^haltverb\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'output', targets: ['verbs'], multi: true, extract: 'map' } },
            { from: new RegExp(`^deleteverb\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'output', targets: ['verbs'], multi: true, extract: 'map' } },
            { from: new RegExp(`^weights\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
            { from: new RegExp(`^xtriggers\\$(${VALUE_OPS})$`, 'i'), link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map-values' } },
            { from: new RegExp(`^mutations\\$(append|prepend)$`, 'i'), link: { direction: 'output', targets: ['elements'], multi: true, extract: 'nested-id', keys: ['mutate'] } },
            { from: new RegExp(`^(linked|alt|inductions)\\$(append|prepend)$`, 'i'), link: { direction: 'input', targets: ['recipes'], multi: true, extract: 'id-list' } },
            { from: new RegExp(`^statusbarelements\\$(append|prepend)$`, 'i'), link: { direction: 'output', targets: ['elements'], multi: true, extract: 'scalar-list' } },
        ],
    },
};
