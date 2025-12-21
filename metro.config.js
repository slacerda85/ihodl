const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Suporte a arquivos SQL para Drizzle ORM migrations
config.resolver.sourceExts.push('sql')

module.exports = config
