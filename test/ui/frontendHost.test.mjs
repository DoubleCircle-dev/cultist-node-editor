import './helpers/domSetup.mjs';
import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import frontendHost from '../../frontend-host/index.js';

/**
 * frontend-host 契约测试（默认方案 = vanilla）
 *
 * 目的：`core` 分支自带一份可跑的前端（ui/），作为后端改动的「默认方案预览测试」。
 * 这里不启动扩展宿主，直接用假的 runtime 调契约层，验证：
 *   1. 目录下恰好存在一个实现，且导出完整接口；
 *   2. 能产出入口 HTML（原硬编码 <link>/<script> 被换掉、扫描到的资源被注入）；
 *   3. window.NODE_EDITOR_CONFIG 正常注入，previewMode 透传；
 *   4. 缺少 webview-config.json 时不注入（保持原行为）。
 *
 * 换前端实现（vite 分支）时本测试需要相应调整 —— 它守的是「默认方案没烂」。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 构造假 runtime：把本地路径映射成可断言的假 webview URI */
function makeRuntime() {
  return {
    context: { extensionPath: repoRoot },
    panel: { webview: { cspSource: 'vscode-webview://fake', asWebviewUri: () => {} } },
    toWebviewUri: (filePath) => `webview:///${path.relative(repoRoot, filePath).split(path.sep).join('/')}`,
  };
}

/** 从注入的 HTML 里取出 NODE_EDITOR_CONFIG */
function extractConfig(html) {
  const match = html.match(/window\.NODE_EDITOR_CONFIG = ([\s\S]*?);\s*\n/);
  assert.ok(match, '应当注入了 window.NODE_EDITOR_CONFIG');
  return JSON.parse(match[1]);
}

describe('frontend-host 契约（默认方案 vanilla）', () => {
  it('目录下恰好有一个实现，且导出完整接口', () => {
    const impls = frontendHost.listImpls();
    assert.equal(impls.length, 1, `core 分支应当只有 1 个前端实现，实际：${impls.join(', ')}`);

    const impl = frontendHost.getImpl();
    assert.equal(impl.name, 'vanilla');
    for (const fn of ['buildHtml', 'buildConfig', 'buildErrorHtml']) {
      assert.equal(typeof impl[fn], 'function', `实现必须导出 ${fn}()`);
    }
  });

  it('产出入口 HTML：硬编码资源被移除、扫描到的 css/js 被注入', () => {
    const html = frontendHost.renderWebviewHtml(makeRuntime());

    // 原 HTML 里手写的 <link> 必须被删掉（否则会和注入的资源重复）
    assert.equal(html.includes('href="css/variables.css"'), false);
    // 扫描注入：ui/scripts/** 与 ui/css/** 全部转成 webview URI
    assert.ok(html.includes('webview:///ui/scripts/index.js'), '应注入 scripts/index.js');
    assert.ok(html.includes('type="module"'), '脚本应以 module 形式注入');
    assert.ok(html.includes('webview:///ui/css/variables.css'), '应注入 css/variables.css');
    assert.ok(html.includes('webview:///ui/css/utils/preview.css'), '扫描是全量的，preview.css 也应包含');
    // 正文结构保持
    assert.ok(html.includes('</html>'));
  });

  it('注入 NODE_EDITOR_CONFIG，并透传 previewMode / placeholderImage', () => {
    const runtime = makeRuntime();
    const normal = extractConfig(frontendHost.renderWebviewHtml(runtime));
    assert.equal(normal.previewMode, undefined);
    assert.equal(normal.placeholderImage, 'webview:///ui/assets/img/placeholder.png');

    const preview = extractConfig(frontendHost.renderWebviewHtml(runtime, { previewMode: true }));
    assert.equal(preview.previewMode, true);
  });

  it('实现报错时回退到错误页（ui/error.html）', () => {
    const broken = makeRuntime();
    // 让资源转换抛错，触发契约层的兜底分支
    broken.toWebviewUri = () => {
      throw new Error('boom');
    };
    const html = frontendHost.renderWebviewHtml(broken);
    assert.ok(html.includes('节点编辑器'), '应回退到 core 的 ui/error.html');
    assert.ok(html.includes('错误'));
  });
});
