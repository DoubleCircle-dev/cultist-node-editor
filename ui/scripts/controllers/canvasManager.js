import { EditorConfig } from './constant.js';
import { ControllerCore } from './controllerCore.js';
import { EventBus } from '../types/eventBus.js';

export class CanvasManager {
    /**
     * @param {EventBus} bus
     * @param {HTMLElement} viewport
     * @param {HTMLElement} world
     * @param {ControllerCore} coreSpace
     */
    constructor(bus, viewport, world, coreSpace) {
        this.bus = bus;
        this.viewport = viewport;
        this.world = world;
        this.statusBar = document.getElementById('status-bar-under');
        this.coreSpace = coreSpace;

        if (!this.viewport || !this.world) {
            console.error('无法找到 canvas-container 或 canvas界面 元素');
            return;
        }

        this.transform = {
            x: 0, // 水平偏移
            y: 0, // 垂直偏移
            scale: 1, // 缩放比例 (scale)
        };

        this.panState = {
            panning: false,
            startX: 0,
            startY: 0,
            startTransX: 0,
            startTransY: 0,
            /** @type {number | null} */ panBtn: null,
        };

        this.mousePos = {
            viewportX: 0,
            viewportY: 0,
            worldX: 0,
            worldY: 0,
        };

        this.transform = { x: 0, y: 0, scale: 1 };

        this.mode = 'select';

        this._initListeners();
    }

    /** @private */
    _initListeners() {
        this.viewport.addEventListener('wheel', this.handleWheel.bind(this), {
            passive: false,
        });
        this.viewport.addEventListener('mousedown', this.handleMouseDown.bind(this));

        this.viewport.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.viewport.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

    }

    /**
     * 处理滚轮缩放：核心算法 目标：以鼠标指针为中心进行缩放，鼠标下的点在缩放前后位置不变
     *
     * @param {{
     *     preventDefault: () => void;
     *     deltaY: number;
     *     clientX: number;
     *     clientY: number;
     * }} e
     */
    handleWheel(e) {
        e.preventDefault();

        const zoomIntensity = EditorConfig.ZOOM.STEP; // 缩放灵敏度
        const direction = e.deltaY < 0 ? 1 : -1;

        // 计算新的缩放比例
        const factor = Math.exp(direction * zoomIntensity);
        const newScale = Math.min(Math.max(this.transform.scale * factor, EditorConfig.ZOOM.MIN), EditorConfig.ZOOM.MAX);

        this.setZoom(newScale, false, e.clientX, e.clientY);
    }

    /**
     * 处理平移：鼠标中键 或 alt+左键
     *
     * @param {{
     *     preventDefault: () => void;
     *     button: number;
     *     altKey: any;
     *     clientX: any;
     *     clientY: any;
     * }} e
     */
    handleMouseDown(e) {
        if (this.panState?.panning) {
            e.preventDefault();
            return;
        }

        // 中键(1) 或 按住alt的左键(0) 或 移动模式下的左键(0)
        if (e.button === 1 || (this.mode === 'drag' && e.button === 0) || (e.button === 0 && e.altKey)) {
            e.preventDefault();

            this.panState = {
                panning: true,
                startX: e.clientX,
                startY: e.clientY,
                startTransX: this.transform ? this.transform.x : 0,
                startTransY: this.transform ? this.transform.y : 0,
                panBtn: e.button,
            };

            const preCursor = this.viewport.style.cursor;
            this.viewport.style.cursor = 'grabbing';

            const onMouseMove = (/** @type {{ clientX: number; clientY: number }} */ me) => {
                if (!this.panState.panning) return;

                const dx = me.clientX - this.panState.startX;
                const dy = me.clientY - this.panState.startY;

                this.transform.x = this.panState.startTransX + dx;
                this.transform.y = this.panState.startTransY + dy;

                this.updateTransform();
            };

            const onMouseUp = (/** @type {{ button: any }} */ e) => {
                if (e.button !== this.panState.panBtn) return;

                this.panState.panning = false;
                this.viewport.style.cursor = preCursor;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        } else if (e.button === 0) {
            this.bus.emit('canvas:click', this.mousePos);
        }
    }

    handleClick(e) {
        if (this.mode === 'select') {
            this.bus.emit('canvas:click', this.mousePos);
        }
    }

    // 监听鼠标位置
    /** @param {MouseEvent} e */
    handleMouseMove(e) {
        // 1. 仅仅记录数据，不触发逻辑
        const rect = this.viewport.getBoundingClientRect();
        const vX = e.clientX - rect.left;
        const vY = e.clientY - rect.top;

        this.mousePos = {
            clientX: e.clientX,
            clientY: e.clientY,
            viewportX: vX,
            viewportY: vY,
            worldX: (vX - this.transform.x) / this.transform.scale,
            worldY: (vY - this.transform.y) / this.transform.scale,
        };

        // 2. 使用 rAF 节流：只在浏览器准备重绘时才派发一次事件
        if (!this.ticking) {
            window.requestAnimationFrame(() => {
                this.bus.emit('mousePosition', this.mousePos);
                this.ticking = false;
            });
            this.ticking = true;
        }
    }

    // 鼠标移出画布时清空显示（保持界面整洁）
    handleMouseLeave() {
        this.bus.emit('mousePosition', {
            clientX: 0,
            clientY: 0,
            viewportX: 0,
            viewportY: 0,
            worldX: 0,
            worldY: 0,
        });
    }

    

    /** @param {string} mode */
    setMode(mode) {
        this.mode = mode;
        // 更新光标样式
        if (mode === 'drag') {
            this.viewport.style.cursor = 'move';
        } else if (mode === 'focus') {
            this.viewport.style.cursor = 'crosshair';
        } else {
            this.viewport.style.cursor = 'default';
        }

        this.bus.emit('modeChanged', { mode });
    }

    getMode() {
        return this.mode;
    }

    /** @param {number} value */
    setZoom(value, keepCenter = true, clientX = 0, clientY = 0) {
        const rect = this.viewport.getBoundingClientRect();
        let centerX = rect.width / 2;
        let centerY = rect.height / 2;

        if (!keepCenter) {
            // 修改视口中心点为鼠标位置
            centerX = clientX - rect.left;
            centerY = clientY - rect.top;
        }

        // 计算偏移量修正
        this.transform.x = centerX - (centerX - this.transform.x) * (value / this.transform.scale);
        this.transform.y = centerY - (centerY - this.transform.y) * (value / this.transform.scale);

        this.transform.scale = value;

        if (this.panState.panning) {
            this.panState = {
                panning: true,
                startX: clientX,
                startY: clientY,
                startTransX: this.transform.x,
                startTransY: this.transform.y,
                panBtn: this.panState.panBtn,
            };
        }

        this.updateTransform();
    }

    fitView() {
        let nodes = this.coreSpace.selectedNodes;

        if (nodes.length === 0) {
            nodes = this.coreSpace.nodes;
        }

        if (nodes.length === 0) {
            console.warn('未找到节点');
            return;
        }

        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        nodes.forEach((node) => {
            const w = node.width;
            const h = node.height;
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + w);
            maxY = Math.max(maxY, node.y + h);
        });

        const viewportW = this.viewport.clientWidth;
        const viewportH = this.viewport.clientHeight;
        const padding = 50;
        const scaleX = (viewportW - padding * 2) / (maxX - minX);
        const scaleY = (viewportH - padding * 2) / (maxY - minY);
        let newScale = Math.min(scaleX, scaleY);
        newScale = Math.max(0, newScale);

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const newX = viewportW / 2 - centerX * newScale;
        const newY = viewportH / 2 - centerY * newScale;

        this.transform.scale = newScale;
        this.transform.x = newX;
        this.transform.y = newY;
        this.updateTransform();
    }

