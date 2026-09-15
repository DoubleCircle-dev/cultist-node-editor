/**
 * 图状态（节点 / 连线 / 选中项）—— 一个最小的响应式 store。
 *
 * 为什么骨架阶段先不上 Pinia：
 *   现在只有「节点列表 + 选中项」两块状态，`reactive` + `computed` 就够了；
 *   等历史记录（undo/redo）、多页面 tab、文本变量同步都进来之后再决定
 *   （见 frontend/DESIGN.md「状态管理」一节）。
 *
 * 模块级单例：所有组件拿到的是同一份 state。
 */
import { computed, reactive } from 'vue';

/**
 * @typedef {Object} GraphNode 画布上的一个节点
 * @property {string} id
 * @property {string} type 节点类型（element / recipe / verb / deck / text …）
 * @property {string} [label] 显示名
 * @property {number} x 画布坐标
 * @property {number} y
 * @property {Record<string, unknown>} [props] 该节点的字段
 */

/** @type {{nodes: GraphNode[], connections: object[], selectedId: string|null}} */
const state = reactive({
    // 骨架阶段先放一个示例节点，方便肉眼确认渲染链路通了
    nodes: [
        {
            id: 'n1',
            type: 'element',
            label: '示例节点',
            x: 80,
            y: 60,
            props: { id: 'n1', type: 'element', label: '示例节点' },
        },
    ],
    connections: [],
    selectedId: null,
});

/** 当前选中的节点（未选中时为 null） */
const selectedNode = computed(() => state.nodes.find((node) => node.id === state.selectedId) ?? null);

/**
 * 选中某个节点；传 null 表示取消选中。
 * @param {string|null} id 节点 id
 */
function select(id) {
    state.selectedId = id;
}

/**
 * 追加一个节点（缺省值会被补上）。
 * @param {Partial<GraphNode> & {id: string, type: string}} node 节点
 */
function addNode(node) {
    state.nodes.push({ label: node.id, x: 0, y: 0, props: {}, ...node });
}

/**
 * 取 store（模块级单例，多次调用返回同一份）。
 * @returns {{state: object, selectedNode: object, select: (id: string|null) => void, addNode: (node: object) => void}}
 */
export function useGraphStore() {
    return { state, selectedNode, select, addNode };
}
