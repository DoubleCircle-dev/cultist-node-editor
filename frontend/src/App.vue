<script setup>
/**
 * 应用根组件：只负责「布局」与「状态从哪来」，不放业务逻辑。
 *
 * 三块面板的划分沿用现有编辑器的心智模型：
 *   顶栏（命令） → 画布（节点 + 连线） + 属性面板（选中节点的字段）
 * 真正的数据在 stores/graph.js，与扩展的通信用 host/bridge.js。
 */
import { computed } from 'vue';

import Toolbar from './components/Toolbar.vue';
import NodeCanvas from './components/NodeCanvas.vue';
import PropertyPanel from './components/PropertyPanel.vue';
import { useGraphStore } from './stores/graph.js';

const graph = useGraphStore();
// store 里的 selectedNode 是 computed ref，这里再包一层让模板拿到普通值
const selectedNode = computed(() => graph.selectedNode.value);
</script>

<template>
    <div class="container">
        <Toolbar />
        <div class="editor-area">
            <NodeCanvas
                :nodes="graph.state.nodes"
                :selected-id="graph.state.selectedId"
                @select="graph.select"
            />
            <PropertyPanel :node="selectedNode" />
        </div>
    </div>
</template>
