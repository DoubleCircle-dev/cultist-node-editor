import { ControllerCore } from "./controllerCore.js";
import { EventBus } from "./eventBus.js";
import { IManager } from "./manager.js";
import { NodeTypeRegistry } from "../types/nodeTypes.js";

export class PanelManager extends IManager {

    /**
     * @param {EventBus} bus
     * @param {HTMLElement} viewport
     * @param {HTMLElement} world
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        super(bus, viewport, world, coreSpace);

        this.addNodesPanel = null;
        this.findNodesPanel = null;
        this.openFilePanel = null;

        this.expandPanel = document.getElementById("expandPanel");
        this.bottomPanel = document.getElementById("bottomPanel");

        this._initPanel();
    }

    _initPanel() {
        this.addNodesPanel = this._createAddNodesPanel();

        this.findNodesPanel = document.createElement("div");
        this.findNodesPanel.id = "findNodesPanel";
        this.findNodesPanel.classList.add("expand-panel");

        this.openFilePanel = document.createElement("div");
        this.openFilePanel.id = "openFilePanel";
        this.openFilePanel.classList.add("expand-panel");

    }

    _createAddNodesPanel() {
        // 根容器 div.add-nodes-panel
        const panel = document.createElement('div');
        panel.className = 'expand-panel';
        panel.id = 'addNodesPanel';

        // --- panel-header ---
        const header = document.createElement('div');
        header.className = 'panel-header';

        const h3 = document.createElement('h3');
        const spanTitle = document.createElement('span');
        spanTitle.textContent = '📦 添加节点';
        h3.appendChild(spanTitle);
        header.appendChild(h3);

        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'search-wrapper';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'search-input';
        searchInput.id = 'searchInput';
        searchInput.placeholder = '🔍 搜索节点 (名称/描述/类型)...';
        searchInput.autocomplete = 'off';
        searchWrapper.appendChild(searchInput);
        header.appendChild(searchWrapper);

        panel.appendChild(header);

        // --- node-list 容器 ---
        const nodeList = document.createElement('div');
        nodeList.className = 'node-list';
        nodeList.id = 'nodeListContainer';

        const allEntries = Object.entries(NodeTypeRegistry.nodeTypes);

        allEntries.forEach(([typeKey, config]) => {
            const node = document.createElement('div');
            node.className = 'node-item';

            let html = '';
            const displayName = config.label || config.title || typeKey;
            const icon = config.icon || '📦';
            const color = config.color || '#6b7280';
            const description = config.content ? config.content.substring(0, 45) + (config.content.length > 45 ? '…' : '') : '点击添加节点';

            html += `
                        <div class="node-color-indicator" style="background: ${color};"></div>
                        <div class="node-icon">${icon}</div>
                        <div class="node-info">
                            <div class="name">
                                ${displayName}
                                <span>${typeKey}</span>
                            </div>
                            <div class="desc">${description}</div>
                        </div>
                `;

            node.innerHTML = html;

            node.addEventListener('click', () => {
                this.bus.emit('addNode', { type: typeKey });
            })

            nodeList.appendChild(node);
        })

        // 内部注释可以忽略，动态渲染时填充内容
        panel.appendChild(nodeList);



        return panel;
    }

    removeExpandPanel() {
        this.addNodesPanel?.remove();
        this.findNodesPanel?.remove();
        this.openFilePanel?.remove();
    }

    removeBottomPanel() {

    }



    /**
     * @param {string} panel
     */
    togglePanel(panel) {

        switch (panel) {
            case "addNodesPanel":
                this.removeExpandPanel();
                this.expandPanel?.appendChild(this.addNodesPanel);
                this.expandPanel?.classList.toggle("hidden");
                break;
            case "findNodesPanel":
                this.removeExpandPanel();
                this.expandPanel.appendChild(this.findNodesPanel);
                this.expandPanel?.classList.toggle("hidden");
                break;
            case "openFilePanel":
                this.removeExpandPanel();
                this.expandPanel.appendChild(this.openFilePanel);
                this.expandPanel?.classList.toggle("hidden");
                break;
            default:
                break;
        }

    }
}
