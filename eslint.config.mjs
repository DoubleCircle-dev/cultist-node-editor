import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';
import myRules from './myLint/rules/myRules.mjs';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';

export default [
    {
        // 生成物与临时工作区不进 lint：与 .gitignore 对齐
        ignores: [
            'agent-scratch/**',
            'node_modules/**',
            // npm test（vscode-test）会把整个 VS Code 下载到这里（1GB+、几百个 js bundle），
            // 不排除的话 `eslint .` 会把它们全部解析 → 堆爆（实测 exit 134 / V8 heap OOM）
            '.vscode-test/**',
            'coverage/**',
            // Vite 生成物与依赖（没有这些目录时无影响）
            'frontend/dist/**',
            'frontend/node_modules/**',
        ],
    },
    js.configs.recommended,
    prettierConfig,
    {
        // .mjs / .cjs 也要列进来：flat config 默认会 lint 它们，但只有这里显式声明的 files
        // 才会带上下面这些 globals —— 否则 scripts/*.mjs 里的 process / console 会被判成 no-undef
        files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
        plugins: {
            jsdoc: jsdoc,
            myRules: myRules,
        },
        languageOptions: {
            globals: {
                ...globals.commonjs,
                ...globals.node,
                ...globals.mocha,
                ...globals.browser,
                acquireVsCodeApi: 'readonly', // vscode api
                eruda: 'readonly',
            },
            ecmaVersion: 2022,
            sourceType: 'module',
        },
        rules: {
            'no-const-assign': 'warn',
            'no-this-before-super': 'warn',
            'no-undef': 'warn',
            'no-unreachable': 'warn',
            'no-unused-vars': 'off',
            'constructor-super': 'warn',
            'valid-typeof': 'warn',

            'myRules/enforce-private': 'warn',


        },
    },
    {
        // UI 单元测试（.mjs）在 Node 环境运行，提供 Node/mocha 全局变量。
        // 注意：主配置的 files 是 **/*.js，不含 .mjs，因此需单独覆盖
        // js.configs.recommended 的 no-undef（error → warn）并补充全局。
        files: ['test/ui/**/*.mjs'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.mocha,
            },
            ecmaVersion: 2022,
            sourceType: 'module',
        },
        rules: {
            'no-undef': 'warn',
        },
    },
];
