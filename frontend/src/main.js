/**
 * Vue 入口（唯一入口）
 *
 * 与 vite-vanilla 的差异：那边是「原生 JS 直接操作 DOM」，这里是「Vue 声明式渲染」——
 * 同样交给 Vite 打包，但 src/ 下全部是 .vue 组件 + 响应式 store。
 * 旧实现留在 src-legacy/（不参与构建），对照与迁移计划见 ../DESIGN.md。
 */
import { createApp } from 'vue';

import './styles/index.css';
import App from './App.vue';
import { installHostBridge } from './host/bridge.js';

// 先接上扩展宿主（读取 NODE_EDITOR_CONFIG、注册 postMessage 监听），再挂载界面
installHostBridge();

createApp(App).mount('#app');