    //强制画面缩放微小幅度，以触发重绘
    Brefresh() {
        const s = this.transform.scale;
        this.transform.scale += 0.01;
        this.updateTransform();
        this.transform.scale = s;
        this.updateTransform();
    }

    refresh() {
        const viewBak = this.viewport;
        const statusBak = this.statusBar;
        const vParent = this.viewport.parentNode;
        const sParent = this.statusBar.parentNode;

        if (vParent) {
            // 移除
            vParent.removeChild(viewBak);
            // 强制短暂延迟（可选，确保渲染引擎察觉变化）
            setTimeout(() => {
                // 重新插入
                vParent.appendChild(viewBak);
                this.viewport = viewBak;
            }, 0);
        }

        if (sParent) {
            // 移除
            sParent.removeChild(statusBak);
            // 强制短暂延迟（可选，确保渲染引擎察觉变化）
            setTimeout(() => {
                // 重新插入
                sParent.appendChild(statusBak);
                this.statusBar = statusBak;
            }, 0);
        }

        this.updateTransform();
    }

    // 处理缩放与平移更新
    updateTransform() {
        this.world.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;

        this.bus.emit('transformChanged', this.transform);
    }

    /**
     * 视口坐标转画布坐标
     *
     * @param {number} clientX
     * @param {number} clientY
     */
    viewportToWorld(clientX, clientY) {
        const rect = this.viewport.getBoundingClientRect();
        return {
            x: (clientX - rect.left - this.transform.x) / this.transform.scale,
            y: (clientY - rect.top - this.transform.y) / this.transform.scale,
        };
    }

    /**
     * 画布坐标转视口坐标
     *
     * @param {number} x
     * @param {number} y
     */
    worldToViewport(x, y) {
        const rect = this.viewport.getBoundingClientRect();
        return {
            x: x * this.transform.scale + rect.left + this.transform.x,
            y: y * this.transform.scale + rect.top + this.transform.y,
        };
    }

    get ViewCenter() {
        const rect = this.viewport.getBoundingClientRect();
        return this.viewportToWorld(rect.width / 2, rect.height / 2);
    }

    reset() {
        this.transform = {
            x: 0,
            y: 0,
            scale: 1,
        };

        this.panState = {
            panning: false,
            startX: 0,
            startY: 0,
            startTransX: 0,
            startTransY: 0,
            panBtn: null,
        };

        this.mousePos = {
            viewportX: 0,
            viewportY: 0,
            worldX: 0,
            worldY: 0,
        };

        this.transform = { x: 0, y: 0, scale: 1 };
        this.updateTransform();

        this.mode = 'select';
        this.setMode(this.mode);
    }
}
