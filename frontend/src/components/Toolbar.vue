<script setup>
/**
 * 顶栏：命令按钮。
 *
 * 骨架阶段只接两条线：
 *   · 「保存 / 加载 / 读取mod」→ 直接 postMessage 给扩展（命令名与 extension.js 里的 switch 一致）；
 *   · 「加节点」→ 验证响应式渲染链路。
 * 正式的命令集合、快捷键、菜单随后续迁移补上（见 ../DESIGN.md）。
 */
import { postToHost } from '../host/bridge.js';
import { useGraphStore } from '../stores/graph.js';

const graph = useGraphStore();

let seq = 1;

/** 往画布上放一个示例节点（正式版由数据池 / 搜索决定放什么）。 */
function addDemoNode() {
    seq += 1;
    graph.addNode({
        id: `n${seq}`,
        type: 'element',
        label: `节点 ${seq}`,
        x: 80 + seq * 24,
        y: 60 + seq * 24,
    });
}
</script>

<template>
    <div class="toolbar">
        <div class="editor-palette">
            <button class="btn" @click="postToHost('saveGraph')">💾 保存</button>
            <button class="btn" @click="postToHost('loadGraph')">📂 加载</button>
            <button class="btn" @click="postToHost('readMod')">🔧 读取mod</button>
            <button class="btn" @click="addDemoNode">➕ 加节点</button>
        </div>
        <span class="toolbar__version">节点编辑器 v0.1（Vue 骨架）</span>
    </div>
</template>
