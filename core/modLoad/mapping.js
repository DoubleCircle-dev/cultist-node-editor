'use strict';

/**
 * core/modLoad/mapping.js —— 字段规则表：**连接需求** + **中间态转化**
 *
 * 事实依据：官方 wiki《自制模组》手册（`agent-scratch/help.mw`），
 * 已提取为机器可读的字段表：`agent-scratch/tmp/help-tables-20260920/help-field-tables.{json,md}`
 * （提取脚本 `agent-scratch/scripts/extract-help-tables.cjs`）。
 * 每个类别规则都标注了对应章节；字段形态另有 origin 实测脚本
 * `agent-scratch/check-mod-fields.cjs` 复核。
 *
 * ── 三条边界（后端只描述语义，不做渲染决策）─────────────────────────────
 *
 * ① **基础属性类型不在这里声明**：后端按节点的原始 JSON 值现推
 *    `kind ∈ string | number | boolean | list | dict`（见 `kindOf`），
 *    每个字段的原始值原样交给前端（`props[].value`）。
 *    前端按 `kind` 决定用什么控件渲染，兜底 = 原生 text。
 *    —— 本文件**不写** text / number / bool / textarea / valueType 之类的东西。
 *
 * ② **连接需求**：需要连线的字段才在这里声明 `link`：
 *
 *    | link.xxx   | 含义                                                        |
 *    | ---------- | ----------------------------------------------------------- |
 *    | direction  | **本条目在这条线上是哪一侧**：`input` = 别的东西指向我（我是入线端）<br>`output` = 我指向别的东西（我是出线端）。targets 指向的元素/条目永远是另一侧 |
 *    | targets    | 对端条目类别（取自 wiki「取值类型」列），前端据此限制端口能连什么 |
 *    | multi      | 是否允许多条连接（默认 true）                                |
 *    | extract    | 从**值**里取目标 id 的方式（见 PICK_KINDS）                   |
 *    | keys       | `extract` 为 `nested-*` 时的子字段路径（支持点号 + 数组展开） |
 *    | port       | 端口名（默认 = 字段名）。同一字段上可写多条 `link`：同名同向合并，不同名 = 不同端口 |
 *    | reverse    | **反向记录**：`true` 表示游戏 JSON 的书写位置与判定逻辑不在同一端（见下），缺省 = 正向 |
 *
 *    `direction` 是「这条线画在哪一侧」的唯一依据，`toData` 据此把边变换成
 *    `edge.out` / `edge.in`（前端照着画即可，不用猜端口）。
 *
 *    **关于 `reverse`（反向记录）**：绝大多数关系里「字段写在谁身上」与「判定逻辑在谁身上」
 *    是同一端（如 `recipes.effects` 是 recipe 自己的产出、`recipes.requirements` 是它自己的
 *    进入条件），方向与 JSON 的书写位置一致，不带 `reverse`。
 *    少数**跳转分支与分支式触发**字段不是这样：`alt` / `linked` / `alternativerecipes` / `inductions`
 *    （recipe 的后续分支）与 `elements.induces`（卡牌列出的可能触发 recipe）的**列表都写在源条目上**
 *    （所以它是源条目的字段），但**「是否跳转 / 能否触发、以什么条件生效」
 *    由对端 recipe 自己的定义决定**（判定逻辑在对端的 JSON 里）—— 即记录位置与判定主体相反。
 *    这类字段：`direction` 仍是 `output`（节点模型里是「源 → 目标」），另标 `reverse: true`，
 *    消费方（前端 / 写回逻辑）据此知道**这条线的语义主体在对端**，
 *    不要因为「列表在源上」就把它当成源端说了算的关系。
 *    ⚠️ 这与 `mutations.filter` 那类「谁作用于我」不同：后者的判定逻辑仍在被写的条目上；
 *    与 `actionid` 也不同：行动框（verb）只是分类名、不是执行端，所以它仍是普通 `input`。

 *
 *    没有 `link` 的字段 = 普通属性：前端仍可给它一个隐式的值输入能力
 *    （例如接文本变量节点），但后端不产生数据连线。
 *
 * ③ **中间态转化**：内嵌在条目里的对象/列表，在中间态节点模型里不该只是属性，
 *    而要提取成节点或工具节点时，用 `materialize` 声明：
 *
 *    | materialize.as | 含义                                                       |
 *    | -------------- | ---------------------------------------------------------- |
 *    | `node`         | 提取成正式节点（`type` 是它的类别，如 slots / decks）        |
 *    | `tool`         | 提取成工具节点（表格/列表等，值留在工具节点里）              |
 *
 *    两种都由 `toData` 落地：`node` 建正式子节点，`tool` 建 `role:'tool'` 的节点
 *    （自带 `tool` 描述符）；**怎么把工具画出来是前端的事**，后端只给模型与数据。
 *
 *    `inline: true` 表示该字段的条目本身可以是「内联的完整定义」（如 `alt` 里
 *    直接写一整个 recipe），而不只是引用。
 *
 * ⚠️ **不属于本文件**：label / icon / 颜色 / 控件类型 / 多行文本 / 默认值 —— 都是前端展示层的事。
 * ⚠️ **扩展字段**（TRM / 导入扩展）走插件：内置 `plugins/trm.js`、`plugins/importExtension.js`；
 *    自定义插件见 `plugins/index.js` 文件头。生效规则表 = 本体表 + 启用中的插件
 *    （`plugins.mergeInto`，插件变动自动重建），规则上的 `plugin` 标明来源（本体为 `null`）。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const plugins = require('./plugins');

/** 取值方式（`link.extract`）清单：说明见文件头；内置种类由 plugins 提供 */
const PICK_KINDS = plugins.BUILTIN_EXTRACT_KINDS;

