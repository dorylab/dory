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
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'react-hooks/immutability': 'off',
            'react-hooks/incompatible-library': 'off',
            'react-hooks/preserve-manual-memoization': 'off',
            'react-hooks/purity': 'off',
            'react-hooks/refs': 'off',
            'react-hooks/set-state-in-effect': 'off',
            'react-hooks/static-components': 'off',
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'lodash-es',
                            message: 'Import from a lodash-es subpath to keep the TypeScript declaration graph small.',
                        },
                    ],
                },
            ],
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
