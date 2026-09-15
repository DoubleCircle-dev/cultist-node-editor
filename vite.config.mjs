import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * Vite 配置（Vue 3）
 *
 * 结构：
 *   frontend/index.html      入口（唯一 HTML，含 #app 的静态骨架）
 *   frontend/src/**          Vue 实现：main.js / App.vue / components / stores / host
 *   frontend/src-legacy/**   旧的原生 JS 实现（不参与构建，留作迁移对照）
 *   frontend/public/**       运行时数据（json-manifest / config / help / webview-config / assets / error.html）
 *   frontend/dist/**         构建产物（git 忽略；扩展在生产模式下加载它）
 *
 * 用法：
 *   npm run dev      # dev server :5173，扩展设 CNE_DEV_SERVER=1 即可让 webview 走 HMR
 *   npm run build:ui # 产出 frontend/dist
 */
export default defineConfig({
    root: 'frontend',
    plugins: [vue()],
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
