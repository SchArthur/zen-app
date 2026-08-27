import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * Deux projets, un par côté de l'application.
 *
 * La grille d'évaluation demande une couverture d'au moins 50 % **front et
 * back**, comptée des deux côtés. Les fondre en une seule suite laisserait le
 * chiffre global masquer un côté sous l'autre : quelques centaines de tests de
 * serveur suffiraient à faire passer une interface non testée.
 *
 * Ils ne diffèrent pas que par leur nom : le premier tourne dans Node, le second
 * dans un DOM, avec le compilateur de composants monofichiers. Un même fichier
 * de test ne peut donc pas appartenir aux deux.
 */

const root = fileURLToPath(new URL('.', import.meta.url))

/** Les alias que Nuxt pose lui-même, et dont le code partagé se sert. */
const alias = {
  '#shared': `${root}shared`,
  '~': `${root}app`,
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'serveur',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
          /**
           * Publie les importations automatiques de Nitro avant que le moindre
           * gestionnaire ne soit importé. Sans ce fichier, `server/api/**` n'est
           * pas chargeable hors de Nuxt — voir son en-tête.
           */
          setupFiles: ['tests/helpers/nitro.ts'],
        },
      },
      {
        plugins: [vue()],
        resolve: { alias },
        test: {
          name: 'navigateur',
          environment: 'happy-dom',
          include: ['tests/components/**/*.test.ts'],
          setupFiles: ['tests/helpers/vue.ts'],
        },
      },
    ],
  },
})
