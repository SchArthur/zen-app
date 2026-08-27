import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

/** Les alias que Nuxt pose lui-même, et dont le code partagé se sert. */
const alias = {
  '#shared': `${root}shared`,
  '~': `${root}app`,
}

export default defineConfig({
  resolve: { alias },

  test: {
    name: 'serveur',
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
    /**
     * Publie les importations automatiques de Nitro avant que le moindre
     * gestionnaire ne soit importé. Sans ce fichier, `server/api/**` n'est pas
     * chargeable hors de Nuxt — voir son en-tête.
     */
    setupFiles: ['tests/helpers/nitro.ts'],
  },
})
