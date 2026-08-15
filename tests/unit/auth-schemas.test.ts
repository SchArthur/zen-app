import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { emailDomain, registerSchema, resendVerificationSchema } from '../../server/utils/auth-schemas'

const valid = {
  email: 'alice.martin@zentime.demo',
  password: 'ZenTime2026!',
  firstName: 'Alice',
  lastName: 'Martin',
  acceptTerms: true,
}

/** Messages d'erreur d'un champ, tels que renvoyés par l'API. */
function errorsFor(input: unknown, field: keyof typeof valid) {
  const result = registerSchema.safeParse(input)
  if (result.success) return []
  return z.flattenError(result.error).fieldErrors[field] ?? []
}

describe('registerSchema', () => {
  it('accepte une inscription complète', () => {
    const result = registerSchema.safeParse(valid)

    expect(result.success).toBe(true)
  })

  it('normalise l\'adresse : espaces retirés, casse abaissée', () => {
    const result = registerSchema.safeParse({ ...valid, email: '  Alice.Martin@ZenTime.Demo  ' })

    expect(result.success).toBe(true)
    expect(result.data?.email).toBe('alice.martin@zentime.demo')
  })

  it('coupe les espaces autour du prénom et du nom', () => {
    const result = registerSchema.safeParse({ ...valid, firstName: ' Alice ', lastName: ' Martin ' })

    expect(result.data?.firstName).toBe('Alice')
    expect(result.data?.lastName).toBe('Martin')
  })

  it('refuse une adresse mal formée', () => {
    expect(errorsFor({ ...valid, email: 'alice.zentime.demo' }, 'email'))
      .toContain('Adresse email invalide.')
  })

  // CU-02, exception E2 : le critère manquant doit être nommé.
  it('nomme le critère de longueur manquant', () => {
    expect(errorsFor({ ...valid, password: 'Zen2026!' }, 'password'))
      .toContain('Le mot de passe doit contenir au moins 12 caractères.')
  })

  it('cumule tous les critères manquants d\'un mot de passe', () => {
    const errors = errorsFor({ ...valid, password: 'motdepasselong' }, 'password')

    expect(errors).toContain('Le mot de passe doit contenir au moins une majuscule.')
    expect(errors).toContain('Le mot de passe doit contenir au moins un chiffre.')
    expect(errors).not.toContain('Le mot de passe doit contenir au moins 12 caractères.')
  })

  it('refuse un mot de passe démesuré, qui alourdirait le hachage sans rien apporter', () => {
    expect(errorsFor({ ...valid, password: `${'A1a'.repeat(50)}` }, 'password'))
      .toContain('Le mot de passe ne doit pas dépasser 128 caractères.')
  })

  it('refuse l\'inscription sans acceptation des conditions', () => {
    expect(errorsFor({ ...valid, acceptTerms: false }, 'acceptTerms'))
      .toContain('Les conditions d\'utilisation doivent être acceptées.')
  })

  it('refuse un corps de requête vide', () => {
    expect(registerSchema.safeParse(undefined).success).toBe(false)
  })
})

describe('resendVerificationSchema', () => {
  it('n\'exige que l\'adresse, normalisée', () => {
    const result = resendVerificationSchema.safeParse({ email: ' Alice@ZenTime.Demo ' })

    expect(result.data?.email).toBe('alice@zentime.demo')
  })
})

describe('emailDomain', () => {
  it('extrait le domaine', () => {
    expect(emailDomain('alice.martin@zentime.demo')).toBe('zentime.demo')
  })

  it('retient la partie suivant le dernier arobase', () => {
    expect(emailDomain('a@b@zentime.demo')).toBe('zentime.demo')
  })
})
