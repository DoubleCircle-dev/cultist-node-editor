import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';
import myRules from './myLint/rules/myRules.mjs';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    prettierConfig,
    {
        files: ['**/*.js'],
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
