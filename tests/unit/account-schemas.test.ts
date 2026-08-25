import { describe, expect, it } from 'vitest'
import { deleteAccountSchema } from '../../server/utils/account-schemas'

describe('deleteAccountSchema', () => {
  it('accepte un mot de passe', () => {
    expect(deleteAccountSchema.safeParse({ password: 'ZenTime2026!' }).success).toBe(true)
  })

  // Sans mot de passe, une session ouverte sur un poste non verrouillé — ou une
  // requête déclenchée depuis un autre site — suffirait à effacer un compte.
  it('refuse une suppression sans mot de passe', () => {
    expect(deleteAccountSchema.safeParse({}).success).toBe(false)
    expect(deleteAccountSchema.safeParse({ password: '' }).success).toBe(false)
  })

  // Les règles de robustesse s'appliquent au choix d'un mot de passe, pas à sa
  // saisie : un mot de passe créé sous des règles antérieures doit rester
  // utilisable pour confirmer une suppression.
  it('n\'impose aucune règle de robustesse à la saisie', () => {
    expect(deleteAccountSchema.safeParse({ password: 'court' }).success).toBe(true)
  })

  it('écarte toute autre clé', () => {
    const result = deleteAccountSchema.safeParse({ password: 'ZenTime2026!', userId: 'usr_2' })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ password: 'ZenTime2026!' })
  })
})
