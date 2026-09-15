import { defineConfig } from 'vite';

/**
 * Vite 配置（原生 JS，无框架）
 *
 * 结构：
 *   frontend/index.html      入口（唯一 HTML，样式/脚本由 main.js 引入）
 *   frontend/src/**          前端源码（原 ui/scripts + ui/css，已重排为 src/ 与 src/styles/）
 *   frontend/public/**       运行时数据（json-manifest / config / help / webview-config / assets / error.html）
 *   frontend/dist/**         构建产物（git 忽略；扩展在生产模式下加载它）
 *
 * 用法：
 *   npm run dev      # dev server :5173，扩展设 CNE_DEV_SERVER=1 即可让 webview 走 HMR
 *   npm run build:ui # 产出 frontend/dist
 */
export default defineConfig({
    root: 'frontend',
    // 产物内部用相对路径（./assets/xxx），扩展侧再把它们换成 webview URI
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2022',
        // 产物 sourcemap：方便在 webview DevTools 里定位到源码（.vscodeignore 已排除 *.map，不进 VSIX）
        sourcemap: true,
    },
    server: {
        port: 5173,
        // webview 的源是 vscode-webview://…，跨源加载模块必须放开 CORS
        cors: true,
        strictPort: true,
    },
});
