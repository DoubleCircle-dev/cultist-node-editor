<script setup>
/**
 * 单个节点。
 *
 * 骨架阶段只有标题与类型；端口、图标、属性摘要、拖拽都在后续迁移里补
 * （对应旧的 `src-legacy/views/nodeView.js` 与 `models/nodeModels/*`）。
 */
defineProps({
    node: { type: Object, required: true },
    selected: { type: Boolean, default: false },
});

defineEmits(['select']);
</script>

<template>
    <div
        class="graph-node"
        :class="{ 'graph-node--selected': selected }"
        :style="{ left: `${node.x}px`, top: `${node.y}px` }"
        @click.stop="$emit('select')"
    >
        <div class="graph-node__title">{{ node.label || node.id }}</div>
        <div class="graph-node__type">{{ node.type }}</div>
    </div>
</template>

<style scoped>
.graph-node {
    position: absolute;
    min-width: 120px;
    padding: 8px 10px;
    border: 1px solid var(--cne-border);
    border-radius: 6px;
    background: var(--cne-panel);
    cursor: grab;
    user-select: none;
}

.graph-node--selected {
    border-color: var(--cne-accent);
    box-shadow: 0 0 0 1px var(--cne-accent);
}

.graph-node__title {
    font-size: 13px;
}

.graph-node__type {
    margin-top: 2px;
    font-size: 11px;
    opacity: 0.6;
}
</style>
