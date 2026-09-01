import { defineConfig, devices } from '@playwright/test'

/**
 * Tests de bout en bout — les trois parcours du plan de tests.
 *
 * Ils ne remplacent pas les suites Vitest, ils prouvent autre chose : que les
 * morceaux **tiennent ensemble**. Les tests de routes doublent la base, ceux
 * d'écrans doublent le réseau ; ici rien n'est doublé — un vrai navigateur, un
 * vrai serveur Nitro, une vraie base PostgreSQL et un vrai serveur SMTP.
 *
 * C'est ce qui rend le premier parcours possible : l'inscription passe par un
 * lien envoyé par courriel, et aucun test unitaire ne peut prouver qu'il arrive.
 *
 * ⚠️ **Ils supposent l'environnement de développement en marche** — `docker
 * compose up -d` pour PostgreSQL et Mailpit, puis `npx prisma db seed`. C'est le
 * prix de ce qu'ils prouvent, et c'est pourquoi ils ne tournent pas dans la même
 * commande que Vitest : `npm test` doit rester exécutable sur un poste qui vient
 * de cloner le dépôt.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',

  // Les parcours écrivent dans la même base : les paralléliser les ferait se
  // marcher dessus — deux pauses ouvertes pour le même compte, notamment.
  fullyParallel: false,
  workers: 1,

  // Un échec de bout en bout vient souvent d'une attente mal placée. Une reprise
  // en intégration continue évite d'en faire un motif de rejet ; en local, aucune
  // — il vaut mieux voir le défaut tout de suite.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    // La trace du premier échec suffit à comprendre : elle rejoue le parcours
    // capture par capture, avec le réseau et la console.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  /**
   * Le serveur est démarré par Playwright s'il n'écoute pas déjà, et laissé en
   * place s'il tourne : on ne coupe pas le serveur de développement de quelqu'un
   * qui lance les tests à côté de son travail.
   */
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
