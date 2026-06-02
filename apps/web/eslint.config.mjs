import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import unusedImports from 'eslint-plugin-unused-imports';

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTypescript,
    globalIgnores(['dist-scripts/**', 'release/**', '.tmp/**', 'localdata/**', 'public/monaco-editor/**']),
    {
        plugins: {
            'unused-imports': unusedImports,
        },
        rules: {
            '@next/next/no-duplicate-head': 'off',
            'unused-imports/no-unused-imports': 1,
            'unused-imports/no-unused-vars': [
                1,
                {
                    vars: 'all',
                    varsIgnorePattern: '^_',
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                },
            ],
        },
    },
]);

export default eslintConfig;