/** 兼容旧名（插件 API 里这条叫 extract） */
const EXTRACT_KINDS = PICK_KINDS;

/** 条目 id 字段：每个条目都有，不作为属性也不参与连线 */
const ID_FIELD = 'id';

/** 嵌套取值（nested-*）默认探查的子字段：CS 的槽位定义用这几个键描述容纳条件 */
const SLOT_SUB_KEYS = ['required', 'forbidden', 'essential', 'ifaspectspresent'];

/**
 * 不是目标 id 的字符串：Fucine 表达式（`[lantern] || [forge]`）与地址路径（`~/tabletop`）。
 * id 里不会出现 `[` `]` `~`，命中即视为表达式，不当目标（表达式的解析属于扩展字段的活儿）。
 */
const EXPRESSION_LIKE = /[[\]~]/;

/** 判断一个值是否是「像 id 的引用目标」 */
function isRefTarget(value) {
    return typeof value === 'string' && value.trim() !== '' && !EXPRESSION_LIKE.test(value);
}

/**
 * 原始 JSON 值 → **基础属性类型**（后端唯一要给的「类型」）
 *
 * 前端按它决定渲染（string → 文本输入，boolean → 勾选，list/dict → 表格/子面板…），
 * 兜底都是 text。后端不参与这个决定，只保证值原样给到。
 *
 * @param {any} value - 条目里的原始值
 * @returns {'null'|'list'|'string'|'number'|'boolean'|'dict'} 基础属性类型
 */
function kindOf(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'list';
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return t;
    if (t === 'object') return 'dict';
    return 'string';
}

/**
 * 各 category 的字段规则表。
 *
 * 只列「需要连线」或「需要中间态转化」的字段；其余字段由后端兜底成普通属性
 * （原始值 + kindOf），所以这里比字段总数短得多 —— 这正是「映射只做优化」的意思。
 */
