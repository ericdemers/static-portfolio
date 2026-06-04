import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // Architecture boundary (see ARCHITECTURE.md): the reference engine (core/),
  // the talk deck (talks/) and the page shell (pages/) must NOT import from the
  // production editor (sketcher/). The composition root src/App.tsx wires the
  // sketcher pages via lazy() dynamic import and is intentionally outside this
  // zone. Machine-enforces what was previously review-vigilance only.
  {
    files: ['src/core/**/*.{ts,tsx}', 'src/talks/**/*.{ts,tsx}', 'src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/sketcher', '**/sketcher/**'],
              message:
                'Architecture boundary: core/, talks/ and pages/ must not import from sketcher/. See ARCHITECTURE.md.',
            },
          ],
        },
      ],
    },
  },
])
