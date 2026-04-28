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

            // // 强制在运算符（&&, || 等）之后换行
            // 'operator-linebreak': [
            //     'error',
            //     'after',
            //     {
            //         overrides: {
            //             // 三元运算符选择 "ignore" 或 "before"
            //             // 设置为 "ignore" 可以让 ESLint 不去强制三元运算符换行，
            //             // 从而配合 Prettier 的 printWidth 尽量保持在同一行。
            //             '?': 'ignore',
            //             ':': 'ignore',
            //         },
            //     },
            // ],
        },
    },
];
