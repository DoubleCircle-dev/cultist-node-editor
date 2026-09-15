/**
 * 测试环境辅助：构建 webview 页面骨架 + 创建/销毁 ControllerCore
 */
import { dom, window } from './domSetup.mjs';

/**
 * 重建页面骨架。
 * UIManager/PanelManager/CanvasManager 依赖这些元素（缺省会自己兜底创建，
 * 这里显式给出以保持环境稳定）。
 *
 * @returns {{ viewport: HTMLElement, world: HTMLElement }}
 */
export function createSkeleton() {
  const { document } = window;
  document.body.innerHTML = `
    <div id="status"></div>
    <div id="mouse-coords"></div>
    <div id="placeholder" class="placeholder">占位</div>
    <div class="view-controls"></div>
    <div id="canvas-viewport">
      <div id="canvas-world"></div>
    </div>
  `;
  const viewport = document.getElementById('canvas-viewport');
  const world = document.getElementById('canvas-world');
  return { viewport, world };
}

/**
 * 创建一个全新的 ControllerCore（每个测试独立，隔离状态）。
 *
 * @returns {Promise<{ core: import('../../../ui/scripts/controllers/controllerCore.js').ControllerCore, viewport: HTMLElement, world: HTMLElement }>}
 */
export async function createCore() {
  const { ControllerCore } = await import('../../../ui/scripts/controllers/controllerCore.js');
  const { viewport, world } = createSkeleton();
  const core = new ControllerCore(world, viewport);
  return { core, viewport, world };
}

/**
 * 销毁核心（移除 document 全局监听器 + 级联销毁 8 个管理器）。
 *
 * @param {import('../../../ui/scripts/controllers/controllerCore.js').ControllerCore} core
 */
export function destroyCore(core) {
  if (core && typeof core.destroy === 'function') {
    core.destroy();
  }
}

export { dom, window };
