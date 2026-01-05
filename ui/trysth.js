// 添加节点
function addNode(type, x, y) {
    nodeCount++;
    const nodeId = `node-${nodeCount}`;
    const config = nodeTypes[type];

    const node = {
        id: nodeId,
        type: type,
        config: config,
        x: x !== undefined ? x : Math.random() * (canvas.clientWidth - 220),
        y: y !== undefined ? y : Math.random() * (canvas.clientHeight - 120),
        connections: {
            inputs: Array(config.inputs).fill(null),
            outputs: Array(config.outputs).fill(null)
        },
        data: {}
    };

    nodes.set(nodeId, node);
    createNodeElement(node);

    // 隐藏占位符
    const placeholder = document.getElementById('placeholder');
    if (placeholder) {
        placeholder.style.display = 'none';
    }

    updateNodeCount();
    updateStatus(`添加 ${config.title} #${nodeCount}`);

    return node;
}

// 创建节点DOM元素
function createNodeElement(node) {
    const canvas = document.getElementById('canvas');

    const element = document.createElement('div');
    element.className = 'node';
    element.id = node.id;
    element.dataset.nodeType = node.type;
    element.style.left = node.x + 'px';
    element.style.top = node.y + 'px';
    element.style.borderColor = node.config.color;

    // 构建HTML
    let portsHTML = '';

    // 输入端口
    for (let i = 0; i < node.config.inputs; i++) {
        const topPercent = ((i + 1) * 100 / (node.config.inputs + 1));
        portsHTML += `
            <div class="port input" 
                 data-node-id="${node.id}"
                 data-port-type="input"
                 data-port-index="${i}"
                 style="top: ${topPercent}%"
                 onmousedown="startConnection(event, '${node.id}', ${i}, 'input')">
                <div class="port-label">输入 ${i + 1}</div>
            </div>
        `;
    }

    // 输出端口
    for (let i = 0; i < node.config.outputs; i++) {
        const topPercent = ((i + 1) * 100 / (node.config.outputs + 1));
        portsHTML += `
            <div class="port output" 
                 data-node-id="${node.id}"
                 data-port-type="output"
                 data-port-index="${i}"
                 style="top: ${topPercent}%"
                 onmousedown="startConnection(event, '${node.id}', ${i}, 'output')">
                <div class="port-label">输出 ${i + 1}</div>
            </div>
        `;
    }

    // 属性输入
    let propertiesHTML = '';
    if (node.config.properties) {
        node.config.properties.forEach((prop, index) => {
            let inputHTML = '';
            switch (prop.type) {
                case 'range':
                    inputHTML = `
                        <input type="range" 
                               class="property-input"
                               min="${prop.min || 0}" 
                               max="${prop.max || 100}" 
                               step="${prop.step || 1}"
                               value="${prop.default || 50}"
                               onchange="updateNodeProperty('${node.id}', ${index}, this.value)">
                    `;
                    break;
                case 'select':
                    const options = prop.options.map((opt, i) =>
                        `<option value="${i}" ${i === prop.default ? 'selected' : ''}>${opt}</option>`
                    ).join('');
                    inputHTML = `
                        <select class="property-input" 
                                onchange="updateNodeProperty('${node.id}', ${index}, this.value)">
                            ${options}
                        </select>
                    `;
                    break;
                case 'checkbox':
                    inputHTML = `
                        <input type="checkbox" 
                               class="property-input"
                               ${prop.default ? 'checked' : ''}
                               onchange="updateNodeProperty('${node.id}', ${index}, this.checked)">
                    `;
                    break;
                default:
                    inputHTML = `
                        <input type="${prop.type}" 
                               class="property-input"
                               value="${prop.default || ''}"
                               onchange="updateNodeProperty('${node.id}', ${index}, this.value)">
                    `;
            }

            propertiesHTML += `
                <div class="property-item">
                    <div class="property-label">${prop.label}:</div>
                    ${inputHTML}
                </div>
            `;
        });
    }

    element.innerHTML = `
        <div class="node-header" onmousedown="startDrag(event, '${node.id}')">
            <div class="node-icon" style="color: ${node.config.color}">${node.config.icon}</div>
            <div class="node-title">${node.config.title} #${node.id.split('-')[1]}</div>
            <button class="node-close" onclick="removeNode('${node.id}')">×</button>
        </div>
        <div class="node-content">
            <div class="node-info">${node.config.content(node.id.split('-')[1])}</div>
            ${propertiesHTML ? `<div class="node-properties">${propertiesHTML}</div>` : ''}
        </div>
        <div class="node-ports">${portsHTML}</div>
    `;

    canvas.appendChild(element);
    node.element = element;

    // 初始化节点数据
    if (node.config.properties) {
        node.config.properties.forEach((prop, index) => {
            node.data[prop.label] = prop.default;
        });
    }
}
