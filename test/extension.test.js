const assert = require('assert');
const path = require('path');
const vscode = require('vscode');
const extension = require('../extension');
const frontendHost = require('../frontend-host');

/**
 * 扩展宿主集成测试（vscode-test / @vscode/test-cli）
 *
 * 与 test/ui/**（jsdom 单测）互补：这里跑在**真实的 VS Code 扩展宿主**里，
 * 覆盖 jsdom 测不到的那一层 ——
 *   · activate() 真的注册了 4 个命令
 *   · 从 extension.js → frontend-host 契约层 → 具体实现（vanilla/vite）这条链路能产出**应用页**，
 *     而不是悄悄回退成错误页（错误页里没有 id="canvas-basic"）
 *   · NODE_EDITOR_CONFIG 正常注入、previewMode 能透传
 *   · openEditor 命令真的能开出一个面板
 *
 * ⚠️ 断言刻意做成「实现无关」：依赖前端实现的断言只在**确实存在实现**时执行，
 * 因此同一份测试在没有前端的工作区里也能通过。
 */

/** 当前工作区是否存在前端实现（没有时只跑后端相关断言） */
const HAS_FRONTEND = frontendHost.listImpls().length > 0;

const EXT_ROOT = path.resolve(__dirname, '..');

const COMMANDS = [
    'cultist-node-editor.openEditor',
    'cultist-node-editor.loadMod',
    'cultist-node-editor.newMod',
    'cultist-node-editor.openJsonPreview',
];

/** 最小 ExtensionContext 替身（只要 activate/getWebviewContent 用到的字段） */
function makeContext() {
    return {
        subscriptions: [],
        extensionPath: EXT_ROOT,
        extensionUri: vscode.Uri.file(EXT_ROOT),
    };
}

/** 最小 WebviewPanel 替身：asWebviewUri 直接返回入参（Uri 自带 toString） */
function makePanel() {
    return {
        webview: {
            cspSource: 'vscode-webview://integration-test',
            asWebviewUri: (uri) => uri,
        },
    };
}

suite('扩展宿主集成测试', () => {
    test('activate 不抛错，并且 4 个命令都已注册', async () => {
        const before = await vscode.commands.getCommands(true);
        // activationEvents 是 "*"，宿主通常已经激活过扩展；没有的话手动激活一次
        if (!before.includes(COMMANDS[0])) {
            extension.activate(makeContext());
        }
        const all = await vscode.commands.getCommands(true);
        for (const id of COMMANDS) {
            assert.ok(all.includes(id), `命令未注册：${id}`);
        }
    });

    if (HAS_FRONTEND) {
        test('getWebviewContent 产出应用页（而不是回退到错误页）', () => {
            const html = extension.getWebviewContent(makePanel(), makeContext());

            assert.ok(html.includes('id="canvas-basic"'), '应包含画布节点；缺失说明回退成了错误页');
            assert.ok(html.includes('id="canvas-viewport"'), '应包含画布视口');
            assert.ok(/<script[^>]*type="module"/.test(html), '应有 module 脚本（前端入口）');
            assert.ok(html.includes('window.NODE_EDITOR_CONFIG'), '应注入前端配置');
        });

        test('previewMode 会透传给前端（customEditor「打开方式」用）', () => {
            const normal = extension.getWebviewContent(makePanel(), makeContext());
            assert.equal(/"previewMode": true/.test(normal), false, '普通模式不应带 previewMode');

            const preview = extension.getWebviewContent(makePanel(), makeContext(), { previewMode: true });
            assert.ok(/"previewMode": true/.test(preview), '预览模式应透传 previewMode');
        });

        test('配置里带可用的占位图 URI（图片加载失败时前端回退用）', () => {
            const html = extension.getWebviewContent(makePanel(), makeContext());
            const matched = html.match(/"placeholderImage": "([^"]+)"/);
            assert.ok(matched, 'NODE_EDITOR_CONFIG 里应有 placeholderImage');
            assert.ok(matched[1].length > 0, 'placeholderImage 不应为空');
        });
    } else {
        test('没有前端实现时，给出可读的提示页而不是白屏', () => {
            const html = extension.getWebviewContent(makePanel(), makeContext());

            assert.ok(html.length > 0, '不应返回空串（那就是白屏）');
            assert.ok(html.includes('没有可用的前端实现'), '应说明缺少前端实现');
        });
    }

    test('openEditor 命令真的能打开编辑器面板', async function () {
        this.timeout(20000);

        await vscode.commands.executeCommand('cultist-node-editor.openEditor');

        const deadline = Date.now() + 10000;
        let tab;
        while (Date.now() < deadline) {
            tab = vscode.window.tabGroups.all
                .flatMap((group) => group.tabs)
                .find((t) => t.label === '节点编辑器');
            if (tab) break;
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        assert.ok(tab, '应出现标题为「节点编辑器」的标签页');

        // 收尾：关掉面板，避免影响后续测试与 preloadOrigin 的后台任务
        await vscode.window.tabGroups.close(tab);
    });
});
