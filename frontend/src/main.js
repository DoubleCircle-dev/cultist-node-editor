/**
 * 入口（接口层）
 *
 * 本线目前只保留与扩展对接的接口，**不含界面实现**：
 * 接上宿主（读 NODE_EDITOR_CONFIG、注册消息监听）即完成。
 * 界面怎么搭见 ../DESIGN.md，实现时从 host/ 往下长。
 */
import { installHostBridge } from './host/bridge.js';

installHostBridge();