const RULES = {
    categories: {
        /** wiki：创建模组 / recipes / 字段表（本体） */
        recipes: {
            wiki: '创建模组 / recipes / 字段表（本体）',
            fields: [
                // 行动：指向 verbs 里的行动框（历史数据里 actionid / actionId 两种写法）
                // ⚠️ verb 不是执行端，只相当于分类名 → 方向是 input（行动框 → 本 recipe），且**不算反向记录**
                { from: 'actionid', link: { direction: 'input', targets: ['verbs'], multi: false, extract: 'id' } },

                // 需求：进入本 recipe 的前提（元素/性相 → 本 recipe）
                { from: 'requirements', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'reqs', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } }, // 旧写法
                { from: 'extantreqs', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'tablereqs', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },

                // 结果：产出/销毁元素、本 recipe 的性相
                { from: 'effects', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'aspects', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'purge', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'xpans', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },

                // 突变：filter 是筛选条件（入），mutate 是结果（出）
                {
                    from: 'mutations',
                    link: { direction: 'input', targets: ['elements'], multi: true, extract: 'nested-map', keys: ['filter', 'filterOnAspectId'] },
                    materialize: { as: 'tool', type: 'table' },
                },
                {
                    from: 'mutations',
                    link: { direction: 'output', targets: ['elements'], multi: true, extract: 'nested-id', keys: ['mutate', 'mutateAspectId'] },
                },

                // 后续 recipe（跳转分支）：分支列表写在本条目上 → 节点模型里是输出（本条目 → 目标）；
                // 但「是否跳转 / 以什么条件生效」由**目标 recipe 自己的定义**决定（判定逻辑在对端 JSON 里）
                // → 标 reverse，提醒消费方语义主体在对端。
                {
                    from: 'alt',
                    link: { direction: 'output', reverse: true, targets: ['recipes'], multi: true, extract: 'id-list' },
                    materialize: { as: 'node', type: 'recipes', inline: true },
                },
                {
                    from: 'linked',
                    link: { direction: 'output', reverse: true, targets: ['recipes'], multi: true, extract: 'id-list' },
                    materialize: { as: 'node', type: 'recipes', inline: true },
                },
                {
                    from: 'alternativerecipes', // 旧写法
                    link: { direction: 'output', reverse: true, targets: ['recipes'], multi: true, extract: 'id-list' },
                    materialize: { as: 'node', type: 'recipes', inline: true },
                },
                {
                    from: 'inductions',
                    link: { direction: 'output', reverse: true, targets: ['recipes'], multi: true, extract: 'id-list' },
                    materialize: { as: 'node', type: 'recipes', inline: true },
                },

                // 把卡牌弹出去交给别的 recipe（expulsion.filter 是被弹出的元素）
                { from: 'alt', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'nested-map', keys: ['expulsion.filter'], port: 'alt.expulsion' } },
                { from: 'alternativerecipes', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'nested-map', keys: ['expulsion.filter'], port: 'alternativerecipes.expulsion' } },
                { from: 'inductions', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'nested-map', keys: ['expulsion.filter'], port: 'inductions.expulsion' } },

                // 卡槽：内嵌定义 → 拆分节点（splitInline），里面的条件由拆出来的 slots 节点自己声明；
                // id 仍然是一条引用：指向别处定义好的同一个卡槽时靠它连线
                {
                    from: 'slots',
                    link: { direction: 'output', targets: ['slots'], multi: true, extract: 'nested-id', keys: ['id'] },
                    materialize: { as: 'node', type: 'slots', inline: true },
                },

                // 卡组
                { from: 'deckeffects', link: { direction: 'output', targets: ['decks'], multi: false, extract: 'map' } },
                { from: 'deckeffect', link: { direction: 'output', targets: ['decks'], multi: false, extract: 'map' } }, // 旧写法
                {
                    from: 'internaldeck',
                    link: { direction: 'output', targets: ['decks'], multi: false, extract: 'nested-id', keys: ['id'] },
                    materialize: { as: 'node', type: 'decks', inline: true },
                },

                // 动词
                { from: 'haltverb', link: { direction: 'output', targets: ['verbs'], multi: true, extract: 'map' } },
                { from: 'deleteverb', link: { direction: 'output', targets: ['verbs'], multi: true, extract: 'map' } },

                // 结局 / 漫宿
                { from: 'ending', link: { direction: 'output', targets: ['endings'], multi: false, extract: 'id' } },
                { from: 'portaleffect', link: { direction: 'output', targets: ['portals'], multi: false, extract: 'id' } },
            ],
        },

        /** wiki：创建模组 / elements / 卡牌、性相 */
        elements: {
            wiki: '创建模组 / elements / 卡牌・性相',
            fields: [
                {
                    from: 'slots',
                    link: { direction: 'output', targets: ['slots'], multi: true, extract: 'nested-id', keys: ['id'] },
                    materialize: { as: 'node', type: 'slots', inline: true },
                },
                { from: 'inherits', link: { direction: 'input', targets: ['elements'], multi: false, extract: 'id' } },
                { from: 'decayTo', link: { direction: 'output', targets: ['elements'], multi: false, extract: 'id' } },
                { from: 'burnTo', link: { direction: 'output', targets: ['elements'], multi: false, extract: 'id' } },
                { from: 'aspects', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'xtriggers', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' }, materialize: { as: 'tool', type: 'table' } },
                { from: 'xtriggers', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map-values' } },
                // 卡牌/性相列出的「可能触发的 recipe」：与 alt 同构 —— 列表写在元素上，
                // 但能否触发看目标 recipe 自己的定义（additional 时还要看它所需的行动框能否创建）→ reverse
                { from: 'induces', link: { direction: 'output', reverse: true, targets: ['recipes'], multi: true, extract: 'id-list' } },
                { from: 'lever', link: { direction: 'output', targets: ['levers'], multi: false, extract: 'id' } },
            ],
        },

        /** wiki：创建模组 / verbs */
        verbs: {
            wiki: '创建模组 / verbs',
            fields: [
                {
                    from: 'slot',
                    link: { direction: 'output', targets: ['slots'], multi: false, extract: 'nested-id', keys: ['id'] },
                    materialize: { as: 'node', type: 'slots', inline: true },
                },
                {
                    from: 'slots',
                    link: { direction: 'output', targets: ['slots'], multi: true, extract: 'nested-id', keys: ['id'] },
                    materialize: { as: 'node', type: 'slots', inline: true },
                },
            ],
        },

        /** wiki：创建模组 / decks（手册为散文，无表格；字段形态按 origin 实测） */
        decks: {
            wiki: '创建模组 / decks（散文）',
            fields: [
                { from: 'spec', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'scalar-list' } },
                { from: 'defaultcard', link: { direction: 'output', targets: ['elements'], multi: false, extract: 'id' } },
                { from: 'drawmessages', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
            ],
        },

        /** wiki：创建模组 / endings */
        endings: {
            wiki: '创建模组 / endings',
            fields: [
                { from: 'achievement', link: { direction: 'output', targets: ['achievements'], multi: false, extract: 'id' } },
                { from: 'achievements', link: { direction: 'output', targets: ['achievements'], multi: true, extract: 'scalar-list' } },
            ],
        },

        /** wiki：创建模组 / achievement */
        achievements: {
            wiki: '创建模组 / achievement',
            fields: [{ from: 'category', link: { direction: 'output', targets: ['achievements'], multi: false, extract: 'id' } }],
        },

        /** wiki：创建模组 / legacy */
        legacies: {
            wiki: '创建模组 / legacy',
            fields: [
                { from: 'fromEnding', link: { direction: 'input', targets: ['endings'], multi: false, extract: 'id' } },
                { from: 'startingVerbId', link: { direction: 'input', targets: ['verbs'], multi: false, extract: 'id' } },
                { from: 'effects', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'statusbarelements', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'scalar-list' } },
                { from: 'excludesOnEnding', link: { direction: 'output', targets: ['legacies'], multi: true, extract: 'scalar-list' } },
            ],
        },

        /** wiki：创建模组 / levers / json编写lever */
        levers: {
            wiki: '创建模组 / levers / json编写lever',
            fields: [
                { from: 'weights', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'defaultValue', link: { direction: 'output', targets: ['elements'], multi: false, extract: 'id' } },
                { from: 'redirects', link: { direction: 'output', targets: ['elements'], multi: true, extract: 'map' } },
            ],
        },

        /** wiki：创建模组 / slots（字段说明在各章节的 slots 小节；rules 只列有引用的） */
        slots: {
            wiki: '创建模组 / slots',
            fields: [
                { from: 'required', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'forbidden', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'essential', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'ifaspectspresent', link: { direction: 'input', targets: ['elements'], multi: true, extract: 'map' } },
                { from: 'actionid', link: { direction: 'input', targets: ['verbs'], multi: false, extract: 'id' } },
                { from: 'xtrigger', link: { direction: 'input', targets: ['elements'], multi: false, extract: 'id' } },
            ],
        },

        /** 漫宿之路：wiki 未给字段表，按 origin 实测保留 consequences */
        portals: {
            wiki: '（origin 实测）',
            fields: [{ from: 'consequences', link: { direction: 'output', targets: [], multi: true, extract: 'id-list' } }],
        },
    },

    /**
     * 兜底：未定义规则的类别（或插件新声明的类别）
     * 无 link → 不产出任何连接线，字段全部走「原始值 + kindOf」的普通属性。
     */
    fallback: {
        wiki: '',
        fields: [],
    },
};

