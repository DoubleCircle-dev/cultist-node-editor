import { NodeTypeRegistry } from "./generators/nodeTypes.js";
import { addNode } from "./index.js";

// 填充调试下拉选择框
export function populateDebugSelect() {
    let select = document.getElementById('debugNodeSelect');
    if (!select) return;
    if (!(select instanceof HTMLSelectElement)) return;

    // 清空现有选项（如果有占位符可以保留，但这里直接动态构建）
    select.innerHTML = '';

    // 按照一定的顺序排列（可选，这里按照对象自身顺序）
    for (const [key, value] of Object.entries(NodeTypeRegistry.nodeTypes)) {
        const option = document.createElement('option');
        option.value = key;

        // 生成可读的标签：优先使用 label，其次 title，最后使用 key
        let displayName = value.label || value.title || key;
        // 限制一下长度，防止太长的文本撑坏布局（但通常没问题）
        option.textContent = `${key} (${displayName})`;
        select.appendChild(option);
    }

    // 可选：默认选中第一个有效选项
    if (select.options.length > 0) {
        select.selectedIndex = 0;
    }

}

// 定义全局添加函数，供按钮 onclick 使用
export function addSelectedDebugNode() {
    const select = document.getElementById('debugNodeSelect');
    if (!select) {
        alert('调试下拉框未找到');
        return;
    }
    if (!(select instanceof HTMLSelectElement)) {
        alert('调试下拉框类型错误');
        return;
    }
    const selectedType = select.value;
    if (!selectedType) {
        alert('请选择一个节点类型');
        return;
    }

    addNode(selectedType);
};

// 执行填充（等待DOM和nodeTypes都就绪）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateDebugSelect);
} else {
    populateDebugSelect();
}

/** @type {any} */
const win = window;
win.addSelectedDebugNode = addSelectedDebugNode;
win.populateDebugSelect = populateDebugSelect;
