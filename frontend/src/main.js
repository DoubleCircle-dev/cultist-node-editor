/**
 * Vite 入口（唯一入口）
 *
 * 与 vanilla 分支的差异：那边由 webUI.html 手写 20 条 <link> + 2 条 <script type="module">，
 * 再由扩展扫描目录注入；这里全部交给 Vite —— 样式集中 import，脚本单一入口。
 *
 * 加载顺序等价于 vanilla 的两条 module script：index.js（应用主入口，自调用 initWebview）→ debug.js。
 * devPreviewPage.js 必须排在 index.js 之前：它要在 index.js 读 NODE_EDITOR_CONFIG 之前
 * 写入预览模式标记（仅对带 ?cneDevPreview=1 的 http 页面生效）。
 */
import './styles/index.css';

import './devPreviewPage.js';
import './index.js';
import './debug.js';
