import type { SubscriptionStatus } from '../../lib/generated/prisma/enums.js'

/**
 * Comment se lit un statut d'abonnement à l'écran (CU-15).
 *
 * Le vocabulaire du prestataire ne sort jamais de l'application : « incomplete »
 * et « past_due » sont des états de sa machine, pas des phrases adressées à
 * quelqu'un. Ce que le responsable RH doit savoir tient en deux choses — son
 * entreprise a-t-elle accès à ce qu'elle a payé, et y a-t-il quelque chose à
 * faire.
 *
 * Le ton reprend `AppAlert`, pour que l'écran ne réinvente pas ses couleurs.
 * Rien n'est en rouge vif : un prélèvement rejeté est un incident de gestion
 * courante, pas une alarme.
 */
export interface SubscriptionDisplay {
  label: string
  /** Ce qu'il y a à faire, ou rien. */
  detail: string
  tone: 'info' | 'success' | 'warning' | 'danger'
}

export const subscriptionDisplays: Record<SubscriptionStatus, SubscriptionDisplay> = {
  ACTIVE: {
    label: 'Abonnement actif',
    detail: 'Toutes les fonctions de votre formule sont ouvertes.',
    tone: 'success',
  },
  PAST_DUE: {
    label: 'Prélèvement en échec',
    detail: 'Le dernier paiement n\'a pas abouti et les fonctions de la formule sont suspendues. Mettez à jour votre moyen de paiement pour les rouvrir.',
    tone: 'warning',
  },
  INCOMPLETE: {
    label: 'Souscription non finalisée',
    detail: 'Le paiement n\'est pas allé à son terme. Vous pouvez reprendre la souscription.',
    tone: 'info',
  },
  CANCELED: {
    label: 'Abonnement résilié',
    detail: 'La formule n\'est plus active. Souscrire à nouveau rouvre les fonctions correspondantes.',
    tone: 'info',
  },
}

/**
 * « 12 septembre 2026 » — l'échéance de la période en cours.
 *
 * Rend une chaîne vide plutôt que « Invalid Date » quand le prestataire n'a pas
 * donné d'échéance : c'est un cas prévu (`periodEndOf` rend `null` quand il ne
 * sait pas), et l'écran doit alors taire l'information au lieu d'en inventer une.
 */
export function formatPeriodEnd(value: string | Date | null | undefined) {
  if (!value) return ''

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date)
}
