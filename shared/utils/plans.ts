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
 * ✅ **Les formules sont opposables depuis le 26/08/2026.** Ce qui est écrit ici
 * est appliqué par `server/utils/entitlements.ts`, à la barrière de l'API :
 * `excluded` n'est plus une phrase commerciale mais la liste de ce qu'un refus
 * ferme réellement. Écart 6 de `architecture-logicielle.md` §9, clos.
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

/**
 * Ordre de couverture des formules : Premium contient Standard.
 *
 * Écrit à la main plutôt que déduit de l'ordre de `PLANS`, qui est un ordre
 * **d'affichage**. Les deux coïncident aujourd'hui, et c'est précisément le
 * piège : réordonner les cartes de la page publique pour mettre Standard en
 * avant redistribuerait les droits sans que personne ne l'ait demandé.
 *
 * Les valeurs ne servent qu'à se comparer entre elles ; leur écart n'a pas de
 * sens. Un test vérifie que chaque formule du schéma y figure — sans quoi une
 * troisième formule ajoutée demain vaudrait `undefined`, et toute comparaison
 * la concernant serait fausse dans les deux sens.
 */
const PLAN_RANK: Record<Plan, number> = {
  STANDARD: 1,
  PREMIUM: 2,
}

/** La formule `held` ouvre-t-elle ce que `required` exige ? */
export function planCovers(held: Plan, required: Plan) {
  return PLAN_RANK[held] >= PLAN_RANK[required]
}

/**
 * Clé de recherche du tarif chez le prestataire de paiement.
 *
 * C'est **elle** qui relie une formule d'ici à un tarif de là-bas, et non un
 * identifiant `price_…` recopié dans une variable d'environnement. La différence
 * n'est pas cosmétique : un identifiant de tarif se recopie à la main, donc se
 * trompe de compte, d'environnement ou de montant, et l'erreur ne se voit que
 * sur une facture. Une clé de recherche se déduit de la formule — il n'y a rien
 * à recopier, et rien à tenir à jour dans deux endroits.
 *
 * Les tarifs sont immuables chez le prestataire : changer un prix crée un
 * nouveau tarif et lui **transfère** la clé (voir `scripts/stripe-sync.ts`).
 * La clé, elle, ne bouge jamais : elle désigne « le prix courant de la formule
 * Standard », pas « trois euros ».
 */
export function stripeLookupKey(plan: Plan) {
  return `zentime_${plan.toLowerCase()}_monthly`
}

/** Formule correspondant à une clé de recherche, ou `null` si elle n'est pas des nôtres. */
export function planFromLookupKey(key: string | null | undefined) {
  if (!key) return null

  return PLANS.find(plan => stripeLookupKey(plan.id) === key)?.id ?? null
}

/**
 * Montant en centimes, unité dans laquelle le prestataire raisonne.
 *
 * `Math.round` et non une multiplication nue : `4.2 * 100` vaut 420.00000000000006
 * en virgule flottante, et un tarif créé à 420,00000000000006 centimes est
 * refusé. Les prix sont entiers aujourd'hui ; ils ne le resteront pas forcément.
 */
export function priceInCents(amount: number) {
  return Math.round(amount * 100)
}

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
