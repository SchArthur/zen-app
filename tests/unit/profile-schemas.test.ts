import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  REMINDER_INTERVAL_MAX,
  REMINDER_INTERVAL_MIN,
  updatePreferencesSchema,
  updateProfileSchema,
} from '../../server/utils/profile-schemas'

const validPreferences = {
  workStartHour: 9,
  workEndHour: 18,
  remindersEnabled: true,
  reminderIntervalMin: 90,
  favoriteTypes: ['BREATHING'],
}

/** Messages d'un champ, tels que renvoyés par l'API. */
function errorsFor(schema: z.ZodType, input: unknown, field: string) {
  const result = schema.safeParse(input)
  if (result.success) return []
  return z.flattenError(result.error).fieldErrors[field] ?? []
}

describe('updateProfileSchema', () => {
  it('accepte une identité complète', () => {
    const result = updateProfileSchema.safeParse({ firstName: 'Alice', lastName: 'Martin' })

    expect(result.success).toBe(true)
  })

  it('coupe les espaces autour du prénom et du nom', () => {
    const result = updateProfileSchema.safeParse({ firstName: ' Alice ', lastName: ' Martin ' })

    expect(result.data?.firstName).toBe('Alice')
    expect(result.data?.lastName).toBe('Martin')
  })

  it('refuse un prénom vidé', () => {
    expect(errorsFor(updateProfileSchema, { firstName: '   ', lastName: 'Martin' }, 'firstName'))
      .toContain('Prénom requis.')
  })

  // Mêmes règles qu'à l'inscription : un nom accepté à la création ne doit pas
  // être refusé à la correction, ni l'inverse.
  it('refuse un nom démesuré, comme à l\'inscription', () => {
    expect(errorsFor(updateProfileSchema, { firstName: 'Alice', lastName: 'M'.repeat(81) }, 'lastName'))
      .toContain('Nom trop long (80 caractères maximum).')
  })

  it('ignore toute tentative de changer d\'adresse ou de rôle par ce formulaire', () => {
    const result = updateProfileSchema.safeParse({
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@ailleurs.fr',
      role: 'HR',
    })

    expect(result.data).toEqual({ firstName: 'Alice', lastName: 'Martin' })
  })
})

describe('updatePreferencesSchema', () => {
  it('accepte un jeu de préférences complet', () => {
    const result = updatePreferencesSchema.safeParse(validPreferences)

    expect(result.success).toBe(true)
  })

  it('accepte une liste de types vide : n\'aimer aucun type est un choix', () => {
    const result = updatePreferencesSchema.safeParse({ ...validPreferences, favoriteTypes: [] })

    expect(result.success).toBe(true)
  })

  it('accepte une journée qui s\'achève à minuit', () => {
    const result = updatePreferencesSchema.safeParse({ ...validPreferences, workEndHour: 24 })

    expect(result.success).toBe(true)
  })

  it('refuse une heure de début hors de la journée', () => {
    expect(errorsFor(updatePreferencesSchema, { ...validPreferences, workStartHour: 24 }, 'workStartHour'))
      .toContain('L\'heure de début doit être comprise entre 0 h et 23 h.')
  })

  it('refuse une heure qui n\'est pas entière', () => {
    expect(errorsFor(updatePreferencesSchema, { ...validPreferences, workStartHour: 9.5 }, 'workStartHour'))
      .toContain('Heure de début invalide.')
  })

  // La contrainte porte sur deux champs : le message doit malgré tout désigner
  // celui qu'il faut corriger, sans quoi le formulaire ne saurait pas où l'afficher.
  it('refuse une fin de journée antérieure au début, en le signalant sur l\'heure de fin', () => {
    expect(errorsFor(updatePreferencesSchema, { ...validPreferences, workStartHour: 18, workEndHour: 9 }, 'workEndHour'))
      .toContain('L\'heure de fin doit être postérieure à l\'heure de début.')
  })

  it('refuse une journée de durée nulle', () => {
    const result = updatePreferencesSchema.safeParse({ ...validPreferences, workStartHour: 9, workEndHour: 9 })

    expect(result.success).toBe(false)
  })

  // Bornes de CU-07 : en deçà, le rappel devient du harcèlement ; au-delà, il
  // ne remplit plus son rôle de prévention.
  it('refuse un rappel plus rapproché que la borne basse', () => {
    expect(errorsFor(updatePreferencesSchema, { ...validPreferences, reminderIntervalMin: REMINDER_INTERVAL_MIN - 1 }, 'reminderIntervalMin'))
      .toContain(`Le rappel doit être espacé d'au moins ${REMINDER_INTERVAL_MIN} minutes.`)
  })

  it('refuse un rappel plus espacé que la borne haute', () => {
    expect(errorsFor(updatePreferencesSchema, { ...validPreferences, reminderIntervalMin: REMINDER_INTERVAL_MAX + 1 }, 'reminderIntervalMin'))
      .toContain(`Le rappel ne peut pas être espacé de plus de ${REMINDER_INTERVAL_MAX} minutes.`)
  })

  it('accepte les deux bornes elles-mêmes', () => {
    for (const reminderIntervalMin of [REMINDER_INTERVAL_MIN, REMINDER_INTERVAL_MAX]) {
      expect(updatePreferencesSchema.safeParse({ ...validPreferences, reminderIntervalMin }).success).toBe(true)
    }
  })

  it('refuse un type d\'exercice inconnu', () => {
    expect(errorsFor(updatePreferencesSchema, { ...validPreferences, favoriteTypes: ['YOGA'] }, 'favoriteTypes'))
      .toContain('Type d\'exercice inconnu.')
  })

  // Le formulaire ne peut pas produire de doublon, un client bricolé si.
  it('dédoublonne les types envoyés deux fois', () => {
    const result = updatePreferencesSchema.safeParse({
      ...validPreferences,
      favoriteTypes: ['BREATHING', 'BREATHING', 'STRETCHING'],
    })

    expect(result.data?.favoriteTypes).toEqual(['BREATHING', 'STRETCHING'])
  })

  it('refuse une liste plus longue que le catalogue de types', () => {
    const result = updatePreferencesSchema.safeParse({
      ...validPreferences,
      favoriteTypes: Array.from({ length: 50 }, () => 'BREATHING'),
    })

    expect(result.success).toBe(false)
  })

  it('refuse un champ manquant plutôt que de lui inventer une valeur', () => {
    const { remindersEnabled: _omitted, ...incomplete } = validPreferences

    expect(errorsFor(updatePreferencesSchema, incomplete, 'remindersEnabled'))
      .toContain('Activation des rappels invalide.')
  })
})
