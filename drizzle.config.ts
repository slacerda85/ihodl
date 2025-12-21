import type { Config } from 'drizzle-kit'

export default {
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/core/lib/lightning/db/schema.ts',
  out: './src/core/lib/lightning/db/migrations',
} satisfies Config
