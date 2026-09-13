import { describe, expect, it } from 'vitest'
import { consentDecisionSchema } from '../../server/utils/consent-schemas'

describe('consentDecisionSchema', () => {
  it('accepte une décision sur la seule mesure d\'audience', () => {
    const result = consentDecisionSchema.safeParse({ analytics: false })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ analytics: false })
  })

  it('accepte une décision sur le seul suivi du bien-être', () => {
    expect(consentDecisionSchema.safeParse({ wellbeing: true }).success).toBe(true)
  })

  it('accepte les deux ensemble', () => {
    const result = consentDecisionSchema.safeParse({ analytics: true, wellbeing: false })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ analytics: true, wellbeing: false })
  })

  // Un corps vide n'est pas une décision. L'accepter écrirait au journal des
  // lignes qui ne correspondent à aucun choix.
  it('refuse un corps sans aucune décision', () => {
    expect(consentDecisionSchema.safeParse({}).success).toBe(false)
  })

  // Il n'existe pas d'entre-deux : `null` serait une manière détournée
  // d'effacer une décision plutôt que d'en prendre une.
  it('refuse une valeur qui n\'est pas un booléen', () => {
    expect(consentDecisionSchema.safeParse({ analytics: null }).success).toBe(false)
    expect(consentDecisionSchema.safeParse({ analytics: 'oui' }).success).toBe(false)
    expect(consentDecisionSchema.safeParse({ analytics: 1 }).success).toBe(false)
  })

  // Les conditions d'utilisation s'acceptent à l'inscription, pas ici : elles
  // ne sont pas révocables sans supprimer le compte.
  it('écarte une décision portant sur les conditions d\'utilisation', () => {
    const result = consentDecisionSchema.safeParse({ analytics: true, terms: false })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ analytics: true })
  })
})