/** 本体规则表（插件不污染它；mapping.categories 才是生效表） */
const baseCategories = RULES.categories;

/** 生效规则表：本体表 + 启用中的插件（对象身份固定，就地增删键，插件变更自动重建） */
const categories = {};

/** 按启用中的插件重建生效表 */
function rebuildRules() {
    const merged = plugins.mergeInto(baseCategories);
    Object.keys(categories).forEach((k) => delete categories[k]);
    Object.assign(categories, merged);
}

const fallback = RULES.fallback;

/** 插件注册/启停 → 自动重建生效表 */
plugins.onChange(rebuildRules);
rebuildRules();

/* ────────────────────────────── 取值原语 ────────────────────────────── */

/**
 * 大小写不敏感地取字段真实名（CS 原始数据既有 actionId 也有 actionid 写法）
 *
 * @param {Record<string, any>} entry - 原始条目
 * @param {string|RegExp} name - 声明里的字段名（字符串）或正则
 * @returns {string|null} 条目里实际存在的字段名（首个命中）
 */
function actualFieldName(entry, name) {
    const hits = actualFieldNames(entry, name);
    return hits.length ? hits[0] : null;
}

/**
 * 取字段真实名（可多个）—— 规则里 `from` 支持正则，是为了 `xxx$add` / `xxx$append`
 * 这类「字段名带后缀」的属性操作字段（一个正则能命中好几个实际字段）。
 *
 * @param {Record<string, any>} entry - 原始条目
 * @param {string|RegExp} name - 字段名（字符串，大小写不敏感）或正则
 * @returns {string[]} 条目里实际存在的字段名
 */
