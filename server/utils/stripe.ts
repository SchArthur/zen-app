import Stripe from 'stripe'
import { createError } from 'h3'
import type { H3Event } from 'h3'

/**
 * Client du prestataire de paiement (F11, CU-15).
 *
 * Un seul client pour tout le processus : chacun tient son propre agent HTTP et
 * ses connexions persistantes. Même raison que le transport SMTP de `mail.ts` et
 * que le pool Prisma.
 *
 * **Rien n'est instancié au chargement du module.** Les clés vivent dans la
 * configuration d'exécution, et un environnement sans paiement — le poste d'un
 * relecteur qui clone le dépôt, la recette avant qu'on y pose les secrets — doit
 * démarrer normalement. Le refus arrive au moment où l'on essaie de payer, avec
 * un message qui dit lequel des deux secrets manque, et pas au démarrage du
 * serveur avec une trace de pile.
 */
let client: Stripe | undefined

/**
 * ⚠️ **Version de l'interface, épinglée à la main.**
 *
 * Le SDK en embarque une par défaut, qui change à chaque montée de version du
 * paquet : la garder reviendrait à changer de contrat d'API en acceptant une
 * mise à jour de dépendance, c'est-à-dire sans le décider. Épinglée ici, une
 * montée de version du SDK **casse le contrôle de types** — le SDK ne connaît
 * que la sienne — et devient donc une décision explicite, à prendre en lisant le
 * journal des changements déjà inscrit à la veille (`veille-technologique.md`).
 *
 * Ce n'est pas une précaution de principe. Le champ `current_period_end` a
 * quitté l'abonnement pour ses lignes entre deux versions : un code écrit contre
 * l'ancienne compile encore et lit `undefined`. Une échéance d'abonnement à
 * `undefined` ne lève rien, elle se voit à la première facture.
 */
const API_VERSION = '2026-07-29.dahlia' as const

/** Le paiement est-il configuré sur cet environnement ? */
export function isBillingConfigured(event?: H3Event) {
  return Boolean(useRuntimeConfig(event).stripe.secretKey)
}

/**
 * Refus lisible quand l'environnement n'a pas de clé.
 *
 * 503 et non 500 : ce n'est pas une panne, c'est un service qui n'est pas
 * branché ici. La distinction compte pour qui lit les journaux.
 */
function unconfigured(what: string): never {
  throw createError({
    statusCode: 503,
    statusMessage: 'Le paiement en ligne n\'est pas configuré sur cet environnement.',
    data: { code: 'billing_unconfigured', missing: what },
  })
}

export function stripeClient(event?: H3Event): Stripe {
  if (client) return client

  const { secretKey } = useRuntimeConfig(event).stripe

  if (!secretKey) unconfigured('NUXT_STRIPE_SECRET_KEY')

  client = new Stripe(secretKey, {
    apiVersion: API_VERSION,
    // Identifie ZenTime dans les journaux du prestataire. Utile le jour où l'on
    // ouvre un ticket sur une session qui s'est mal passée.
    appInfo: { name: 'ZenTime', url: 'https://zentime.fr' },
  })

  return client
}

/** Secret de signature des notifications. Distinct de la clé d'API, et obligatoire. */
export function webhookSecret(event?: H3Event) {
  const { webhookSecret: secret } = useRuntimeConfig(event).stripe

  if (!secret) unconfigured('NUXT_STRIPE_WEBHOOK_SECRET')

  return secret
}
