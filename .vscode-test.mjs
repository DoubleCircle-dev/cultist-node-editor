import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    // 扩展宿主集成测试（test/ui/**/*.test.mjs 是 jsdom 单测，不走这里）
    files: 'test/**/*.test.js',
    // 默认 interface 是 tdd（suite/test）；超时放宽，因为 openEditor 那条要等面板真的出现
    mocha: {
        timeout: 20000,
    },
});
