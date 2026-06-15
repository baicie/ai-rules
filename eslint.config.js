import defineConfig from '@antfu/eslint-config'

const DOMGlobals = ['window', 'document']
const NodeGlobals = ['module', 'require']

const banConstEnum = {
  selector: 'TSEnumDeclaration[const=true]',
  message:
    'Please use non-const enums. This project automatically inlines enums.',
}

export default defineConfig(
  {
    rules: {
      'no-debugger': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      'no-restricted-globals': ['error', ...DOMGlobals, ...NodeGlobals],

      'no-restricted-syntax': ['error', banConstEnum],

      // Prettier owns these layout choices. Keeping the stylistic rules enabled
      // makes `pnpm format` and `pnpm lint` fight each other.
      'antfu/if-newline': 'off',
      'style/arrow-parens': 'off',
      'style/brace-style': 'off',
      'style/indent': 'off',
      'style/indent-binary-ops': 'off',
      'style/member-delimiter-style': 'off',
      'style/operator-linebreak': 'off',
      'style/quote-props': 'off',
    },
  },

  // shared, may be used in any env
  {
    files: ['packages/shared/**', 'eslint.config.js'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },

  // Node scripts
  {
    files: [
      'rollup*.config.js',
      'scripts/**',
      './*.{js,ts}',
      'packages/*/*.js',
    ],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': ['error', banConstEnum],
      'no-console': 'off',
    },
  },

  {
    files: ['**/package.json'],
    rules: {
      'jsonc/sort-keys': 'off',
    },
  },

  {
    ignores: [
      '**/dist/',
      '**/temp/',
      '**/coverage/',
      '.idea/',
      'explorations/',
      'dts-build/packages',
      'playground',
      '**/*.md',
    ],
  },
)
