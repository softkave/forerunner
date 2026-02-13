import {FlatCompat} from '@eslint/eslintrc';
import js from '@eslint/js';
import {defineConfig, globalIgnores} from 'eslint/config';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  globalIgnores(['**/build/']),
  {
    extends: compat.extends('./node_modules/gts/build/eslint.config.js'),

    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',

      parserOptions: {
        project: false,
      },
    },
  },
]);
