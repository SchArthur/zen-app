import { describe, expect, it } from 'vitest'
import { toApiError } from '../../app/utils/api-error'

/** Forme d'une réponse d'erreur telle que Nitro l'expose à `$fetch`. */
function fetchError(body: unknown) {
  return { data: body }
}

describe('toApiError', () => {
  it('remonte les messages par champ d\'une erreur de validation', () => {
    const result = toApiError(fetchError({
      statusCode: 422,
      statusMessage: 'Données invalides',
      data: { errors: { password: ['Le mot de passe doit contenir au moins un chiffre.'] } },
    }))

    expect(result.message).toBe('Données invalides')
    expect(result.errors.password).toEqual(['Le mot de passe doit contenir au moins un chiffre.'])
  })

  it('expose le code, sur lequel l\'interface décide plutôt que sur le texte', () => {
    const result = toApiError(fetchError({
      statusMessage: 'Votre adresse n\'est pas encore confirmée.',
      data: { code: 'email_not_verified' },
    }))

    expect(result.code).toBe('email_not_verified')
    expect(result.errors).toEqual({})
  })

  it('se rabat sur `message` quand `statusMessage` manque', () => {
    expect(toApiError(fetchError({ message: 'Trop de tentatives.' })).message)
      .toBe('Trop de tentatives.')
  })

  // Une panne réseau ne produit aucune enveloppe : l'écran doit malgré tout
  // afficher une phrase, jamais une zone vide.
  it('reste lisible face à une erreur sans enveloppe', () => {
    for (const value of [new Error('Failed to fetch'), undefined, null, {}]) {
      expect(toApiError(value).message).toBe('Une erreur est survenue. Réessayez.')
    }
  })
})
