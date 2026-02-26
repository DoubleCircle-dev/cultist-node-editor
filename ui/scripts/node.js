/* eslint-disable no-undef */
// @ts-nocheck

/**
 * 节点类(Node)
 * 用于表示图形界面中的基本元素节点
 * 包含节点的基本属性如位置、尺寸、端口等信息
 */
class Node {
    constructor(uid, type, x, y, config) {
        this.uid = uid;
        this.type = type;
        this.config = config;
        this.x = x;
        this.y = y;
        this.ports = new Map();
        this.data = {};
        this._nextPortIndex = {
            input: 0,
            prop: 0,
            output: 0
        }
        this.connections = {
            inputs: [],
            props: [],
            outputs: []
        };

        this.currentMode = null; // 当前模式
        this.activeExProperties = new Map(); // 当前激活的扩展属性

        // 存储动态属性状态
        this.dynamicProperties = new Map();
        this.propertyValues = {};

        // 检查是否有 exProperties[999] 并初始化添加按钮
        this.hasExProperties999 = this.config.exProperties && this.config.exProperties[999];

        // 初始化数据
        this._initializeData();

        this.element = this._createNodeElement();

        // 隐藏占位符
        const placeholder = document.getElementById('placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

    }

    // 初始化节点数据
    _initializeData() {
        // 初始化固定属性
        if (this.config.fixedProperties) {
            this.config.fixedProperties.forEach((prop, index) => {

                if (prop.modeSwitcher) {
                    this.currentMode = prop.default;
                }
                const key = prop.label || `fixed-${index}`;
                this.data[key] = prop.default !== undefined ? prop.default : '';
                this.propertyValues[key] = prop.default !== undefined ? prop.default : '';
            });
        }

        // 初始化常规属性
        if (this.config.properties) {
            this.config.properties.forEach((prop, index) => {
                const key = prop.label || `prop-${index}`;
                this.data[key] = prop.default !== undefined ? prop.default : '';
                this.propertyValues[key] = prop.default !== undefined ? prop.default : '';
            });
        }

        // 初始化 activeExProperties
        this.activeExProperties.clear();

        // 检查当前模式是否有对应的exProperties
        if (this.config.exProperties && this.config.exProperties[this.currentMode]) {
            const modeExProperties = this.config.exProperties[this.currentMode];
            if (modeExProperties && Array.isArray(modeExProperties)) {
                modeExProperties.forEach((prop, index) => {
                    const key = `ex-${this.currentMode}-${index}`;
                    this.activeExProperties.set(key, prop);
                    // 同时保存到 data 中
                    this.data[key] = prop.default !== undefined ? prop.default : '';
                });
            }
        }

        // 初始化标题
        this.data.title = this.config.title;
    }

    // 创建节点DOM元素
    _createNodeElement() {
        const element = document.createElement('div');
        element.className = 'node';
        element.uid = this.uid;
        element.dataset.nodeType = this.type;
        element.style.left = this.x + 'px';
        element.style.top = this.y + 'px';
        element.style.borderColor = this.config.color;
        element.locked = false;

        element.appendChild(this._createHeader());
        // 构建节点HTML结构
        // let html = this._createHeaderHTML();
        // html += '<div class="node-content">';
        // html += this._createContentHTML();
        // html += '</div>';
        // html += this._createPropertiesHTML();

        // element.innerHTML = html;

        element.appendChild(this._createProperties());

        // 创建端口区域
        element.appendChild(this._createPortsSection());

        // 聚焦节点使其可接收键盘事件
        element.tabIndex = 0;

        return element;
    }

    // 创建头部HTML
    _createHeader() {
        const innerHTML = `
        <div class="node-header">
            <div class="node-icon" style="color: ${this.config.color}">
                ${this.config.icon || '⚡'}
            </div>
            <div class="node-title">
                <input type="text" 
                       class="node-title-input" 
                       value="${this.config.title}" 
                       placeholder="节点标题"
                       data-node-uid="${this.uid}"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
                <span class="node-uid">#${this.uid}</span>
            </div>
            <div class="node-label">
                <input type="text" 
                       class="node-label-input" 
                       value="${''}" 
                       placeholder="标签（label:游戏内显示的名称）"
                       data-node-uid="${this.uid}"
                       onclick="event.stopPropagation()"
                       onkeydown="if(event.key === 'Enter') this.blur()">
            </div>
        </div>
    `;
        const header = document.createElement('div');
        header.innerHTML = innerHTML;
        return header;
    }

    // 创建内容HTML
    _createContentHTML() {
        let content = this.config.content || '';
        // 替换内容中的变量
        return `<div class="node-info">${content}</div>`;
    }

    // 创建属性
    _createProperties() {
        const properties = document.createElement('div');
        properties.className = 'node-properties';

        // 固定属性
        if (this.config.fixedProperties && this.config.fixedProperties.length > 0) {
            const fixedProperties = document.createElement('div');
            fixedProperties.className = 'node-properties fixed-properties';
            this.config.fixedProperties.forEach((prop, index) => {
                fixedProperties.appendChild(this._createProperty(prop, `fixed-${index}`, true));
            });
            properties.appendChild(fixedProperties);
        }

        // 常规属性
        if (this.config.properties && this.config.properties.length > 0) {
            const regularProperties = document.createElement('div');
            regularProperties.className = 'node-properties regular-properties';
            this.config.properties.forEach((prop, index) => {
                regularProperties.appendChild(this._createProperty(prop, `prop-${index}`));
            });
            properties.appendChild(regularProperties);
        }

        // 扩展属性容器
        const exProperties = document.createElement('div');
        exProperties.className = 'node-properties extended-properties';

        if (this.activeExProperties && this.activeExProperties.size > 0) {
            this.activeExProperties.forEach((prop, key) => {
                exProperties.appendChild(this._createProperty(prop, key));
            })
        }
        // 检查是否有编号999的exProperties
        if (this.hasExProperties999) {
            // 添加"+"按钮
            const addButton = document.createElement('button');
            addButton.className = 'add-ex-property-btn';
            // 添加点击事件
            addButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showExPropertiesMenu(e);
            });

            exProperties.appendChild(addButton);
        }

