import { describe, expect, it } from 'vitest'
import {
  ROUTE_PLANS,
  canOpenCheckout,
  requiredPlanFor,
  subscriptionOpens,
} from '../../server/utils/entitlements'
import { PLANS, planCovers } from '../../shared/utils/plans'
import { SubscriptionStatus } from '../../lib/generated/prisma/enums.js'
import type { Plan } from '../../lib/generated/prisma/enums.js'

/** Abonnement d'entreprise réduit à ce dont la garde a besoin. */
function subscription(plan: Plan, status: SubscriptionStatus) {
  return { plan, status }
}

describe('requiredPlanFor', () => {
  it('ferme la vue consolidée de l\'entreprise derrière la formule Premium', () => {
    expect(requiredPlanFor('/api/company')).toBe('PREMIUM')
  })

  it('ferme aussi l\'export, qui est une sous-route de la même vue', () => {
    expect(requiredPlanFor('/api/company/export')).toBe('PREMIUM')
  })

  // Le point le plus facile à rater d'une correspondance par préfixe. Sans
  // comparaison segment par segment, toute route dont le nom commence par le
  // même mot entrerait dans le périmètre facturé.
  it('ne déborde pas sur une route qui commence par les mêmes lettres', () => {
    expect(requiredPlanFor('/api/companies')).toBeNull()
    expect(requiredPlanFor('/api/company-export')).toBeNull()
  })

  it('n\'exige rien des routes du cœur du produit', () => {
    for (const route of ['/api/breaks', '/api/mood/today', '/api/exercises', '/api/dashboard', '/api/stats']) {
      expect(requiredPlanFor(route), route).toBeNull()
    }
  })

  // Sans quoi une entreprise sans abonnement ne pourrait pas en prendre un.
  it('n\'exige rien des routes de souscription elles-mêmes', () => {
    for (const route of ['/api/billing/subscription', '/api/billing/checkout', '/api/billing/webhook', '/api/billing/portal']) {
      expect(requiredPlanFor(route), route).toBeNull()
    }
  })

  it('ignore la chaîne de requête et la barre finale', () => {
    expect(requiredPlanFor('/api/company/export?period=mois')).toBe('PREMIUM')
    expect(requiredPlanFor('/api/company/')).toBe('PREMIUM')
  })
})

describe('subscriptionOpens', () => {
  it('ouvre ce que la formule souscrite couvre', () => {
    expect(subscriptionOpens(subscription('PREMIUM', 'ACTIVE'), 'PREMIUM')).toBe(true)
    expect(subscriptionOpens(subscription('PREMIUM', 'ACTIVE'), 'STANDARD')).toBe(true)
  })

  it('ne fait pas monter en gamme : Standard n\'ouvre pas ce qui est Premium', () => {
    expect(subscriptionOpens(subscription('STANDARD', 'ACTIVE'), 'PREMIUM')).toBe(false)
  })

  // L'absence de décision ne vaut pas accord, ici comme pour le consentement.
  it('refuse une entreprise qui n\'a jamais souscrit', () => {
    expect(subscriptionOpens(null, 'PREMIUM')).toBe(false)
    expect(subscriptionOpens(undefined, 'STANDARD')).toBe(false)
  })

  it('n\'ouvre rien hors du statut actif', () => {
    for (const status of ['PAST_DUE', 'CANCELED', 'INCOMPLETE'] as const) {
      expect(subscriptionOpens(subscription('PREMIUM', status), 'PREMIUM'), status).toBe(false)
    }
  })

  // Ce test échoue si un statut est ajouté au schéma sans qu'on ait décidé s'il
  // ouvre des droits : le tableau ci-dessus ne le couvrirait plus.
  it('se prononce sur chaque statut du schéma', () => {
    for (const status of Object.values(SubscriptionStatus)) {
      expect(typeof subscriptionOpens(subscription('PREMIUM', status), 'PREMIUM'), status).toBe('boolean')
    }

    expect(Object.values(SubscriptionStatus)).toHaveLength(4)
  })
})

describe('canOpenCheckout', () => {
  it('laisse souscrire une entreprise qui n\'a rien', () => {
    expect(canOpenCheckout(null)).toBe(true)
  })

  it('laisse reprendre une souscription abandonnée ou résiliée', () => {
    expect(canOpenCheckout(subscription('STANDARD', 'INCOMPLETE'))).toBe(true)
    expect(canOpenCheckout(subscription('PREMIUM', 'CANCELED'))).toBe(true)
  })

  // Le défaut que cette règle empêche : un second abonnement chez le
  // prestataire, dont la référence écraserait la première — et la première
  // continuerait de prélever sans que rien ici ne sache qu'elle existe.
  it('refuse d\'ouvrir un second tunnel sur un abonnement vivant', () => {
    expect(canOpenCheckout(subscription('STANDARD', 'ACTIVE'))).toBe(false)
    expect(canOpenCheckout(subscription('STANDARD', 'PAST_DUE'))).toBe(false)
  })
})

/**
 * Le point de cette suite : tenir ensemble **ce que la page publique annonce**
 * et **ce que le code applique**. C'est tout l'objet de l'écart 6 de
 * `architecture-logicielle.md` §9, et il se rouvrirait en silence si les deux
 * textes pouvaient diverger sans que rien n'échoue.
 */
describe('les formules annoncées et les routes fermées disent la même chose', () => {
  it('ne fait porter la garde que sur des formules qui existent', () => {
    for (const { plan } of ROUTE_PLANS) {
      expect(PLANS.map(offer => offer.id), plan).toContain(plan)
    }
  })

  it('ferme effectivement quelque chose à toute formule annonçant une exclusion', () => {
    const gated = ROUTE_PLANS.map(route => route.plan)

    for (const offer of PLANS.filter(plan => plan.excluded?.length)) {
      // Une exclusion écrite sans route correspondante serait une promesse
      // commerciale que rien ne tient : la formule accéderait à ce qu'elle
      // annonce ne pas comprendre.
      expect(
        gated.some(required => !planCovers(offer.id, required)),
        `${offer.name} annonce une exclusion que rien ne ferme`,
      ).toBe(true)
    }
  })

  it('n\'exclut rien de la formule la plus complète', () => {
    // Symétrique du précédent : si la formule haute annonçait une exclusion,
    // c'est qu'il manquerait une formule au-dessus pour l'ouvrir.
    const highest = PLANS.find(plan => PLANS.every(other => planCovers(plan.id, other.id)))

    expect(highest?.excluded ?? []).toHaveLength(0)
  })
})
