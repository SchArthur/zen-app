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

    /**
     * La couverture est **une condition, pas un rapport**.
     *
     * Les seuils portent sur deux ensembles de fichiers distincts, et
     * `npm run test:coverage` échoue si l'un des deux passe sous la barre des
     * 50 % exigés. Le critère cesse ainsi d'être une capture d'écran produite
     * une fois pour devenir quelque chose qu'une demande de fusion ne peut plus
     * franchir en silence.
     */
    coverage: {
      provider: 'v8',
      // `html` pour la lecture ligne à ligne, `lcov` pour l'analyse statique du
      // lot suivant, `text` pour la console et pour la copie d'écran du dossier.
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',

      /**
       * Ce qui est mesuré est ce que le produit exécute. Les fichiers de
       * configuration, les scripts d'exploitation et le client Prisma engendré
       * sont hors du compte : les inclure ferait varier le taux au gré de
       * fichiers que personne ne teste et que personne ne devrait tester.
       */
      include: ['server/**/*.ts', 'shared/**/*.ts', 'app/**/*.ts', 'app/**/*.vue'],
      exclude: [
        // Instancie le client de base de données au chargement : rien à y tester.
        'server/utils/prisma.ts',
        // Déclarations de types, effacées à la compilation.
        '**/*.d.ts',
        // Image de partage, rendue par le service d'aperçu et non par le navigateur.
        'app/components/OgImage/**',
        // Client Prisma engendré : il apparaît au rapport dès qu'un test le
        // charge, alors qu'il n'est écrit par personne ici.
        'lib/**',
      ],

      thresholds: {
        'server/**': { statements: 50, branches: 50, functions: 50, lines: 50 },
        'shared/**': { statements: 50, branches: 50, functions: 50, lines: 50 },
        'app/**': { statements: 50, branches: 50, functions: 50, lines: 50 },
      },
    },
  },
})
