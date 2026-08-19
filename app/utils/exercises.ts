import type { ExerciseType } from '../../lib/generated/prisma/enums.js'

/**
 * Libellés d'affichage des types d'exercice.
 *
 * Même rôle que roleLabels : la base parle en majuscules anglaises, l'écran en
 * français. Le catalogue (J6) et le moteur de recommandation afficheront les
 * mêmes mots que le formulaire de préférences.
 */
export const exerciseTypeLabels: Record<ExerciseType, string> = {
  STRETCHING: 'Étirement',
  BREATHING: 'Respiration',
  MEDITATION: 'Méditation',
}

/** Les types dans l'ordre d'affichage, du plus physique au plus mental. */
export const exerciseTypes = Object.keys(exerciseTypeLabels) as ExerciseType[]
