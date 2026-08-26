import type { Plan } from '../../lib/generated/prisma/enums.js'

/**
 * Les deux formules d'abonnement (F11).
 *
 * Définies ici, dans `shared/`, parce que **deux couches doivent en dire la même
 * chose** : la page publique les affiche, et le tunnel de paiement les facture.
 * Un tarif recopié dans les deux finit par diverger, et l'écart se découvre sur
 * une facture.
 *
 * Module pur, comme tout ce qui vit dans `shared/` : aucune lecture de base,
 * aucun accès au DOM. Depuis `app/`, il se désigne par l'alias `#shared/…` et
 * jamais par un chemin relatif — un chemin relatif passe le lint, les tests et
 * le contrôle de types, et casse l'édition de liens à la compilation.
 *
 * ⚠️ **Les formules ne sont pas encore opposables.** Aucun contrôle de plan
 * n'existe dans le code : un compte rattaché à une entreprise sans abonnement
 * accède aujourd'hui à tout. La différenciation annoncée ci-dessous devient
 * exécutable avec le tunnel de paiement (tâches 7.3 et 7.4). Écart ouvert le
 * 25/08/2026 dans `architecture-logicielle.md` §9.
 */

export interface PlanOffer {
  /** Valeur de l'énumération `Plan` du schéma, qui sert de clé partout. */
  id: Plan
  name: string
  /** Prix mensuel hors taxes, **par collaborateur actif**. */
  pricePerSeat: number
  /** Une phrase : à qui la formule s'adresse. */
  audience: string
  features: string[]
  /** Ce que la formule n'inclut pas — dit ici plutôt que deviné par omission. */
  excluded?: string[]
}

/**
 * Facturation **par collaborateur actif et par mois**, et non par salarié de
 * l'entreprise : l'usage de ZenTime est volontaire (c'est la condition de
 * validité du consentement, `normes-et-conformite.md` §3.3). Facturer les
 * salariés qui ne s'en servent pas donnerait à l'employeur une raison
 * d'insister, et cette raison suffirait à vicier le consentement.
 */
export const BILLING_UNIT = 'par collaborateur actif et par mois'

export const PLANS: PlanOffer[] = [
  {
    id: 'STANDARD',
    name: 'Standard',
    pricePerSeat: 3,
    audience: 'Pour une équipe qui veut installer l\'habitude de la pause.',
    features: [
      'Minuteur de pause, rappels réglables et historique sur douze mois',
      'Catalogue d\'exercices guidés : étirement, respiration, méditation',
      'Déclaration quotidienne d\'humeur et de stress',
      'Suggestions expliquées, sans profilage ni apprentissage automatique',
      'Statistiques personnelles sur la semaine et sur le mois',
      'Climat d\'équipe anonymisé pour le manager, à partir de cinq déclarants',
    ],
    excluded: ['Vue consolidée entreprise', 'Export des indicateurs'],
  },
  {
    id: 'PREMIUM',
    name: 'Premium',
    pricePerSeat: 6,
    audience: 'Pour une entreprise qui doit rendre compte de sa démarche de prévention.',
    features: [
      'Tout ce que comprend la formule Standard',
      'Vue consolidée à l\'échelle de l\'entreprise pour les ressources humaines',
      'Export des indicateurs au format tableur, prêt pour un bilan social',
      'Appui au déploiement et à l\'information des représentants du personnel',
    ],
  },
]

/** Formule mise en avant sur la page publique. */
export const HIGHLIGHTED_PLAN: Plan = 'PREMIUM'

export function findPlan(id: Plan) {
  return PLANS.find(plan => plan.id === id) ?? null
}

/** « 3 € » — hors taxes, sans décimale tant que les prix sont entiers. */
export function formatPrice(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)
}
