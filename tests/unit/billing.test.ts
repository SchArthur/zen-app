import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import {
  periodEndOf,
  planOfSubscription,
  seatsOf,
  toSubscriptionStatus,
} from '../../server/utils/billing'
import { stripeLookupKey } from '../../shared/utils/plans'

/**
 * Abonnement tel que le prestataire le décrit, réduit aux champs lus.
 *
 * Reconstruit à la main plutôt que recopié d'une réponse réelle : une réponse
 * réelle comporte quatre-vingts champs dont on ne lit que quatre, et le test
 * dirait alors « voici un abonnement » là où il doit dire « voici ce dont le
 * code dépend ».
 */
function subscriptionOf(overrides: {
  status?: string
  lookupKey?: string | null
  quantity?: number
  periodEnd?: number | null
  metadataPlan?: string
  items?: unknown[]
} = {}) {
  const {
    status = 'active',
    lookupKey = stripeLookupKey('PREMIUM'),
    quantity = 6,
    periodEnd = 1_790_000_000,
    metadataPlan,
    items,
  } = overrides

  return {
    id: 'sub_123',
    status,
    customer: 'cus_123',
    metadata: metadataPlan ? { plan: metadataPlan } : {},
    items: {
      data: items ?? [{
        quantity,
        current_period_end: periodEnd,
        price: { lookup_key: lookupKey },
      }],
    },
  } as unknown as Stripe.Subscription
}

describe('toSubscriptionStatus', () => {
  it('traduit les statuts qui ouvrent des droits', () => {
    expect(toSubscriptionStatus('active')).toBe('ACTIVE')
    // Une période d'essai est un abonnement en cours : fermer la vue entreprise
    // à qui essaie le produit reviendrait à vendre l'essai sans le livrer.
    expect(toSubscriptionStatus('trialing')).toBe('ACTIVE')
  })

  it('range ensemble les deux stades d\'un prélèvement en échec', () => {
    expect(toSubscriptionStatus('past_due')).toBe('PAST_DUE')
    expect(toSubscriptionStatus('unpaid')).toBe('PAST_DUE')
  })

  it('traite comme résilié un abonnement dont le premier paiement n\'est jamais arrivé', () => {
    expect(toSubscriptionStatus('canceled')).toBe('CANCELED')
    expect(toSubscriptionStatus('incomplete_expired')).toBe('CANCELED')
  })

  it('laisse en attente ce qui n\'a pas abouti et ce qui est suspendu', () => {
    expect(toSubscriptionStatus('incomplete')).toBe('INCOMPLETE')
    expect(toSubscriptionStatus('paused')).toBe('INCOMPLETE')
  })

  /**
   * Le test qui compte. Le SDK type ce statut comme une chaîne **ouverte** : la
   * liste s'allonge au fil des versions de l'interface, et un `switch` que le
   * compilateur croirait exhaustif ne l'est pas. Un statut inconnu doit refuser,
   * jamais ouvrir — on ne sait pas ce qu'il veut dire.
   */
  it('refuse d\'interpréter un statut qu\'il ne connaît pas', () => {
    expect(toSubscriptionStatus('quelque_chose_de_nouveau')).toBe('INCOMPLETE')
    expect(toSubscriptionStatus('')).toBe('INCOMPLETE')
  })
})

describe('periodEndOf', () => {
  /**
   * ⚠️ Le champ a **changé de place** entre deux versions de l'interface : il
   * était sur l'abonnement, il est sur ses lignes. Un code écrit contre
   * l'ancienne compile encore et lit `undefined` — ce qui ne lève rien et se
   * découvre à la première échéance mal calculée. Ce test est le filet.
   */
  it('lit l\'échéance sur la ligne d\'abonnement, pas sur l\'abonnement', () => {
    expect(periodEndOf(subscriptionOf({ periodEnd: 1_790_000_000 })))
      .toEqual(new Date(1_790_000_000 * 1000))
  })

  it('rend null plutôt qu\'une date inventée quand le prestataire n\'en donne pas', () => {
    expect(periodEndOf(subscriptionOf({ periodEnd: null }))).toBeNull()
    expect(periodEndOf(subscriptionOf({ items: [] }))).toBeNull()
  })
})

describe('planOfSubscription', () => {
  it('lit la formule sur le tarif facturé', () => {
    expect(planOfSubscription(subscriptionOf({ lookupKey: stripeLookupKey('STANDARD') }))).toBe('STANDARD')
    expect(planOfSubscription(subscriptionOf({ lookupKey: stripeLookupKey('PREMIUM') }))).toBe('PREMIUM')
  })

  // Les métadonnées disent ce que l'application croyait vendre au clic ; le
  // tarif dit ce qui est facturé. Le repli sert quand le tarif ne parle pas.
  it('retombe sur les métadonnées de la session quand le tarif ne dit rien', () => {
    expect(planOfSubscription(subscriptionOf({ lookupKey: null, metadataPlan: 'STANDARD' }))).toBe('STANDARD')
  })

  it('n\'accepte pas n\'importe quelle métadonnée comme formule', () => {
    expect(planOfSubscription(subscriptionOf({ lookupKey: null, metadataPlan: 'GRATUIT' }))).toBeNull()
  })

  /**
   * Un abonnement facturé sur un tarif que le produit ne vend pas — créé à la
   * main dans la console du prestataire, hérité d'une ancienne grille — n'ouvre
   * aucun droit. Deviner la formule à sa place reviendrait à accorder
   * gratuitement ce qu'on ne sait pas identifier.
   */
  it('rend null sur un tarif étranger à la grille', () => {
    expect(planOfSubscription(subscriptionOf({ lookupKey: 'promo_partenaire_2024' }))).toBeNull()
    expect(planOfSubscription(subscriptionOf({ lookupKey: null }))).toBeNull()
  })
})

describe('seatsOf', () => {
  it('reprend la quantité facturée', () => {
    expect(seatsOf(subscriptionOf({ quantity: 12 }))).toBe(12)
  })

  // Un abonnement à zéro poste ne se vend pas, et une facture à zéro poste ne
  // se lit pas. Le plancher évite les deux.
  it('ne descend jamais sous un poste', () => {
    expect(seatsOf(subscriptionOf({ quantity: 0 }))).toBe(1)
    expect(seatsOf(subscriptionOf({ items: [] }))).toBe(1)
  })
})
