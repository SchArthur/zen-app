import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  EXERCISE_MAX_DURATION_MIN,
  exerciseSlugSchema,
  exercisesQuerySchema,
} from '../../server/utils/exercise-schemas'

/** Messages d'un champ, tels que renvoyés par l'API. */
function errorsFor(input: unknown, field: string) {
  const result = exercisesQuerySchema.safeParse(input)
  if (result.success) return []
  return z.flattenError(result.error).fieldErrors[field] ?? []
}

describe('exercisesQuerySchema', () => {
  // « Aucun filtre » et « filtre à la valeur maximale » ne sont pas la même
  // demande : seul le premier doit produire une requête sans clause `where`.
  it('n\'invente aucun filtre par défaut', () => {
    expect(exercisesQuerySchema.parse({})).toEqual({ type: undefined, maxMin: undefined })
  })

  it('accepte les trois familles du catalogue', () => {
    expect(exercisesQuerySchema.parse({ type: 'BREATHING' }).type).toBe('BREATHING')
    expect(exercisesQuerySchema.parse({ type: 'STRETCHING' }).type).toBe('STRETCHING')
    expect(exercisesQuerySchema.parse({ type: 'MEDITATION' }).type).toBe('MEDITATION')
  })

  it('refuse une famille inventée', () => {
    expect(errorsFor({ type: 'YOGA' }, 'type')).toContain('Type d\'exercice inconnu.')
  })

  // La chaîne de requête ne transporte que du texte : sans coercition, `?maxMin=5`
  // serait refusé alors qu'il est correct.
  it('accepte la durée sous forme de texte', () => {
    expect(exercisesQuerySchema.parse({ maxMin: '5' }).maxMin).toBe(5)
  })

  it('cumule les deux filtres', () => {
    expect(exercisesQuerySchema.parse({ type: 'MEDITATION', maxMin: '3' }))
      .toEqual({ type: 'MEDITATION', maxMin: 3 })
  })

  it('refuse une durée nulle ou négative', () => {
    const message = `La durée doit être comprise entre 1 et ${EXERCISE_MAX_DURATION_MIN} minutes.`

    expect(errorsFor({ maxMin: 0 }, 'maxMin')).toContain(message)
    expect(errorsFor({ maxMin: -5 }, 'maxMin')).toContain(message)
  })

  // Sans borne haute, `?maxMin=1e12` traverserait la validation.
  it('refuse une durée hors barème', () => {
    expect(errorsFor({ maxMin: EXERCISE_MAX_DURATION_MIN + 1 }, 'maxMin'))
      .toContain(`La durée doit être comprise entre 1 et ${EXERCISE_MAX_DURATION_MIN} minutes.`)
  })

  it('refuse une durée qui n\'est pas un nombre entier de minutes', () => {
    expect(errorsFor({ maxMin: 'court' }, 'maxMin')).toContain('Durée invalide.')
    expect(errorsFor({ maxMin: '2.5' }, 'maxMin')).toContain('Durée invalide.')
  })
})

describe('exerciseSlugSchema', () => {
  it('accepte les identifiants du catalogue', () => {
    expect(exerciseSlugSchema.safeParse('nuque-douce').success).toBe(true)
    expect(exerciseSlugSchema.safeParse('souffle-4-7-8').success).toBe(true)
    expect(exerciseSlugSchema.safeParse('ancrage-3-minutes').success).toBe(true)
  })

  // Le contrôle sert à écarter d'emblée ce qui ne peut pas être un identifiant :
  // son échec est traité comme un exercice introuvable, jamais comme une donnée
  // invalide (voir `readExercise`).
  it('refuse tout ce qui n\'a pas la forme d\'un identifiant', () => {
    expect(exerciseSlugSchema.safeParse('../../etc/passwd').success).toBe(false)
    expect(exerciseSlugSchema.safeParse('Nuque-Douce').success).toBe(false)
    expect(exerciseSlugSchema.safeParse('nuque_douce').success).toBe(false)
    expect(exerciseSlugSchema.safeParse('nuque--douce').success).toBe(false)
    expect(exerciseSlugSchema.safeParse('-nuque').success).toBe(false)
    expect(exerciseSlugSchema.safeParse('nuque-').success).toBe(false)
    expect(exerciseSlugSchema.safeParse('').success).toBe(false)
    expect(exerciseSlugSchema.safeParse('a'.repeat(65)).success).toBe(false)
  })
})
