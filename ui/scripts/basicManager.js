/* eslint-disable no-undef */
// @ts-nocheck
class BasicActionManager {

    constructor(viewport, canvas, updateStatus, nodesManager) {
        this.nodesManager = nodesManager;

        this.viewport = viewport;

        this.world = canvas;
        this.updateStatus = updateStatus;

        if (!this.viewport || !this.world) {
            console.error("无法找到 canvas-container 或 canvas 元素");
            return;
        }

        this.transform = {
            x: 0, // 水平偏移
            y: 0, // 垂直偏移
            scale: 1  // 缩放比例 (scale)
        };

        this.panState = {
            panning: false,
            startX: 0,
            startY: 0,
            startTransX: 0,
            startTransY: 0,
            panBtn: null
        }

        this.viewport.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this.viewport.addEventListener('mousedown', this.handleMouseDown.bind(this));

        this.updateTransform();

        this.viewport.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.viewport.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

        this.mode = "select";
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    /**
     * 处理滚轮缩放：核心算法
     * 目标：以鼠标指针为中心进行缩放，鼠标下的点在缩放前后位置不变
     */
    handleWheel(e) {
        e.preventDefault();

        const zoomIntensity = 0.1; // 缩放灵敏度
        const direction = e.deltaY < 0 ? 1 : -1;

        // 计算新的缩放比例 (限制在 0.1 到 5 倍之间)
        const factor = Math.exp(direction * zoomIntensity);
        const newScale = Math.min(Math.max(this.transform.scale * factor, 0.1), 5);

        this.setZoom(newScale, false, e.clientX, e.clientY);

        // 更新状态栏
        this.updateStatus(`缩放: ${(newScale * 100).toFixed(0)}%`);
        const scaleStatus = document.getElementById('canvas-scale-display');
        if (scaleStatus) {
            scaleStatus.textContent = `${(newScale * 100).toFixed(0)}%`;
        }

    }

    /**
     * 处理平移：鼠标中键 或 空格+左键
     */
    handleMouseDown(e) {
        if (this.panState.panning) {
            e.preventDefault();
            return;
        }

        // 中键(1) 或 按住alt的左键(0) 或 移动模式下的左键(0)
        if (
            e.button === 1 ||
            (this.mode === "drag" && e.button === 0) ||
            (e.button === 0 && e.altKey)
        ) {
            e.preventDefault();

            this.panState = {
                panning: true,
                startX: e.clientX,
                startY: e.clientY,
                startTransX: this.transform.x,
                startTransY: this.transform.y,
                panBtn: e.button
            }

            const preCursor = this.viewport.style.cursor;
            this.viewport.style.cursor = 'grabbing';

            const onMouseMove = (me) => {
                if (!this.panState.panning) return;

                const dx = me.clientX - this.panState.startX;
                const dy = me.clientY - this.panState.startY;

                this.transform.x = this.panState.startTransX + dx;
                this.transform.y = this.panState.startTransY + dy;


                this.updateTransform();
            };

            const onMouseUp = (e) => {
                if (e.button !== this.panState.panBtn) return;

                this.panState.panning = false;
                this.viewport.style.cursor = preCursor;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

    }

    updateTransform() {
        // 应用 CSS 变换
        this.world.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
        this.updateZoomDisplay();

        this.nodesManager.transform = this.transform;
    }

    // 处理鼠标移动
    handleMouseMove(e) {
        const rect = this.viewport.getBoundingClientRect();

        // 视口坐标（相对于 canvas-container）
        const viewportX = e.clientX - rect.left;
        const viewportY = e.clientY - rect.top;

        // 世界坐标（考虑平移和缩放）
        const worldX = (viewportX - this.transform.x) / this.transform.scale;
        const worldY = (viewportY - this.transform.y) / this.transform.scale;

        // 更新 UI
        const coordDisplay = document.getElementById('mouse-coords');
        if (coordDisplay) {
            coordDisplay.textContent = `视口:(${Math.round(viewportX)}, ${Math.round(viewportY)}) 世界:(${worldX.toFixed(1)}, ${worldY.toFixed(1)})`;
        }

    }

    // 鼠标移出画布时清空显示（保持界面整洁）
    handleMouseLeave() {
        const coordDisplay = document.getElementById('mouse-coords');
        if (coordDisplay) {
            coordDisplay.textContent = '(0,0) | (0,0)';
        }
    }

    // 处理键盘事件--快捷键设置
    handleKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        const key = e.key.toUpperCase();
        if (key === 'H') {
            e.preventDefault();
            this.setMode('select');
        } else if (key === 'G') {
            e.preventDefault();
            this.setMode('drag');
        } else if (key === 'F') {
            e.preventDefault();
            this.setMode('focus');
        }
    }

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
        // 触发自定义事件，以便更新按钮激活状态
        const event = new CustomEvent('modeChanged', { detail: { mode } });
        this.viewport.dispatchEvent(event);
    }

    getMode(){
        return this.mode;
    }

    fitView() {
        const nodes = Array.from(this.nodesManager.nodes.values());
        if (nodes.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(node => {
            const w = node.element.offsetWidth;
            const h = node.element.offsetHeight;
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
        let newScale = Math.min(scaleX, scaleY, 2);
        newScale = Math.max(0.2, Math.min(newScale, 5));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const newX = viewportW / 2 - centerX * newScale;
        const newY = viewportH / 2 - centerY * newScale;

        this.transform.scale = newScale;
        this.transform.x = newX;
        this.transform.y = newY;
        this.updateTransform();
        this.updateZoomDisplay();
    }

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
                panBtn: this.panState.panBtn
            }
        }

        this.updateTransform();
        this.updateZoomDisplay();
    }

    updateZoomDisplay() {
        const scale = this.transform.scale;
        const percent = Math.round(scale * 100) + '%';
        const slider = document.getElementById('zoom-slider');
        const percentSpan = document.getElementById('zoom-percent');
        const scaleDisplay = document.getElementById('canvas-scale-display');
        if (slider) slider.value = scale;
        if (percentSpan) percentSpan.textContent = percent;
        if (scaleDisplay) scaleDisplay.textContent = percent;
    }

    toggleConnections() {
        this.connectionsHidden = !this.connectionsHidden;
        document.body.classList.toggle('hide-connections', this.connectionsHidden);
        return this.connectionsHidden;
    }

}

window.BasicActionManager = BasicActionManager;
