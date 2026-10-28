import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import prettier from 'eslint-config-prettier'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { importX } from 'eslint-plugin-import-x'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// airbnb-base has no flat config (and no release since 2021), so the base is ESLint's and
// typescript-eslint's recommended sets, plus the airbnb rules this code relies on
export default defineConfig(
  globalIgnores(['build/', '.yarn/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  // turns off the rules that conflict with prettier, so it goes after the shared configs
  prettier,
  {
    languageOptions: {
      globals: globals.node,
    },
    plugins: {
      '@stylistic': stylistic,
    },
    settings: {
      // resolves the `~/` alias of tsconfig.json
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    rules: {
      // what prettier would write with .prettierrc, where it does not differ from the existing code
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/max-len': ['error', {
        code: 120, ignoreUrls: true, ignoreRegExpLiterals: true, ignoreStrings: true, ignoreTemplateLiterals: true,
      }],
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'no-console': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-await-in-loop': 'error',
      // puppeteer.launch() and express.static() are how both document their default export
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-extraneous-dependencies': ['error', {
        devDependencies: ['test/**', 'scripts/**', '*.config.{js,ts,mts}'],
      }],
    },
  },
  {
    // command line tools: their output is the console, and the benchmark measures one request at a time
    files: ['scripts/**'],
    rules: {
      'no-console': 'off',
      'no-await-in-loop': 'off',
    },
  },
)
