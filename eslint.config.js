import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * 静态检查按运行环境分组，规则意在拦住新增问题，不追求一次清空历史写法：
 * - renderer：浏览器 + ESM；领域层是 allowJs 的普通 .js，暂时用基础规则。
 * - main / preload / electron 配置：Electron 主进程侧，CJS，只有 Node 全局。
 * - scripts / tests：Node，.mjs 与 .cjs 混用，允许控制台输出。
 * 风格一律交给 Prettier，这里不开风格类规则，避免两套格式化互相打架。
 */
export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'release/**',
            'node_modules/**',
            '.runtime/**',
            'test-results/**',
            // 本地工作数据：一次性探针脚本与截图，不属于源码。
            '.workbuddy/**',
        ],
    },
    js.configs.recommended,
    {
        rules: {
            // 下划线前缀表示「占位不用」：领域安装函数按固定位置接收参数，
            // 多数模块只用到其中一两个，保留签名便于统一调用。
            'no-unused-vars': [
                'error',
                {
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    },
    // CommonJS 文件：require / __dirname 是正常写法。
    {
        files: ['**/*.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            'no-console': 'off',
        },
    },
    // Electron 场景测试：主进程里跑，但断言体通过 executeJavaScript 在渲染进程求值，
    // 因此同时需要浏览器与 Node 全局。
    {
        files: ['tests/**/*.electron.cjs'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
    },
    // Node 下的 ESM 脚本与测试。
    {
        files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'vite.config.ts', 'eslint.config.js'],
        languageOptions: {
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            'no-console': 'off',
        },
    },
    // 渲染层 TypeScript 与单文件组件。
    ...tseslint.configs.recommended.map((config) => ({
        ...config,
        files: ['src/renderer/**/*.ts', 'src/renderer/**/*.vue'],
    })),
    {
        files: ['src/renderer/**/*.{ts,vue}'],
        languageOptions: {
            globals: { ...globals.browser },
            parserOptions: { parser: tseslint.parser },
        },
        rules: {
            // 领域层返回 any，类型补全前组件里不可避免，先只提示。
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
    {
        files: ['src/renderer/**/*.js'],
        languageOptions: {
            sourceType: 'module',
            globals: { ...globals.browser },
        },
    },
    // 领域契约声明文件：这里是整个领域层 any 的唯一集中地，故意写成宽松的兜底类型。
    // 收紧某个分组时，改这一处即可让所有模块同时受益，因此不再逐行提示 any。
    {
        files: ['src/renderer/domain/*.d.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    // 只取 essential：recommended 里的排版类规则会和 Prettier 打架。
    ...pluginVue.configs['flat/essential'],
    {
        files: ['**/*.vue'],
        rules: {
            // 单文件组件文件名即组件名，不强制多词。
            'vue/multi-word-component-names': 'off',
        },
    },
);
