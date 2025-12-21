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
    plugins: [
      // Drizzle ORM: permite importar arquivos .sql inline
      ['inline-import', { extensions: ['.sql'] }],
    ],
    overrides: [
      {
        test: /node_modules\/@noble/,
        presets: [['@babel/preset-env', { modules: 'commonjs' }]],
      },
    ],
  }
}
