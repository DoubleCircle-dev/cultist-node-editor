/* eslint-disable no-undef */
// @ts-nocheck
class BasicActionManager {

    constructor(viewport, canvas, updateStatus,nodesManager) {
        this.nodesManager = nodesManager;

        this.viewport = viewport;

        this.world = canvas;
        this.updateStatus = updateStatus;

        if (!this.viewport || !this.world) {
            console.error("无法找到 canvas-container 或 canvas 元素");
            return;
        }

        // 2. 初始化变换参数
        this.transform = {
            x: 0, // 水平偏移
            y: 0, // 垂直偏移
            scale: 1  // 缩放比例 (scale)
        };

        this.viewport.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this.viewport.addEventListener('mousedown', this.handleMouseDown.bind(this));

        this.updateTransform();

        this.viewport.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.viewport.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    /**
     * 处理滚轮缩放：核心算法
     * 目标：以鼠标指针为中心进行缩放，鼠标下的点在缩放前后位置不变
     */
    handleWheel(e) {
        e.preventDefault();

        const zoomIntensity = 0.1; // 缩放灵敏度
        const direction = e.deltaY < 0 ? 1 : -1;

        // 1. 计算新的缩放比例 (限制在 0.1 到 5 倍之间)
        const factor = Math.exp(direction * zoomIntensity);
        const newScale = Math.min(Math.max(this.transform.scale * factor, 0.1), 5);

        // 2. 获取鼠标在 Viewport 中的坐标
        const rect = this.viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 3. 计算偏移量修正
        // 公式推导：
        // WorldX = (MouseX - OldTranslateX) / OldScale
        // NewTranslateX = MouseX - WorldX * NewScale
        this.transform.x = mouseX - (mouseX - this.transform.x) * (newScale / this.transform.scale);
        this.transform.y = mouseY - (mouseY - this.transform.y) * (newScale / this.transform.scale);

        // 4. 更新状态
        this.transform.scale = newScale;
        this.updateTransform();

        // 可选：更新状态栏
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
        // 中键(1) 或 按住alt的左键(0)
        if (e.button === 1 || (e.button === 0 && e.code === 'altLeft')) {
            e.preventDefault();

            const startX = e.clientX;
            const startY = e.clientY;
            const startTransX = this.transform.x;
            const startTransY = this.transform.y;

            this.viewport.style.cursor = 'grabbing';

            const onMouseMove = (me) => {
                const dx = me.clientX - startX;
                const dy = me.clientY - startY;

                this.transform.x = startTransX + dx;
                this.transform.y = startTransY + dy;

                this.updateTransform();
            };

            const onMouseUp = () => {
                this.viewport.style.cursor = 'default';
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
}

window.BasicActionManager = BasicActionManager;
