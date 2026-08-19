import { z } from 'zod'
import { ExerciseType } from '../../lib/generated/prisma/enums.js'
import { nameSchema } from './auth-schemas'

/**
 * CU-06 — Gérer son profil et ses préférences.
 *
 * L'adresse email n'est volontairement pas modifiable ici : elle sert
 * d'identifiant de connexion et rattache le compte à son entreprise par son
 * domaine. La changer imposerait de repasser par le double opt-in et pourrait
 * déplacer le compte d'une entreprise à l'autre — c'est un autre cas d'usage,
 * avec ses propres règles.
 */
export const updateProfileSchema = z.object({
  firstName: nameSchema('Prénom'),
  lastName: nameSchema('Nom'),
})

/**
 * Bornes du rappel de pause, reprises telles quelles de la règle de CU-07
 * (« seuil de rappel réglable de 30 à 120 minutes »). Exportées pour que
 * l'écran propose exactement l'intervalle que le serveur accepte.
 */
export const REMINDER_INTERVAL_MIN = 30
export const REMINDER_INTERVAL_MAX = 120

const workStartHourSchema = z
  .int('Heure de début invalide.')
  .min(0, 'L\'heure de début doit être comprise entre 0 h et 23 h.')
  .max(23, 'L\'heure de début doit être comprise entre 0 h et 23 h.')

// Jusqu'à 24 : une journée qui s'achève à minuit se dit « 24 h », pas « 0 h »,
// sans quoi la fin serait antérieure au début.
const workEndHourSchema = z
  .int('Heure de fin invalide.')
  .min(1, 'L\'heure de fin doit être comprise entre 1 h et 24 h.')
  .max(24, 'L\'heure de fin doit être comprise entre 1 h et 24 h.')

const reminderIntervalSchema = z
  .int('Fréquence de rappel invalide.')
  .min(REMINDER_INTERVAL_MIN, `Le rappel doit être espacé d'au moins ${REMINDER_INTERVAL_MIN} minutes.`)
  .max(REMINDER_INTERVAL_MAX, `Le rappel ne peut pas être espacé de plus de ${REMINDER_INTERVAL_MAX} minutes.`)

// Le dédoublonnage est fait ici plutôt qu'en base : Prisma stocke la liste telle
// qu'elle arrive, et un client autre que notre formulaire pourrait envoyer deux
// fois le même type. Le moteur de recommandation (J7) compterait alors ce type
// deux fois.
const favoriteTypesSchema = z
  .array(z.enum(ExerciseType, 'Type d\'exercice inconnu.'), 'Types d\'exercices invalides.')
  .max(Object.keys(ExerciseType).length, 'Types d\'exercices invalides.')
  .transform(types => [...new Set(types)])

export const updatePreferencesSchema = z
  .object({
    workStartHour: workStartHourSchema,
    workEndHour: workEndHourSchema,
    remindersEnabled: z.boolean('Activation des rappels invalide.'),
    reminderIntervalMin: reminderIntervalSchema,
    favoriteTypes: favoriteTypesSchema,
  })
  // Le message est rattaché à l'heure de fin, et non au formulaire entier : c'est
  // le champ que l'utilisateur doit corriger, et `validateBody` renvoie les
  // messages par champ.
  .refine(values => values.workEndHour > values.workStartHour, {
    path: ['workEndHour'],
    message: 'L\'heure de fin doit être postérieure à l\'heure de début.',
  })

export type PreferencesInput = z.infer<typeof updatePreferencesSchema>