function actualFieldNames(entry, name) {
    if (!entry || typeof entry !== 'object') return [];
    if (name instanceof RegExp) {
        name.lastIndex = 0; // 防插件写带 g 的正则时 test() 状态残留
        return Object.keys(entry).filter((k) => {
            name.lastIndex = 0;
            return name.test(k);
        });
    }
    if (typeof name !== 'string') return [];
    if (name in entry) return [name];
    const hit = Object.keys(entry).find((k) => k.toLowerCase() === name.toLowerCase());
    return hit ? [hit] : [];
}

/**
 * 按「点号路径」取子值，遇到数组自动逐元素展开（返回扁平列表）。
 *
 * 供 `link.keys` 使用（如 `slots` + `id`、`alt` + `expulsion.filter`）：
 * 每层都走 actualFieldName，所以 `expulsionFilter` / `expulsionfilter` 这类大小写差异也吃得住；
 * 任一层缺失就返回空，不抛错、也不猜。
 *
 * @param {any} source - 起始对象（条目本身，或数组里的一个元素）
 * @param {string} path - 点号路径
 * @returns {any[]} 命中的子值（数组已展开）
 */
function pickPath(source, path) {
    const parts = String(path).split('.');
    const walk = (node, i) => {
        if (node == null) return [];
        if (Array.isArray(node)) return node.flatMap((item) => walk(item, i));
        if (i >= parts.length) return [node];
        const key = actualFieldName(node, parts[i]);
        return key ? walk(node[key], i + 1) : [];
    };
    return walk(source, 0);
}

/**
 * 按规则从引用字段值里抽出「目标 id + 数量」（连接需求里的取值层）。
 *
 * 只做形态解析，不做存在性判断 —— 目标是否存在由调用方按 id 索引决定。
 * 形态不符（如声明 map 却给数组）时返回空数组，不抛错、不猜测；
 * Fucine 表达式会被 isRefTarget 挡掉，不产生假目标。
 *
 * @param {any} value - 字段原始值
 * @param {{ extract?: string, keys?: string[] }} rule - 字段规则（读 link 里的取值方式）
 * @returns {{ targetId: string; amount: number|null }[]} 目标 id 列表（已去重）
 */
function collectRefTargets(value, rule) {
    const kind = rule.extract || 'map';
    /** @type {{ targetId: string; amount: number|null }[]} */
    const out = [];

    /** 收一个目标（跳过空值/表达式/重复；amount 只记数值） */
    const push = (targetId, amount = null) => {
        if (!isRefTarget(targetId)) return;
        const id = targetId.trim();
        if (out.some((t) => t.targetId === id)) return;
        out.push({ targetId: id, amount: typeof amount === 'number' ? amount : null });
    };

    /** 一个「键 = 目标 id」的映射对象（requirements / effects / aspects / weights…） */
    const collectMap = (obj) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
        Object.entries(obj).forEach(([key, v]) => push(key, v));
    };

    /** 值即引用（xtriggers / movements / addCallbacks…）：字符串、含 id 的对象、或它们的数组 */
    const collectValue = (v, amount = null) => {
        if (Array.isArray(v)) v.forEach((item) => collectValue(item, amount));
        else if (v && typeof v === 'object') {
            const level = v.level == null ? (v.chance == null ? amount : v.chance) : v.level;
            push(v.id, level);
        } else if (typeof v === 'string') push(v, amount);
    };

    /** 通用收集（nested-* 命中的子值）：对象 → 键，数组 → 元素，标量 → 自身 */
    const collectAny = (v) => {
        if (Array.isArray(v)) v.forEach((item) => (item && typeof item === 'object' ? push(item.id, item.amount) : push(item)));
        else if (v && typeof v === 'object') collectMap(v);
        else push(v);
    };

    /** 遍历「对象 或 对象数组」里的每个对象 */
    const eachItem = (v, fn) => {
        if (Array.isArray(v)) v.forEach((item) => item && typeof item === 'object' && !Array.isArray(item) && fn(item));
        else if (v && typeof v === 'object') fn(v);
    };

    /** 自定义 extract 的上下文：把内置取值原语借给插件，免得它自己重写一套 */
    const ctx = { push, collectMap, collectValue, collectAny, eachItem, pickPath, isRefTarget, keys: rule.keys };

    switch (kind) {
        case 'map':
            collectMap(value);
            break;

        case 'map-values':
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                Object.values(value).forEach((v) => collectValue(v));
            }
            break;

        case 'id-list':
            (Array.isArray(value) ? value : []).forEach((item) => {
                if (item && typeof item === 'object' && !Array.isArray(item)) push(item.id, item.chance);
                else if (typeof item === 'string') push(item);
            });
            break;

        case 'scalar-list':
            (Array.isArray(value) ? value : []).forEach((item) => {
                if (typeof item === 'string' || typeof item === 'number') push(String(item));
            });
            break;

        case 'id':
            if (typeof value === 'string') push(value);
            break;

        case 'nested-map':
            eachItem(value, (item) => {
                (rule.keys || []).forEach((key) => pickPath(item, key).forEach(collectAny));
            });
            break;

        case 'nested-id':
            eachItem(value, (item) => {
                (rule.keys || []).forEach((key) => pickPath(item, key).forEach((v) => push(v)));
            });
            break;

        default: {
            // 插件注册的自定义 extract（如 TRM 的 fucine-ids）：解析器抛错只告警，
            // 当作本次没解析出目标，不影响整张表的加载。
            const handler = plugins.getExtract(kind);
            if (!handler) break;
            try {
                (handler(value, rule, ctx) || []).forEach(({ targetId, amount }) => push(targetId, amount));
            } catch (e) {
                console.warn(`⚠️ 自定义 extract "${kind}" 解析失败:`, e && e.message);
            }
            break;
        }
    }

    return out;
}

