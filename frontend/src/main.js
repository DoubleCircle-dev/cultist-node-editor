/**
 * Vue 入口（唯一入口）
 *
 * 入口只做三件事：引入全局样式、接上扩展宿主、挂载根组件。
 * src/ 下都是 .vue 组件 + 响应式 store；旧的原生实现见 src-legacy/（不参与构建）。
 */
import { createApp } from 'vue';

import './styles/index.css';
import App from './App.vue';
import { installHostBridge } from './host/bridge.js';

// 先接上扩展宿主（读取 NODE_EDITOR_CONFIG、注册 postMessage 监听），再挂载界面
installHostBridge();

createApp(App).mount('#app');
