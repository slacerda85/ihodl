// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: ['expo', 'plugin:prettier/recommended'],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  rules: {
    'prettier/prettier': [
      'error',
      {
        singleQuote: true,
        trailingComma: 'all',
        arrowParens: 'avoid',
        semi: false,
        printWidth: 100,
        useTabs: false,
        tabWidth: 2,
        endOfLine: 'auto',
      },
    ],
  },
}
