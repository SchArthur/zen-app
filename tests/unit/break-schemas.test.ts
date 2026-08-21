import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { HISTORY_DEFAULT_DAYS, HISTORY_MAX_DAYS, breaksQuerySchema } from '../../server/utils/break-schemas'

/** Messages d'un champ, tels que renvoyés par l'API. */
function errorsFor(input: unknown, field: string) {
  const result = breaksQuerySchema.safeParse(input)
  if (result.success) return []
  return z.flattenError(result.error).fieldErrors[field] ?? []
}

describe('breaksQuerySchema', () => {
  it('retient une semaine quand la fenêtre n\'est pas précisée', () => {
    expect(breaksQuerySchema.parse({})).toEqual({ days: HISTORY_DEFAULT_DAYS })
  })

  // La chaîne de requête ne transporte que du texte : sans coercition, `?days=30`
  // serait refusé alors qu'il est correct.
  it('accepte le nombre de jours sous forme de texte', () => {
    expect(breaksQuerySchema.parse({ days: '30' })).toEqual({ days: 30 })
  })

  it('accepte les douze mois glissants annoncés', () => {
    expect(breaksQuerySchema.parse({ days: HISTORY_MAX_DAYS })).toEqual({ days: HISTORY_MAX_DAYS })
  })

  it('refuse une fenêtre vide', () => {
    expect(errorsFor({ days: 0 }, 'days')).toContain(`L'historique porte sur 1 à ${HISTORY_MAX_DAYS} jours.`)
  })

  // Sans borne haute, une seule requête pourrait demander à relire toutes les
  // pauses jamais enregistrées.
  it('refuse une fenêtre au-delà de douze mois', () => {
    expect(errorsFor({ days: HISTORY_MAX_DAYS + 1 }, 'days')).toContain(`L'historique porte sur 1 à ${HISTORY_MAX_DAYS} jours.`)
  })

  it('refuse une valeur qui n\'est pas un nombre de jours', () => {
    expect(errorsFor({ days: 'un mois' }, 'days')).toContain('Nombre de jours invalide.')
    expect(errorsFor({ days: '7.5' }, 'days')).toContain('Nombre de jours invalide.')
  })
})
