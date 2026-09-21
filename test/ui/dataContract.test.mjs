import './helpers/domSetup.mjs';
import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import { graphToDataPool, splitProps } from '../../frontend/src/dataContract.js';

/**
 * core 契约适配测试
 *
 * core 侧只描述语义（基础属性类型 kind / 原始值 value / 连接需求 links），渲染是前端的事：
 *   - `props` 按 `kind` 拆成前端内部的 `fields`（标量）/ `refs`（list、dict）；
 *   - `edges` 直接给变换好的两端 `out` / `in`（出线端 / 入线端），前端不再自己推断方向。
 */

/** 造一个最小节点图（形状与 core 的 buildGraph 产物一致） */
function sampleGraph() {
    return {
        namespace: 'test',
        source: 'mod',
        count: 1,
        nodes: [
            {
                uid: 'test:recipes:r1',
                id: 'r1',
                type: 'recipes',
                category: 'recipes',
                title: '测试',
                file: 'a.json',
                source: 'mod',
                refCount: 1,
                props: [
                    { name: 'label', kind: 'string', value: '测试', links: [], materialize: null },
                    { name: 'warmup', kind: 'number', value: 10, links: [], materialize: null },
                    { name: 'craftable', kind: 'boolean', value: true, links: [], materialize: null },
                    {
                        name: 'actionId',
                        kind: 'string',
                        value: 'study',
                        links: [{ port: 'actionId', direction: 'input', targets: ['verbs'], multi: false, extract: 'id' }],
                        materialize: null,
                    },
                    { name: 'effects', kind: 'dict', value: { lantern: 2 }, links: [], materialize: null },
                    { name: 'alt', kind: 'list', value: [{ id: 'r2' }], links: [], materialize: { as: 'node', type: 'recipes', inline: true } },
                ],
                connections: [],
            },
        ],
        edges: [
            {
                id: 'e1',
                kind: 'link',
                targetId: 'study',
                amount: null,
                status: 'resolved',
                from: { uid: 'test:recipes:r1', field: 'actionId', port: 'actionId', side: 'input' },
                out: { uid: 'test:verbs:study', category: 'verbs', id: 'study', side: 'output', port: 'link' },
                in: { uid: 'test:recipes:r1', category: 'recipes', id: 'r1', field: 'actionId', side: 'input', port: 'input:actionId' },
                to: { uid: 'test:verbs:study', category: 'verbs', id: 'study' },
            },
            // 未解析的线不进 links（external 暂不画）
            { id: 'e2', status: 'external-origin', targetId: 'x', out: { uid: null }, in: { uid: null } },
        ],
    };
}

describe('core 契约适配（dataContract）', () => {
    it('props 按 kind 拆成 fields / refs（后端不决定渲染，前端按 kind 归类）', () => {
        const { fields, refs } = splitProps(sampleGraph().nodes[0].props);
        assert.deepEqual(fields, { label: '测试', warmup: 10, craftable: true, actionId: 'study' });
        assert.deepEqual(refs, { effects: { lantern: 2 }, alt: [{ id: 'r2' }] });
    });

    it('连接需求（links）原样带到数据池条目上，供前端建端口', () => {
        const pool = graphToDataPool(sampleGraph());
        const entry = pool.categories.recipes[0];
        const actionId = entry.props.find((p) => p.name === 'actionId');
        assert.deepEqual(actionId.links[0].targets, ['verbs']);
        assert.equal(actionId.links[0].direction, 'input');
    });

    it('links 直接给出线端 / 入线端，朝向由后端变换好', () => {
        const pool = graphToDataPool(sampleGraph());
        assert.equal(pool.links.length, 1, '未解析的线不进 links');
        const link = pool.links[0];
        assert.equal(link.from.category, 'verbs', '出线端 = 目标（verb）');
        assert.equal(link.from.id, 'study');
        assert.equal(link.from.port, 'link');
        assert.equal(link.to.category, 'recipes', '入线端 = 本条目');
        assert.equal(link.to.id, 'r1');
        assert.equal(link.to.port, 'input:actionId');
    });

    it('不是节点图时原样返回（调试时手工构造旧形状仍可用）', () => {
        const legacy = { foo: 1 };
        assert.equal(graphToDataPool(legacy), legacy);
    });
});
