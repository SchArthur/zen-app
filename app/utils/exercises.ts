import type { ExerciseType } from '../../lib/generated/prisma/enums.js'

/**
 * Libellés d'affichage des types d'exercice.
 *
 * Même rôle que roleLabels : la base parle en majuscules anglaises, l'écran en
 * français. Le catalogue, le formulaire de préférences et le moteur de
 * recommandation (J7) affichent les mêmes mots.
 */
export const exerciseTypeLabels: Record<ExerciseType, string> = {
  STRETCHING: 'Étirement',
  BREATHING: 'Respiration',
  MEDITATION: 'Méditation',
}

/** Les types dans l'ordre d'affichage, du plus physique au plus mental. */
export const exerciseTypes = Object.keys(exerciseTypeLabels) as ExerciseType[]

/**
 * Une teinte par famille, reprise des raccourcis de la maquette : « Bouger » en
 * ciel, « Respirer » en sauge, « Méditer » en lavande.
 *
 * La couleur ne porte jamais l'information seule — chaque carte affiche aussi le
 * libellé du type. Elle sert de repère, pas de code.
 */
export const exerciseTypeTones: Record<ExerciseType, { chip: string, dot: string, halo: string }> = {
  STRETCHING: { chip: 'bg-ciel-100 text-ciel-800', dot: 'bg-ciel-400', halo: 'from-ciel-100 to-halo-sky' },
  BREATHING: { chip: 'bg-accent-soft text-accent-strong', dot: 'bg-accent', halo: 'from-halo-sage to-halo-sky' },
  MEDITATION: { chip: 'bg-lavande-100 text-lavande-700', dot: 'bg-lavande-500', halo: 'from-lavande-100 to-halo-sky' },
}

/** Durée annoncée d'un exercice : « 3 min ». */
export function formatExerciseDuration(minutes: number) {
  return `${minutes} min`
}

/**
 * Paliers du filtre de durée, exprimés comme on choisit un exercice : « j'ai
 * trois minutes devant moi », et non « je veux un exercice de 2 à 4 minutes ».
 *
 * Le filtre est donc un maximum, jamais un intervalle : personne n'écarte un
 * exercice parce qu'il est trop court.
 */
export const durationFilters = [
  { value: 3, label: '3 min ou moins' },
  { value: 5, label: '5 min ou moins' },
] as const
