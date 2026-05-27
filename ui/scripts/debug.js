import { NodeTypeRegistry } from './types/nodeTypes.js';
import { addNode } from './index.js';

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
}

export function testList() {
    const core = win.controlCore;
    let panel = document.getElementById('debugPanel');
    if (!panel) {
        panel = createTestPanel(testTypes);
    }

    core.panelManager.toggleCustomPanel(panel, 'bottom');
}

const testTypes = [
    {
        value: 'generateTest',
        label: '生成压力测试',
        func: () => {
            generateTest();
            console.log('生成压力测试执行完成');
        }
    },
    {
        value: 'history_Memory',
        label: '历史记录内存测试',
        func: () => {
            history_Memory();
            console.log('历史记录内存测试执行完成');
        },
    },
];

function generateTest() {
    const core = win.controlCore;
    

    for (let index = 0; index < 1000; index++) {
        setTimeout(()=>{
            core.addNode('test')
        }, index*10);
    }

    setTimeout(()=>{
        core.nodeManager.clear();
        // core.clearCanvas();
        setTimeout(()=>{
            core.forceRepaint();
        }, 100);

    }, 10000);
}


function history_Memory() {
    const core = win.controlCore;

    core.addNode('test')

    for (let index = 0; index < 1000; index++) {
        core.undo();
        core.redo();
    }


    const history = core.historyManager.history;
    console.log(`历史记录长度：${history.length}`);
    console.log(`历史记录内存占用：${JSON.stringify(history)}`);

    core.undo();

    //  core.addNode('test');

    console.log(`历史记录长度：${history.length}`);
    console.log(`历史记录内存占用：${JSON.stringify(history)}`);
    console.log(`undo历史内存占用：${JSON.stringify(core.historyManager.undoHistory)}`)

    console.log('历史记录内存测试执行完成');

    // core.clearCanvas();
}

/**
 * 创建底部测试执行面板
 *
 * @param {{ value: string; label: string; func: Function }[]} testTypes
 * @returns {HTMLDivElement} 面板元素（已挂载 show/hide 方法）
 */
function createTestPanel(testTypes = []) {
    // 主面板容器
    const panel = document.createElement('div');
    panel.className = 'bottom-panel';
    panel.id = 'debugPanel';

    // 头部：标题 + 关闭按钮
    const header = document.createElement('div');
    header.className = 'panel-header';

    const title = document.createElement('span');
    title.textContent = '测试执行';
    header.appendChild(title);

    panel.appendChild(header);

    // 测试类型选项（单选）
    const options = document.createElement('div');
    options.className = 'panel-options';

    testTypes.forEach((test, index) => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'test-type';
        radio.value = test.value;
        radio.func = test.func;
        if (index === 0) radio.checked = true; // 默认选中第一项

        label.appendChild(radio);
        label.appendChild(document.createTextNode(' ' + test.label));
        options.appendChild(label);
        options.appendChild(document.createElement('br'));
    });

    panel.appendChild(options);

    // 执行按钮
    const executeBtn = document.createElement('button');
    executeBtn.textContent = '执行测试';
    executeBtn.className = 'execute-btn';
    executeBtn.onclick = () => {
        const selectedRadio = panel.querySelector('input[name="test-type"]:checked');
        if (selectedRadio) {
            const labelText = selectedRadio.nextSibling?.textContent?.trim() || selectedRadio.value;
            console.log(`开始执行：${labelText}`);
            // 这里替换为实际的测试执行逻辑
            selectedRadio.func();
        }
    };
    panel.appendChild(executeBtn);

    return panel;
}

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
win.testList = testList;
