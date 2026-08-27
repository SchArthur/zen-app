import { describe, expect, it } from 'vitest'
import { checkoutConfirmSchema, checkoutRequestSchema } from '../../server/utils/billing-schemas'
import { PLANS } from '../../shared/utils/plans'

describe('checkoutRequestSchema', () => {
  it('accepte chaque formule effectivement proposée', () => {
    for (const offer of PLANS) {
      expect(checkoutRequestSchema.safeParse({ plan: offer.id }).success, offer.id).toBe(true)
    }
  })

  it('refuse une formule qui n\'est pas au catalogue', () => {
    expect(checkoutRequestSchema.safeParse({ plan: 'GRATUIT' }).success).toBe(false)
    expect(checkoutRequestSchema.safeParse({ plan: 'premium' }).success).toBe(false)
    expect(checkoutRequestSchema.safeParse({}).success).toBe(false)
  })

  /**
   * Le contrôle qui tient la règle « rien ne se demande, tout se déduit ». Un
   * nombre de postes, un montant ou un identifiant d'entreprise acceptés en
   * entrée seraient autant de valeurs à vérifier — et un jour mal vérifiées.
   * Ici ils sont simplement ignorés : le schéma ne les reprend pas.
   */
  it('ne laisse entrer ni périmètre, ni quantité, ni montant', () => {
    const parsed = checkoutRequestSchema.parse({
      plan: 'STANDARD',
      companyId: 'cmp_autre',
      seats: 9999,
      pricePerSeat: 0,
    })

    expect(parsed).toEqual({ plan: 'STANDARD' })
  })
})

describe('checkoutConfirmSchema', () => {
  it('accepte un identifiant de session du prestataire', () => {
    expect(checkoutConfirmSchema.safeParse({ session: 'cs_test_a1B2c3D4e5F6g7H8i9' }).success).toBe(true)
  })

  it('refuse ce qui n\'a pas la forme d\'une session', () => {
    for (const session of ['', 'cs_', 'sub_123456789012', 'cs_test_../../etc', 'cs_test_<script>']) {
      expect(checkoutConfirmSchema.safeParse({ session }).success, session).toBe(false)
    }
  })

  // Le contrôle de format ne prouve rien à lui seul — ce qui autorise, c'est la
  // relecture de la session chez le prestataire et la comparaison avec
  // l'entreprise du demandeur. Il évite seulement qu'une valeur fantaisiste
  // parte en appel réseau chez un tiers.
  it('refuse une valeur qui n\'est pas une chaîne', () => {
    expect(checkoutConfirmSchema.safeParse({ session: 42 }).success).toBe(false)
    expect(checkoutConfirmSchema.safeParse({ session: null }).success).toBe(false)
  })
})
