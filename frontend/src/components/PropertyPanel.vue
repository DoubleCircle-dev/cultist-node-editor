<script setup>
/**
 * 属性面板：展示选中节点的字段。
 *
 * 骨架阶段是只读展示；编辑回写、类型化控件（数值 / 选项 / 端口 / 表格 / 图片预览）
 * 在后续迁移里按 propModels 逐个补（见 ../DESIGN.md）。
 */
import { computed } from 'vue';

const props = defineProps({
    node: { type: Object, default: null },
});

const entries = computed(() => Object.entries(props.node?.props ?? {}));
</script>

<template>
    <aside class="property-panel" id="property-panel">
        <template v-if="node">
            <h3 class="property-panel__title">{{ node.label || node.id }}</h3>
            <div v-for="[key, value] in entries" :key="key" class="property-panel__row">
                <span class="property-panel__key">{{ key }}</span>
                <span class="property-panel__value">{{ value }}</span>
            </div>
        </template>
        <p v-else class="property-panel__hint">选中一个节点查看属性</p>
    </aside>
</template>
