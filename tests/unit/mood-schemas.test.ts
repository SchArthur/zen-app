import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  MOOD_HISTORY_DEFAULT_DAYS,
  MOOD_HISTORY_MAX_DAYS,
  MOOD_SCALE_MAX,
  MOOD_SCALE_MIN,
  moodCheckInSchema,
  moodQuerySchema,
} from '../../server/utils/mood-schemas'

/** Messages d'un champ, tels que renvoyés par l'API. */
function errorsFor(schema: z.ZodType, input: unknown, field: string) {
  const result = schema.safeParse(input)
  if (result.success) return []
  return z.flattenError(result.error).fieldErrors[field] ?? []
}

const outOfScale = (label: string) =>
  `${label} : choisissez un niveau de ${MOOD_SCALE_MIN} à ${MOOD_SCALE_MAX}.`

describe('moodCheckInSchema', () => {
  it('accepte les cinq niveaux des deux échelles', () => {
    for (let level = MOOD_SCALE_MIN; level <= MOOD_SCALE_MAX; level++) {
      expect(moodCheckInSchema.parse({ mood: level, stress: level }))
        .toEqual({ mood: level, stress: level })
    }
  })

  it('refuse un niveau hors échelle', () => {
    expect(errorsFor(moodCheckInSchema, { mood: 0, stress: 3 }, 'mood')).toContain(outOfScale('Humeur'))
    expect(errorsFor(moodCheckInSchema, { mood: 6, stress: 3 }, 'mood')).toContain(outOfScale('Humeur'))
    expect(errorsFor(moodCheckInSchema, { mood: 3, stress: 9 }, 'stress')).toContain(outOfScale('Stress'))
  })

  // Un niveau intermédiaire n'existe pas : l'échelle a cinq crans, pas un
  // curseur continu.
  it('refuse un niveau décimal', () => {
    expect(errorsFor(moodCheckInSchema, { mood: 3.5, stress: 3 }, 'mood')).toContain(outOfScale('Humeur'))
  })

  // F5 parle d'une déclaration, pas de deux : une journée à moitié renseignée
  // devrait ensuite être distinguée d'une journée complète dans les moyennes.
  it('exige les deux échelles ensemble', () => {
    expect(errorsFor(moodCheckInSchema, { mood: 4 }, 'stress')).toContain(outOfScale('Stress'))
    expect(errorsFor(moodCheckInSchema, { stress: 2 }, 'mood')).toContain(outOfScale('Humeur'))
  })

  // Le champ libre a été retiré du modèle à l'ouverture du lot 4 : le laisser
  // traverser la validation le ferait revenir par la porte de derrière.
  it('ignore un champ libre envoyé malgré tout', () => {
    expect(moodCheckInSchema.parse({ mood: 4, stress: 2, note: 'mon manager me harcèle' }))
      .toEqual({ mood: 4, stress: 2 })
  })
})

describe('moodQuerySchema', () => {
  it('retient deux semaines quand la fenêtre n\'est pas précisée', () => {
    expect(moodQuerySchema.parse({})).toEqual({ days: MOOD_HISTORY_DEFAULT_DAYS })
  })

  it('accepte le nombre de jours sous forme de texte', () => {
    expect(moodQuerySchema.parse({ days: '30' })).toEqual({ days: 30 })
  })

  it('accepte les douze mois glissants', () => {
    expect(moodQuerySchema.parse({ days: MOOD_HISTORY_MAX_DAYS })).toEqual({ days: MOOD_HISTORY_MAX_DAYS })
  })

  it('refuse une fenêtre vide ou démesurée', () => {
    const message = `L'historique porte sur 1 à ${MOOD_HISTORY_MAX_DAYS} jours.`

    expect(errorsFor(moodQuerySchema, { days: 0 }, 'days')).toContain(message)
    expect(errorsFor(moodQuerySchema, { days: MOOD_HISTORY_MAX_DAYS + 1 }, 'days')).toContain(message)
  })
})
