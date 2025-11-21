const eslint = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

module.exports = [
    eslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module'
            },
            globals: {
                setTimeout: 'readonly',
                clearInterval: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                Buffer: 'readonly',
                require: 'readonly',
                __dirname: 'readonly',
                process: 'readonly',
                console: 'readonly',
                Thenable: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tseslint
        },
        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase']
                }
            ],
            curly: 'warn',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: 'warn',
            'no-unused-vars': 'off'
        }
    },
    {
        files: ['**/test/**/*.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module'
            },
            globals: {
                suite: 'readonly',
                test: 'readonly',
                setup: 'readonly',
                teardown: 'readonly',
                suiteSetup: 'readonly',
                suiteTeardown: 'readonly',
                setTimeout: 'readonly',
                Buffer: 'readonly',
                require: 'readonly',
                __dirname: 'readonly',
                process: 'readonly',
                console: 'readonly',
                Thenable: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tseslint
        },
        rules: {
            '@typescript-eslint/naming-convention': 'off',
            'no-unused-vars': 'off'
        }
    }
];
