import { planCovers } from '../../shared/utils/plans'
import type { Plan, SubscriptionStatus } from '../../lib/generated/prisma/enums.js'

/**
 * Ce qu'une formule ouvre — la traduction exécutable de la page tarifaire.
 *
 * **Aucune lecture de base ici.** Le module reçoit un chemin et un état
 * d'abonnement, et rend une décision. C'est la même propriété que le moteur de
 * recommandation : une règle de facturation qui ne peut se vérifier qu'avec une
 * base et un compte de test ne se vérifie pas.
 *
 * ⚠️ **La garde qui consomme ces règles est posée à la barrière**
 * (`server/middleware/auth.ts`), et non dans les gestionnaires. Le raisonnement
 * est celui de `PUBLIC_API_ROUTES` et de `assertAccountExists`, à un détail près
 * qui change tout : ici l'oubli coûte de l'argent. Une route facturée ajoutée
 * demain sans sa vérification serait **offerte** sans que personne ne l'ait
 * décidé, et personne ne s'en plaindrait — c'est le genre de défaut qu'aucun
 * utilisateur ne signale.
 */

/**
 * Routes réservées à une formule, et rien d'autre.
 *
 * Cette table est le pendant exécutable du champ `excluded` de
 * `shared/utils/plans.ts` : « Vue consolidée entreprise » et « Export des
 * indicateurs », les deux lignes que la formule Standard annonce ne pas
 * comprendre. Un test tient les deux textes ensemble.
 *
 * **Aucune route n'exige la formule Standard, et c'est une décision.** Le
 * mécanisme la prendrait sans changer d'une ligne — il suffirait d'inscrire un
 * préfixe ici. Deux raisons de ne pas le faire :
 *
 * - le minuteur, les exercices et la déclaration d'humeur servent la
 *   **personne**, pas l'acheteur. Les couper parce qu'une facture n'est pas
 *   réglée punit le collaborateur pour une décision qui n'est pas la sienne, et
 *   sur un produit de santé au travail c'est le contraire de ce qu'on vend ;
 * - la vue entreprise et l'export servent l'acheteur. Les fermer touche
 *   exactement qui décide de payer.
 *
 * L'écart assumé, écrit plutôt que tu : une entreprise sans abonnement dispose
 * aujourd'hui de tout le contenu de la formule Standard. Ce n'est pas un oubli,
 * c'est un choix de produit — inscrit au registre de `architecture-logicielle.md`
 * §9, et à trancher commercialement avant la mise en ligne.
 */
export const ROUTE_PLANS: ReadonlyArray<{ prefix: string, plan: Plan }> = [
  // CU-13 — Consulter les indicateurs de l'entreprise.
  { prefix: '/api/company', plan: 'PREMIUM' },
] as const

/**
 * Formule minimale exigée par une route, ou `null` si elle n'en exige aucune.
 *
 * Le préfixe est comparé segment par segment : `/api/company` couvre
 * `/api/company/export` mais pas une hypothétique `/api/companies`. Une
 * correspondance de chaîne nue ferait entrer dans le périmètre facturé toute
 * route dont le nom commence par le même mot, ce qui est le bon sens à l'envers.
 */
export function requiredPlanFor(path: string): Plan | null {
  const route = path.split('?')[0]!.replace(/\/+$/, '') || '/'

  for (const { prefix, plan } of ROUTE_PLANS) {
    if (route === prefix || route.startsWith(`${prefix}/`)) return plan
  }

  return null
}

/** État d'abonnement tel que la garde a besoin de le connaître. */
export interface SubscriptionState {
  plan: Plan
  status: SubscriptionStatus
}

/**
 * Statuts qui ouvrent les droits. **`ACTIVE` et lui seul.**
 *
 * `PAST_DUE` ne les ouvre pas, et c'est le point le plus discutable de ce
 * module. Un abonnement n'y arrive pas par accident : le prestataire y range
 * ceux dont un prélèvement a **déjà échoué** et qu'il retente pendant une
 * quinzaine de jours. Laisser les droits ouverts sur toute cette durée
 * recréerait, en plus petit, l'écart qu'on vient de fermer — un service rendu
 * sans contrepartie et sans que personne ne l'ait décidé.
 *
 * Le délai de grâce est l'évolution naturelle si l'usage montre que c'est trop
 * raide, et il tient en une ligne ici : il n'y a pas d'autre endroit à changer.
 * On préfère l'ajouter sur un cas réel que le supposer.
 */
const OPENING_STATUSES: readonly SubscriptionStatus[] = ['ACTIVE'] as const

/**
 * L'abonnement de l'entreprise ouvre-t-il ce que la route exige ?
 *
 * `null` — aucun abonnement du tout — vaut refus, comme partout ailleurs dans ce
 * produit : l'absence de décision n'est pas un accord tacite. C'est le même
 * raisonnement que pour le consentement, où la tolérance a été fermée le
 * 25/08/2026.
 */
export function subscriptionOpens(subscription: SubscriptionState | null | undefined, required: Plan) {
  if (!subscription) return false
  if (!OPENING_STATUSES.includes(subscription.status)) return false

  return planCovers(subscription.plan, required)
}

/**
 * Peut-on ouvrir un **nouveau** tunnel de paiement pour cette entreprise ?
 *
 * Non si un abonnement vit déjà chez le prestataire. La raison n'est pas
 * commerciale, elle est comptable : une seconde souscription créerait un second
 * abonnement là-bas, quand la table `Subscription` n'a qu'une ligne par
 * entreprise. La nouvelle référence écraserait l'ancienne, et l'ancienne
 * continuerait de prélever — sans que rien, ici, ne sache encore qu'elle existe.
 * C'est le genre de défaut qu'on découvre par une réclamation.
 *
 * `PAST_DUE` compte comme vivant : le prestataire y relance un prélèvement,
 * l'abonnement n'est pas clos. `INCOMPLETE` et `CANCELED` ne le sont pas — le
 * premier n'a jamais abouti, le second est terminé.
 *
 * Ce que cette règle interdit au passage, et qu'il faut savoir : **changer de
 * formule**. Passer de Standard à Premium n'est pas une nouvelle souscription
 * mais la modification de l'abonnement en cours, avec son calcul de prorata ;
 * c'est au portail client de la conduire (`/api/billing/portal`), pas au tunnel
 * de paiement.
 */
export function canOpenCheckout(subscription: SubscriptionState | null | undefined) {
  if (!subscription) return true

  return subscription.status === 'INCOMPLETE' || subscription.status === 'CANCELED'
}