        properties.appendChild(exProperties);


        return properties;
    }

    // 创建单个属性HTML
    _createProperty(prop, propId) {
        const value = prop.default !== undefined ? prop.default : '';
        const key = prop.label || propId;
        this.propertyValues[key] = value;

        const property = document.createElement('div');
        property.className = 'property-item';
        property.dataset.propKey = key;

        const placeholder = document.createElement('span');
        placeholder.className = 'port-placeholder';

        const propertyLabel = document.createElement('div');
        propertyLabel.className = 'property-label';
        propertyLabel.innerText = prop.label + ':';

        if (prop.description) {
            const helpInfo = document.createElement('div');
            helpInfo.className = 'property-help';
            helpInfo.title = prop.description;
            helpInfo.innerHTML = '?';
            propertyLabel.appendChild(helpInfo);
        }

        property.appendChild(propertyLabel);

        const commonAttrs = `data-node-uid="${this.uid}" data-prop-key="${key}"`;

        const propertyInput = document.createElement('div');
        switch (prop.type) {
            case 'text':
                propertyInput.innerHTML = `
                    <input type="text" 
                           class="property-input property-text" 
                           value="${value}"
                           placeholder="${prop.placeholder || ''}"
                           ${commonAttrs}
                           onchange="updateNodeProperty('${this.uid}', '${key}', this.value)"
                           onclick="event.stopPropagation()">
                `;
                break;
            case 'number':
            case 'int':
                propertyInput.innerHTML = `
                    <input type="number" 
                           class="property-input property-int" 
                           value="${value}"
                           min="${prop.min || ''}"
                           max="${prop.max || ''}"
                           step="${prop.type === 'int' ? '1' : 'any'}"
                           ${commonAttrs}
                           onchange="updateNodeProperty('${this.uid}', '${key}', ${prop.type === 'int' ? 'parseInt(this.value) || 0' : 'parseFloat(this.value) || 0'})"
                           onclick="event.stopPropagation()">
                `;
                break;
            case 'range':
                propertyInput.innerHTML = `
                    <div class="property-range-wrapper">
                        <input type="range" 
                               class="property-input property-range" 
                               value="${value}"
                               min="${prop.min || 0}"
                               max="${prop.max || 100}"
                               ${commonAttrs}
                               oninput="updateNodeProperty('${this.uid}', '${key}', parseFloat(this.value)); 
                                        this.nextElementSibling.textContent = this.value"
                               onclick="event.stopPropagation()">
                        <span class="range-value">${value}</span>
                    </div>
                `;
                break;
            case 'bool':
                const boolId = `bool-${this.uid}-${propId}`;
                const trueLabel = prop.labels?.true || '是';
                const falseLabel = prop.labels?.false || '否';
                propertyInput.innerHTML = `
                    <div class="bool-radio-group" data-id="${boolId}">
                        <label class="bool-option">
                            <input type="radio" 
                                   name="${boolId}" 
                                   value="true"
                                   ${value === true ? 'checked' : ''}
                                   ${commonAttrs}
                                   onchange="updateNodeProperty('${this.uid}', '${key}', true)">
                            <span class="bool-radio-label">${trueLabel}</span>
                        </label>
                        <label class="bool-option">
                            <input type="radio" 
                                   name="${boolId}" 
                                   value="false"
                                   ${value === false ? 'checked' : ''}
                                   ${commonAttrs}
                                   onchange="updateNodeProperty('${this.uid}', '${key}', false)">
                            <span class="bool-radio-label">${falseLabel}</span>
                        </label>
                    </div>
                `;
                break;

            case 'checkbox':
                propertyInput.innerHTML = `
                    <div class="property-checkbox-wrapper">
                        <input type="checkbox" 
                               class="property-input property-checkbox"
                               ${value ? 'checked' : ''}
                               ${commonAttrs}
                               onchange="updateNodeProperty('${this.uid}', '${key}', this.checked)">
                    </div>
                `;
                break;
            case 'select':
                // 检查是否为模式切换器
                const isModeSwitcher = prop.modeSwitcher || false;

                if (isModeSwitcher) {
                    this.currentMode = prop.default || 0;
                    // 模式切换器
                    const options = prop.options.map((opt, i) =>
                        `<option value="${i}" ${i === this.currentMode ? 'selected' : ''}>${opt}</option>`
                    ).join('');

                    propertyInput.innerHTML = `
                        <select class="property-input property-select mode-switcher" 
                                data-node-uid="${this.uid}"
                                data-prop-key="${key}">
                            ${options}
                        </select>
                    `;
                } else {
                    // 普通select
                    const options = prop.options.map((opt, i) =>
                        `<option value="${i}" ${i === value ? 'selected' : ''}>${opt}</option>`
                    ).join('');

                    propertyInput.innerHTML = `
                        <select class="property-input property-select" 
                                ${commonAttrs}
                                onchange="updateNodeProperty('${this.uid}', '${key}', this.value)">
                            ${options}
                        </select>
                    `;
                }
                break;
            case 'table':
                propertyInput.innerHTML = `
                    <div class="property-table" ${commonAttrs}>
                         
                    </div>
                `
                break;
            case 'port':
            case 'selectPort':
                const portItem = this._createPortItem('prop', prop.type, prop, 'in');
                const item = document.createElement('div');
                item.className = 'property-port';
                item.appendChild(portItem);
                propertyInput.appendChild(item);
                break;

            case 'image':
                propertyInput.innerHTML = `
                    <div class="property-image">
                        <input type="text" 
                               class="property-input property-text" 
                               value="${value}"
                               placeholder="图片文件名"
                               ${commonAttrs}
                               onchange="updateNodeProperty('${this.uid}', '${key}', this.value)"
                               onclick="event.stopPropagation()">
                        <button class="btn btn-small browse-btn" onclick="browseImage('${this.uid}', '${key}', this)">浏览</button>
                    </div>
                `;
                break;

            case 'port-hub':
                if (prop.innerPort && Array.isArray(prop.innerPort)) {
                    const portHub = document.createElement('div');
                    portHub.className = 'property-port-hub';
                    prop.innerPort.forEach((innerPort, innerIndex) => {
                        const portItem = this._createPortItem('prop', innerPort.type, innerPort, 'in');
                        portHub.appendChild(portItem);
                    });
                    propertyInput.appendChild(portHub);
                }
                break;

            default:
                console.warn(`未知的属性类型: ${prop.type}`);
                propertyInput.innerHTML = `
                    <input type="text" 
                           class="property-input" 
                           value="${value}"
                           ${commonAttrs}
                           onchange="updateNodeProperty('${this.uid}', '${key}', this.value)"
                           onclick="event.stopPropagation()">
                `;
        }

        property.appendChild(propertyInput);

        return property;

    }

    // 在Node类中添加
    switchNodeMode(propKey, newMode) {
        // 保存当前模式的属性值
        if (this.currentMode !== null) {
            this._saveModeProperties(this.currentMode);
        }

        // 更新当前模式
        this.currentMode = parseInt(newMode);

        // 加载新模式的属性
        this._loadModeProperties(this.currentMode);

        // 更新UI
        this._updateModePropertiesUI();
    }

    // 保存当前模式的属性值
    _saveModeProperties(mode) {
        const exProps = this.config.exProperties[mode];
        if (!exProps) return;

        exProps.forEach((prop, index) => {
            const key = `ex-${mode}-${index}`;
            if (this.activeExProperties.has(key)) {
                this.data[key] = this.activeExProperties.get(key).value;
            }
        });
    }

    // 加载新模式的属性
    _loadModeProperties(mode) {
        // 清除当前激活的扩展属性
        this.activeExProperties.clear();

        // 加载新模式的属性
        const exProps = this.config.exProperties[mode];
        if (!exProps) return;

        exProps.forEach((prop, index) => {
            const key = `ex-${mode}-${index}`;

            this.activeExProperties.set(key, prop);
        });
    }

    // 更新模式属性UI
    _updateModePropertiesUI() {
        const extendedPropsContainer = this.element.querySelector('.extended-properties');
        if (!extendedPropsContainer) return;

        // 清空容器
        extendedPropsContainer.innerHTML = '';

        // 添加当前模式的属性
        this.activeExProperties.forEach((prop, key) => {
            extendedPropsContainer.appendChild(this._createProperty(prop, key));
        });

        this._updateModePortUI();

    }

    _updateModePortUI() {
        const selectPorts = this.element.querySelectorAll('.select-port');
        if (!selectPorts) return;

        console.log('selectPorts', selectPorts);

        selectPorts.forEach((select, index) => {
            select.querySelector('.port-label').textContent = select.label[this.currentMode];
        })

    }

    // 显示exProperties菜单
    _showExPropertiesMenu(event) {
        // 创建菜单
        const menu = document.createElement('div');
        menu.className = 'ex-properties-menu';

        // 添加菜单项
        const exProps999 = this.config.exProperties[999];
        if (exProps999 && Array.isArray(exProps999)) {
            exProps999.forEach((prop, index) => {
                const menuItem = document.createElement('div');
                menuItem.className = 'ex-properties-menu-item';
                menuItem.textContent = prop.label || `属性 ${index}`;
                menuItem.style.padding = '8px 15px';
                menuItem.style.cursor = 'pointer';

                // 添加悬停效果
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.backgroundColor = '#f5f5f5';
                });
                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.backgroundColor = 'transparent';
                });

                // 添加点击事件
                menuItem.addEventListener('click', () => {
                    this.addExProperty(prop, index);
                    document.body.removeChild(menu);
                });

                menu.appendChild(menuItem);
            });
        }

        // 添加到文档
        document.body.appendChild(menu);

        // 点击其他地方关闭菜单
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                document.body.removeChild(menu);
                document.removeEventListener('click', closeMenu);
            }
        };

        // 延迟添加点击事件，避免立即触发
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    // 添加扩展属性
    _checkBitaddExProperty(prop, index) {
        // 生成属性键
        const key = `ex-custom-${Date.now()}-${index}`;

        // 添加到激活的扩展属性
        this.activeExProperties.set(key, {
            prop: prop,
            value: prop.default !== undefined ? prop.default : ''
        });

        // 更新UI
        this._updateModePropertiesUI();

        // 通知状态更新
        if (this.updateStatus) {
            this.updateStatus(`添加属性: ${prop.label}`);
        }
    }

    // 创建端口区域
    _createPortsSection() {
        const portHub = document.createElement('div');
        portHub.className = 'node-port-hub';
        const portsContainer = this._createPortHub();
        portHub.appendChild(portsContainer);
        return portHub;
    }
    // 创建port hub区域存放连接端口
    _createPortHub() {
        const portsContainer = document.createElement('div');
        portsContainer.className = 'ports-container';

        // 左侧输入端口区域
        const inputColumn = document.createElement('div');
        inputColumn.className = 'port-column port-inputs';

        if (this.config.inputs && this.config.inputs.length > 0) {
            const title = document.createElement('div');
            title.className = 'port-column-title';
            title.textContent = '输入端口';
            inputColumn.appendChild(title);

            this.config.inputs.forEach((input, index) => {
                const portElement = this._createPortItem('input', input.type, input, 'in');
                inputColumn.appendChild(portElement);
            });
        }
        portsContainer.appendChild(inputColumn);

        // 右侧输出端口区域
        const outputColumn = document.createElement('div');
        outputColumn.className = 'port-column port-outputs';

        if (this.config.outputs && this.config.outputs.length > 0) {
            const title = document.createElement('div');
            title.className = 'port-column-title';
            title.textContent = '输出端口';
            outputColumn.appendChild(title);

            this.config.outputs.forEach((output, index) => {
                const portElement = this._createPortItem('output', output.type, output, 'out');
                outputColumn.appendChild(portElement);
            });
        }
        portsContainer.appendChild(outputColumn);

        return portsContainer;
    }

    _getPortDirect(portType) {
        switch (portType) {
            case 'input':
            case 'prop':
                return 'in'
            case 'output':
                return 'out'
            default:
                return 'bi' // bidirectional
        }
    }

    // 创建单个端口项
    _createPortItem(portType, portSubType, portData, portDirect) {
        let portIndex;
        if (this._nextPortIndex[portType] !== undefined) {
            portIndex = this._nextPortIndex[portType]++;
        } else {
            console.error(`端口类型 ${portType} 无法统计`);
        }

        let label = portData.label;

        const portId = `${this.uid}-${portType}-${portIndex}`;

        // 创建DOM元素
        const element = document.createElement('div');
        element.className = `port-item`;
        element.nodeId = this.uid;
        element.portId = portId;
        element.portDirect = this._getPortDirect(portType);
        element.portType = portType;
        element.requireType = portData.requireType || this.type;
        element.multiConnect = portData.multiConnect === null ? true : portData.multiConnect;
        element.portIndex = portIndex;

        element.label = portData.label;

        const portDot = this._createPortDot(element.multiConnect, element.requireType);

        if (portSubType === 'selectPort') {
            label = portData.label[this.currentMode];
            element.classList.add('select-port');
        }

        // 根据端口方向分配左右侧
        switch (portDirect) {
            case 'in':
                element.appendChild(portDot);

                const inputLabel = document.createElement('span');
                inputLabel.className = 'port-label';
                inputLabel.textContent = label;
                element.appendChild(inputLabel);
                break;
            case 'out':
                const outputLabel = document.createElement('span');
                outputLabel.className = 'port-label';
                outputLabel.textContent = label;
                element.appendChild(outputLabel);

                element.appendChild(portDot);
                break;
            case 'bi':
            default:
                console.warn(`未知的端口类型: ${portType}`);
                // 默认情况下创建一个基础端口
                const defaultDot = document.createElement('div');
                defaultDot.className = 'port-dot';
                element.appendChild(defaultDot);

                const defaultLabel = document.createElement('span');
                defaultLabel.className = 'port-label';
                defaultLabel.textContent = label || '未命名端口';
                element.appendChild(defaultLabel);
                break;
        }

        this.ports.set(portId, element);

        return element;
    }

    _createPortDot(multi, requireType) {
        const dot = document.createElement('div');

        dot.className = 'port-dot';

        if (multi) {
            dot.classList.add('multi');
            dot.style.backgroundColor = nodeColorVars[requireType] || '#000000';
        } else {
            dot.classList.add('single');
            dot.style.backgroundColor = 'none';
            dot.style.borderBottomColor = nodeColorVars[requireType] || '#000000';
        }

        return dot;
    }

    // 锁定节点
    lockNode() {
        this.element.locked = true;
    }

    // 解锁节点
    unlockNode() {
        this.element.locked = false;
    }

    // 获取端口
    getPort(portIndex, portType) {
        const portId = `${this.uid}-${portType}-${portIndex}`;
        const port = this.ports.get(portId)
        if (!port) {
            console.error(`节点 ${this.uid} 没有端口 ${portIndex} (${portType})`);
            console.warn(`节点端口列表:`, this.ports);
            return null;
        }
        return port;
    }

    // 获取连接
    getConnections(portId, portType) {
        switch (portType) {
            case 'input':
                return this.connections.inputs.get(portId) || [];
            case 'prop':
                return this.connections.props.get(portId) || [];
            case 'output':
                return this.connections.outputs.get(portId) || [];
            default:
                console.error(`未知的端口类型: ${portType}`);
                return [];
        }

    }

    getAllConnections() {
        return [...this.connections.inputs.values(),
        ...this.connections.props.values(),
        ...this.connections.outputs.values()].flatMap(connections => connections);
    }

    _getConnectionsSet(portType) {
        switch (portType) {
            case 'input':
                return this.connections.inputs;
            case 'prop':
                return this.connections.props;
            case 'output':
                return this.connections.outputs;
            default:
                console.error(`未知的端口类型: ${portType}`);
        }
    }

    // 添加连接
    addConnection(connection, portType, portIndex) {
        const connections = this._getConnectionsSet(portType);
        if (!connections[portIndex]) {
            connections[portIndex] = [];
        }
        connections[portIndex].push(connection);
    }

    scale(scale) {
        this.element.style.transform = `scale(${scale})`;
        // console.log(`节点 ${this.uid} 缩放比例: ${scale}`);
    }

}
window.Node = Node;
