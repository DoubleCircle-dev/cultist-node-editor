// 填充调试下拉选择框
function populateDebugSelect() {
    const select = document.getElementById('debugNodeSelect');
    if (!select) return;

    // 确保 nodeTypes 已经加载 (window.nodeTypes 来自 nodeTypes.js)
    if (window.nodeTypes && typeof window.nodeTypes === 'object') {
        // 清空现有选项（如果有占位符可以保留，但这里直接动态构建）
        select.innerHTML = '';

        // 按照一定的顺序排列（可选，这里按照对象自身顺序）
        for (const [key, value] of Object.entries(window.nodeTypes)) {
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
    } else {
        // 如果 nodeTypes 尚未定义，可能是脚本加载顺序问题，延迟重试
        console.warn('nodeTypes 未就绪，100ms 后重试...');
        setTimeout(populateDebugSelect, 100);
    }
}

// 定义全局添加函数，供按钮 onclick 使用
window.addSelectedDebugNode = function () {
    const select = document.getElementById('debugNodeSelect');
    if (!select) {
        alert('调试下拉框未找到');
        return;
    }
    const selectedType = select.value;
    if (!selectedType) {
        alert('请选择一个节点类型');
        return;
    }

    // 调用全局 addNode 函数（由 basicOP.js 或 webview.js 提供）
    if (typeof window.addNode === 'function') {
        window.addNode(selectedType);
    } else {
        // 降级处理：尝试直接调用 addNode (可能挂载在window上)
        try {
            addNode(selectedType);
        } catch (e) {
            console.error('addNode 函数未定义或调用失败', e);
            alert('错误：无法添加节点，请确保编辑器脚本已正确加载。');
        }
    }
};

// 执行填充（等待DOM和nodeTypes都就绪）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateDebugSelect);
} else {
    populateDebugSelect();
}
