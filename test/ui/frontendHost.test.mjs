import './helpers/domSetup.mjs';
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import frontendHost from '../../frontend-host/index.js';

/**
 * frontend-host 契约测试（Vite 方案）
 *
 * core 分支的同名测试守的是「默认方案（vanilla + ui/）没烂」；本文件守的是
 * 「Vite 方案的两种模式（dev server / dist 产物）与兜底页仍符合契约」。
 * 换实现时要相应调整 —— 这正是契约层存在的意义：extension.js 两边完全一致。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 构造假 runtime：把本地路径映射成可断言的假 webview URI */
function makeRuntime(extensionPath = repoRoot) {
  return {
    context: { extensionPath },
    panel: { webview: { cspSource: 'vscode-webview://fake', asWebviewUri: () => {} } },
    toWebviewUri: (filePath) =>
      `webview:///${path.relative(extensionPath, filePath).split(path.sep).join('/')}`,
  };
}

/** 从注入的 HTML 里取出 NODE_EDITOR_CONFIG */
function extractConfig(html) {
  const match = html.match(/window\.NODE_EDITOR_CONFIG = ([\s\S]*?);\s*\n/);
  assert.ok(match, '应当注入了 window.NODE_EDITOR_CONFIG');
  return JSON.parse(match[1]);
}

/** 造一个最小可用的「已构建」目录：<tmp>/frontend/dist + <tmp>/frontend/public */
function makeBuiltFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cne-vite-'));
  const dist = path.join(root, 'frontend', 'dist');
  const publicDir = path.join(root, 'frontend', 'public');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  fs.writeFileSync(
    path.join(dist, 'index.html'),
    '<!doctype html><html><head><title>节点编辑器</title></head><body><div id="app"></div>\n' +
      '<script type="module" crossorigin src="./assets/index-abc.js"></script>\n' +
      '<link rel="stylesheet" crossorigin href="./assets/index-abc.css">\n</body></html>'
  );
  fs.writeFileSync(path.join(dist, 'assets', 'index-abc.js'), '// bundle');
  fs.writeFileSync(path.join(dist, 'assets', 'index-abc.css'), '/* css */');
  fs.writeFileSync(path.join(publicDir, 'webview-config.json'), JSON.stringify({ name: '节点编辑器' }));
  fs.writeFileSync(path.join(publicDir, 'error.html'), '<html><body>错误 - 节点编辑器</body></html>');
  return root;
}

describe('frontend-host 契约（Vite 方案）', () => {
  const savedDevServer = process.env.CNE_DEV_SERVER;

  beforeEach(() => {
    delete process.env.CNE_DEV_SERVER;
  });

  afterEach(() => {
    if (savedDevServer === undefined) delete process.env.CNE_DEV_SERVER;
    else process.env.CNE_DEV_SERVER = savedDevServer;
  });

  it('目录下恰好有 vite 实现，且导出完整接口', () => {
    const impls = frontendHost.listImpls();
    assert.deepEqual(impls, ['vite'], `vite 分支不应再带 vanilla 实现，实际：${impls.join(', ')}`);

    const impl = frontendHost.getImpl();
    assert.equal(impl.name, 'vite');
    for (const fn of ['buildHtml', 'buildConfig', 'buildErrorHtml']) {
      assert.equal(typeof impl[fn], 'function', `实现必须导出 ${fn}()`);
    }
  });

  it('开发模式：入口指向 dev server，并注入放行 dev server 的 CSP', () => {
    process.env.CNE_DEV_SERVER = '1';
    const html = frontendHost.renderWebviewHtml(makeRuntime());

    assert.ok(html.includes('http://localhost:5173/@vite/client'), '应注入 @vite/client 以启用 HMR');
    assert.ok(html.includes('http://localhost:5173/src/main.js'), '入口应指向 dev server');
    assert.ok(html.includes('Content-Security-Policy'), '开发模式需要注入 CSP');
    assert.ok(html.includes('ws://localhost:5173'), 'connect-src 需放行 HMR 的 websocket');

    const config = extractConfig(html);
    assert.equal(config.devServer, 'http://localhost:5173');
  });

  it('生产模式：读 dist 产物并把 ./assets/** 换成 webview URI', () => {
    const root = makeBuiltFixture();
    try {
      const html = frontendHost.renderWebviewHtml(makeRuntime(root));

      assert.ok(html.includes('webview:///frontend/dist/assets/index-abc.js'), 'bundle 应换成 webview URI');
      assert.ok(html.includes('webview:///frontend/dist/assets/index-abc.css'), 'css 应换成 webview URI');
      assert.equal(html.includes('src="./assets/'), false, '不应残留相对路径引用');
      assert.equal(html.includes('Content-Security-Policy'), false, '生产模式不注入 CSP（保持原行为）');

      const config = extractConfig(html);
      assert.equal(config.name, '节点编辑器', 'webview-config.json 应被注入');
      assert.equal(config.devServer, undefined);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('dist 缺失且未开 dev 模式时回退到 error.html', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cne-vite-empty-'));
    try {
      fs.mkdirSync(path.join(root, 'frontend', 'public'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'frontend', 'public', 'error.html'),
        '<html><body>错误 - 节点编辑器</body></html>'
      );

      const html = frontendHost.renderWebviewHtml(makeRuntime(root));
      assert.ok(html.includes('错误 - 节点编辑器'), '应回退到 frontend/public/error.html');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