/* ────────────────────────────── 规则查询 / 属性组装 ────────────────────────────── */

/** 规则表版本缓存（源码不变则只算一次） */
let revisionCache = null;

/**
 * 规则表版本号：本体规则 + 内置插件源码的内容摘要。
 *
 * 用途：origin 中间态快照、节点图磁盘缓存都依赖规则表。规则表变了（连字段白名单变了、
 * 取值方式改了），旧快照就不可信了，必须重新生成。手写版本号很容易忘，所以直接对
 * 源码取摘要——改了源码版本号自然就变了，无需维护。
 *
 * @returns {string} 16 位十六进制摘要
 */
function revision() {
    if (revisionCache) return revisionCache;

    let pluginFiles = [];
    try {
        pluginFiles = fs
            .readdirSync(path.join(__dirname, 'plugins'))
            .filter((name) => name.endsWith('.js'))
            .sort()
            .map((name) => path.join(__dirname, 'plugins', name));
    } catch {
        pluginFiles = []; // 目录不存在（不应发生）→ 只按本体表算
    }

    const hash = crypto.createHash('sha1');
    [__filename, ...pluginFiles].forEach((file) => {
        hash.update(path.basename(file));
        try {
            hash.update(fs.readFileSync(file));
        } catch {
            hash.update('unreadable');
        }
    });

    revisionCache = hash.digest('hex').slice(0, 16);
    return revisionCache;
}

/**
 * 由类别名取规则：精确命中 → 大小写不敏感 → 单复数/别名兜底 → fallback。
 *
 * @param {string} category - 数据文件的最外围键（= 前端节点类型名）
 * @returns {{ wiki: string; fields: any[] }} 类别规则
 */
function ruleFor(category) {
    const key = String(category == null ? '' : category).trim();
    if (categories[key]) return categories[key];

    const lower = key.toLowerCase();
    const ciHit = Object.keys(categories).find((k) => k.toLowerCase() === lower);
    if (ciHit) return categories[ciHit];

    const aliasKey = CATEGORY_ALIASES[lower] || CATEGORY_ALIASES[singularize(lower)] || CATEGORY_ALIASES[`${lower}s`];
    if (aliasKey && categories[aliasKey]) return categories[aliasKey];

    return fallback;
}

/** 数据里出现过的拼写差异 → 规范类别名（键均为小写） */
const CATEGORY_ALIASES = {
    legcies: 'legacies', // origin 数据里的真实拼写错误（content/core/legacies 下某文件根键）
    verb: 'verbs',
    recipe: 'recipes',
    element: 'elements',
    deck: 'decks',
    ending: 'endings',
    legacy: 'legacies',
    portal: 'portals',
    lever: 'levers',
    achievement: 'achievements',
    culture: 'cultures',
    dictum: 'dicta',
    setting: 'settings',
};

/**
 * 复数类别名 → 单数（recipes→recipe），用于别名兜底
 *
 * @param {string} key - 类别名
 * @returns {string} 单数形式
 */
function singularize(key) {
    if (key.endsWith('ies')) return key.slice(0, -3) + 'y';
    if (key.endsWith('s')) return key.slice(0, -1);
    return key;
}

/**
 * 取某个字段在该类别下声明的全部字段规则（同一字段可有多条：双向、或分属不同用法）。
 *
 * @param {string} category - 类别
 * @param {string} field - 字段名（大小写不敏感）
 * @returns {any[]} 命中的规则（含 plugin 来源标记）
 */
function fieldRulesFor(category, field) {
    const rule = ruleFor(category);
    return (rule.fields || []).filter((r) => actualFieldNames({ [field]: null }, r.from).length > 0);
}

