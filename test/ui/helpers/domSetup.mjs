/**
 * jsdom 全局环境引导
 *
 * 在模块求值阶段同步地把 jsdom 的 window/document/Event/CustomEvent/EventTarget
 * 等挂到 globalThis，使后续静态导入的 ui 模块（如 NodeTypeRegistry 在模块顶层
 * 就访问 document/getComputedStyle）能正常工作。
 *
 * 关键：必须保证本模块在任意 ui 模块之前被 import（放在每个测试文件第一行）。
 */
import { JSDOM } from 'jsdom';

export const dom = new JSDOM(
  '<!DOCTYPE html><html><head></head><body></body></html>',
  {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  }
);

const { window } = dom;

// 需要暴露给 ui 代码的全局标识符（按需补充）
// 注意：navigator / location / history 在 Node 24 的 globalThis 上是只读 getter，
// 且 Node 已内置，无需也不可覆盖，故不在此列出。
const GLOBALS = [
  'window',
  'document',
  'Event',
  'CustomEvent',
  'EventTarget',
  'MouseEvent',
  'KeyboardEvent',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'SVGElement',
  'DocumentFragment',
  'DOMTokenList',
  'NodeList',
  'CSSStyleDeclaration',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'MutationObserver',
  'getSelection',
];

for (const key of GLOBALS) {
  if (window[key] !== undefined) {
    globalThis[key] = window[key];
  }
}

// PanelManager 会 fetch('./help.json' / './config.json' / './json-manifest.json')，
// jsdom/undici 无法解析这类相对 URL。这里拦截 fetch 返回空对象，
// 让 JSON 加载代码路径正常执行（不报错、不刷错误日志）。
globalThis.fetch = () => Promise.resolve({ ok: true, json: async () => ({}) });

export { window };
