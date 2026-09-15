<script setup>
/**
 * 画布：节点的摆放与选中。
 *
 * 骨架阶段只做「绝对定位 + 点击选中」；平移缩放、连线绘制、框选
 * 留给后续（见 frontend/DESIGN.md 的迁移计划）。
 *
 * ⚠️ `id="canvas-basic"` 与 `id="canvas-viewport"` 是扩展宿主集成测试断言的对象，改名要同步改测试。
 */
import GraphNode from './GraphNode.vue';

defineProps({
    nodes: { type: Array, required: true },
    selectedId: { type: String, default: null },
});

defineEmits(['select']);
</script>

<template>
    <div class="canvas-container" id="canvas-basic">
        <!-- @click.self：点空白处 = 取消选中 -->
        <div class="canvas-viewport" id="canvas-viewport" @click.self="$emit('select', null)">
            <GraphNode
                v-for="node in nodes"
                :key="node.id"
                :node="node"
                :selected="node.id === selectedId"
                @select="$emit('select', node.id)"
            />
        </div>
    </div>
</template>
