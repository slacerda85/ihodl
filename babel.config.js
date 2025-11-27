module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          unstable_transformImportMeta: true,
        },
      ],
    ],
    overrides: [
      {
        test: /node_modules\/@noble/,
        presets: [['@babel/preset-env', { modules: 'commonjs' }]],
      },
    ],
  }
}
