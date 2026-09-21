/**
 * nodeFieldStats.js —— 原版（origin）内容字段出现率（**自动生成，请勿手改**）
 *
 * 生成命令：`node frontend/scripts/gen-node-field-stats.mjs`（最近生成：2026-09-20）
 * 数据来源：`core/origin_resources/StreamingAssets/content/core/**` 全量条目
 *
 * 结构：基础节点类型 → { entries: 样本条目数, fields: { 原版字段名: 出现率(%) } }
 *   - 字段名保留原版写法（如 `actionid` / `decayTo`），与属性名比较时**大小写不敏感**；
 *   - `slots` / `mutations` / `xtriggers` 的样本来自 recipes / elements / verbs 的嵌套结构；
 *   - 没有对应原版结构的节点类型（test / blank / extends / copies / text / number /
 *     nodeSet / images）不在此表中，档位裁剪对它们不生效。
 *
 * 消费方：`frontend/src/types/nodePropertyLevels.js`（按出现率裁剪「常驻属性」，
 * 被裁掉的一律进「修改可选属性」池，不做丢弃）。
 */

export const NODE_FIELD_STATS = {
    recipes: {
        entries: 2736,
        fields: {
            "id": 100,
            "actionid": 99.5,
            "label": 96.1,
            "startdescription": 88.9,
            "requirements": 80.6,
            "warmup": 63.2,
            "description": 56.3,
            "effects": 53.7,
            "craftable": 51.4,
            "linked": 38.6,
            "aspects": 20.6,
            "alt": 17,
            "slots": 11.5,
            "hintonly": 8.8,
            "extantreqs": 7.3,
            "mutations": 7.1,
            "comments": 7,
            "internaldeck": 4.9,
            "deckeffects": 3.6,
            "ending": 2.5,
            "burnimage": 2,
            "signalEndingFlavour": 1.8,
            "purge": 1.6,
            "maxexecutions": 1.1,
            "inductions": 1,
            "achievements": 0.9,
            "tablereqs": 0.7,
            "haltverb": 0.2,
            "portaleffect": 0.2,
            "actionId": 0.1,
            "deleteverb": 0.1,
            "signalimportantloop": 0,
        },
    },
    elements: {
        entries: 2125,
        fields: {
            "id": 100,
            "label": 98.9,
            "description": 96.1,
            "aspects": 73.2,
            "xtriggers": 40.9,
            "unique": 24.7,
            "lifetime": 22.2,
            "icon": 21.6,
            "isAspect": 21.6,
            "slots": 17.6,
            "uniquenessgroup": 14.7,
            "noartneeded": 11.7,
            "decayTo": 9.1,
            "isHidden": 8.7,
            "comments": 5.3,
            "resaturate": 2.8,
            "inherits": 2.3,
            "verbicon": 0.9,
            "induces": 0.8,
            "burnTo": 0.5,
            "sort": 0.4,
            "lever": 0.4,
            "achievements": 0.1,
            "manifestationtype": 0,
            "metafictional": 0,
        },
    },
    verbs: {
        entries: 13,
        fields: {
            "description": 100,
            "id": 100,
            "label": 100,
            "slot": 92.3,
            "icon": 7.7,
        },
    },
    decks: {
        entries: 55,
        fields: {
            "id": 100,
            "label": 100,
            "spec": 100,
            "description": 94.5,
            "resetonexhaustion": 81.8,
            "defaultcard": 49.1,
        },
    },
    endings: {
        entries: 63,
        fields: {
            "anim": 100,
            "description": 100,
            "flavour": 100,
            "id": 100,
            "image": 100,
            "label": 100,
            "achievements": 95.2,
            "comments": 1.6,
        },
    },
    legacies: {
        entries: 29,
        fields: {
            "availableWithoutEndingMatch": 100,
            "description": 100,
            "fromending": 100,
            "id": 100,
            "label": 93.1,
            "effects": 62.1,
            "image": 62.1,
            "startdescription": 62.1,
            "startingverbid": 62.1,
            "newstart": 51.7,
            "excludesOnEnding": 41.4,
            "$derives": 37.9,
            "statusbarelements": 6.9,
            "comments": 3.4,
            "family": 3.4,
            "tablecoverimage": 3.4,
        },
    },
    achievements: {
        entries: 90,
        fields: {
            "iconUnlocked": 100,
            "id": 100,
            "label": 100,
            "category": 92.2,
            "descriptionunlocked": 92.2,
            "singleDescription": 92.2,
            "validateOnStorefront": 92.2,
            "isCategory": 7.8,
            "isHidden": 5.6,
        },
    },
    levers: {
        entries: 8,
        fields: {
            "defaultValue": 100,
            "id": 100,
            "onGameEnd": 100,
            "requiredScore": 100,
            "weights": 75,
            "comments": 37.5,
            "redirects": 12.5,
        },
    },
    slots: {
        entries: 1084,
        fields: {
            "id": 100,
            "required": 99.3,
            "label": 97.9,
            "actionid": 70.4,
            "description": 55.9,
            "consumes": 15.3,
            "greedy": 11.9,
            "forbidden": 6.5,
            "essential": 2.2,
        },
    },
    mutations: {
        entries: 305,
        fields: {
            "filter": 100,
            "level": 100,
            "mutate": 100,
            "additive": 68.2,
        },
    },
    xtriggers: {
        entries: 269,
        fields: {
            "id": 100,
            "morpheffect": 90.7,
            "level": 14.9,
            "chance": 0.4,
        },
    },
    morphEffects: {
        entries: 269,
        fields: {
            "id": 100,
            "morpheffect": 90.7,
            "level": 14.9,
            "chance": 0.4,
        },
    },
};

export default NODE_FIELD_STATS;