/**
 * 组装一个条目的属性定义（后端唯一要向给前端交付的「属性」形状）。
 *
 * 对条目里的**每个字段**（除 id）产出一条：
 *   `{ name, kind, value, links, materialize }`
 *   - `name`：数据里的真实字段名（原样大小写）
 *   - `kind`：由值的 JSON 类型推（后端给的「基础属性类型」，渲染由前端决定）
 *   - `value`：原始值，原样（不加工、不字符串化）
 *   - `links`：连接需求列表（无声明 = 空数组）。**同一字段可以有多条**：
 *     同一端口名（`port`，默认 = 字段名）的多条规则合并（目标类别取并集），
 *     不同端口名 = 该字段上有多个不同含义的连接口（如 alt 的「后续 recipe」与「弹出元素」）。
 *     条目里带 `reverse: true` 的表示「反向记录」（书写位置与判定主体相反，见文件头）。
 *   - `materialize`：中间态转化（无声明 = null）
 *
 * @param {Record<string, any>} entry - 原始条目
 * @param {{ fields?: any[] }} rule - 类别规则
 * @returns {Record<string, any>[]} 属性定义列表
 */
function buildProps(entry, rule) {
    /** @type {Map<string, Record<string, any>>} 真实字段名 → 属性定义 */
    const byField = new Map();

    Object.entries(entry || {}).forEach(([name, value]) => {
        if (name === ID_FIELD) return;
        byField.set(name, { name, kind: kindOf(value), value, links: [], materialize: null });
    });

    (rule && rule.fields ? rule.fields : []).forEach((r) => {
        actualFieldNames(entry, r.from).forEach((field) => {
            if (field === ID_FIELD) return;
            const prop =
                byField.get(field) ||
                { name: field, kind: kindOf(entry[field]), value: entry[field], links: [], materialize: null };

            if (r.link) {
                const port = r.link.port || field;
                const exist = prop.links.find((l) => l.port === port && l.direction === (r.link.direction || 'input'));
                if (exist) {
                    // 同一端口上的多条规则：目标类别取并集（如 TRM 的 grandReqs 两种取值方式）
                    (r.link.targets || []).forEach((t) => {
                        if (!exist.targets.includes(t)) exist.targets.push(t);
                    });
                } else {
                    prop.links.push({
                        port,
                        direction: r.link.direction === 'output' ? 'output' : 'input',
                        targets: [...(r.link.targets || [])],
                        multi: r.link.multi !== false,
                        extract: r.link.extract || 'map',
                        ...(r.link.keys ? { keys: r.link.keys } : {}),
                        // 反向记录（书写位置与判定主体相反）才标记，正向不占位（契约里缺省 = 正向）
                        ...(r.link.reverse ? { reverse: true } : {}),
                        plugin: r.plugin || null,
                    });
                }
            }
            if (r.materialize) prop.materialize = { ...r.materialize, plugin: r.plugin || null };
            byField.set(field, prop);
        });
    });

    return [...byField.values()];
}

/* ────────────────────────────── 加连接 / 拆节点（mapping 的职责） ────────────────────────────── */

/**
 * 连接需求检测：把一个条目的字段过一遍规则表里带 `link` 的声明，抽出目标 id。
 *
 * 流水线里这一步属于 **mapping**（「增加连接」）；`toData` 只负责把它融合成中间态 JSON。
 *
 * 登记粒度是「端口 + 方向」：
 *   - 同一端口上的多条规则合并（目标 id 取并集、目标类别取并集、来源合并）；
 *   - 不同端口（`link.port` 不同，默认 = 字段名）各记一条。
 *
 * @param {string} category - 类别（= 节点类型 = 数据文件最外围键）
 * @param {Record<string, any>} entry - 原始条目
 * @returns {{
 *     field: string;
 *     port: string;
 *     side: 'input' | 'output';
 *     extract: string;
 *     multi: boolean;
 *     targets: string[];
 *     reverse?: true;
 *     plugin: string|null;
 *     materialize: Record<string, any>|null;
 *     sources: string[];
 *     targetIds: { targetId: string; amount: number|null }[];
 * }[]} 连接需求（一个「端口 + 方向」一条）
 */
function connectionsOf(category, entry) {
    const rule = ruleFor(category);

    /** @type {ReturnType<typeof connectionsOf>} */
    const connections = [];
    /** @type {Map<string, ReturnType<typeof connectionsOf>[number]>} 端口+方向 → 已登记的连接 */
    const byPortSide = new Map();

    (rule.fields || []).forEach((r) => {
        if (!r.link) return; // 只声明「中间态转化」的规则不参与连接
        const side = r.link.direction === 'output' ? 'output' : 'input';
        const source = r.plugin || 'mapping'; // 规则来源：本体规则记为 mapping，插件规则记插件 id

        // 规则的 from 可能是正则（插件里的 `xxx$add` 这类属性操作字段）→ 一个规则命中多个字段
        actualFieldNames(entry, r.from).forEach((field) => {
            const targetIds = collectRefTargets(entry[field], r.link);
            if (!targetIds.length) return; // 数据里没这个字段 / 形态不符 → 不虚报端口

            // 端口名：规则写了 port 用它，否则就是字段名；同一端口上的多条规则合并
            const port = r.link.port || field;
            const key = `${side}:${port}`;
            const exist = byPortSide.get(key);
            if (exist) {
                targetIds.forEach(({ targetId, amount }) => {
                    if (exist.targetIds.some((t) => t.targetId === targetId)) return;
                    exist.targetIds.push({ targetId, amount });
                });
                (r.link.targets || []).forEach((t) => {
                    if (!exist.targets.includes(t)) exist.targets.push(t);
                });
                if (!exist.sources.includes(source)) exist.sources.push(source);
                return;
            }

            const conn = {
                field,
                port,
                side,
                extract: r.link.extract || 'map',
                multi: r.link.multi !== false,
                targets: [...(r.link.targets || [])],
                // 反向记录：书写位置（本条目）与判定主体（对端）相反，如 alt / linked（见文件头）
                ...(r.link.reverse ? { reverse: true } : {}),
                plugin: r.plugin || null,
                materialize: r.materialize || null,
                sources: [source],
                targetIds,
            };
            byPortSide.set(key, conn);
            connections.push(conn);
        });
    });

    return connections;
}

/**
 * 纯引用参数：只写了这些键的内嵌条目只是「指向别处」，不算一份内联定义
 * （如 `alt: [{ id: 'r2', chance: 50 }]` 不是新 recipe，`{ id: 'r2', warmup: 10 }` 才是）
 */
const INLINE_REF_KEYS = new Set(['id', 'chance', 'challenges', 'additional', 'expulsion', 'randompick', 'usecallback']);

/**
 * 拆分内嵌节点：把声明了 `materialize({ as: 'node', inline: true })` 的字段里，
 * 每个**内联定义**拆成一个独立节点（如 `recipes.slots[]` → `slots` 节点）。
 *
 * 流水线里这一步属于 **mapping**（「拆分节点」）；`toData` 负责为拆出来的条目建节点、
 * 生成包含关系连线并融合成中间态 JSON。
 *
 * 判定：内嵌条目里出现了引用参数之外的键，才算一份定义（否则只是普通引用，交给连线处理）。
 *
 * @param {string} category - 宿主条目的类别
 * @param {Record<string, any>} entry - 宿主条目
 * @returns {{ category: string; field: string; index: number; entry: Record<string, any> }[]} 拆出来的内嵌定义
 */
function splitInline(category, entry) {
    const rule = ruleFor(category);
    /** @type {{ category: string; field: string; index: number; entry: Record<string, any> }[]} */
    const out = [];

    (rule.fields || []).forEach((r) => {
        if (!r.materialize || r.materialize.as !== 'node' || !r.materialize.inline) return;
        const childCategory = r.materialize.type || (typeof r.from === 'string' ? r.from : '');

        actualFieldNames(entry, r.from).forEach((field) => {
            const list = Array.isArray(entry[field]) ? entry[field] : [entry[field]];
            list.forEach((item, index) => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) return;
                const isDefinition = Object.keys(item).some((k) => !INLINE_REF_KEYS.has(k.toLowerCase()));
                if (!isDefinition) return; // 纯引用 → 不拆节点
                out.push({ category: childCategory, field, index, entry: item });
            });
        });
    });

    return out;
}

module.exports = {
    /** 本体规则表（= RULES.categories，插件不污染） */
    baseCategories,
    /** 生效规则表（本体 + 启用中的插件） */
    categories,
    fallback,
    /** 由名取规则（大小写/单复数/别名兜底；未知类别走 fallback） */
    ruleFor,
    /** 取某字段声明的规则（可多条） */
    fieldRulesFor,
    /** 加连接：抽出一个条目的连接需求（字段 → 端口/方向 → 目标 id） */
    connectionsOf,
    /** 拆节点：抽出一个条目里该拆成独立节点的内联定义 */
    splitInline,
    /** 按启用中的插件重建生效表（通常由 plugins.onChange 自动触发） */
    rebuildRules,
    /** 数据里出现过的拼写差异 → 规范类别名（节点类型仍用原始最外围键） */
    aliases: CATEGORY_ALIASES,
    /** 复数 → 单数（别名匹配用） */
    singularize,
    /** 取值方式清单（文档用途） */
    EXTRACT_KINDS,
    PICK_KINDS,
    /** 规则表版本：本体表 + 内置插件源码的摘要（快照/缓存据此判断是否过期） */
    revision,
    /** 供 toData / 其它调用方使用的纯函数 */
    helpers: {
        buildProps,
        kindOf,
        collectRefTargets,
        actualFieldName,
        actualFieldNames,
        pickPath,
        isRefTarget,
        ID_FIELD,
    },
};
