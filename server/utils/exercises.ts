import { dayKey, historySince } from '../../shared/utils/time'
import { exerciseSlugSchema } from './exercise-schemas'
import type { ExercisesQuery } from './exercise-schemas'

/**
 * CU-08 — Consulter le catalogue d'exercices.
 * CU-08.1 — Déclarer un exercice réalisé.
 *
 * Les fonctions pures sont isolées en tête de fichier : elles portent les règles
 * qui décident ce qui compte comme « fait aujourd'hui » et ce qui est un doublon,
 * et elles sont vérifiables par un test unitaire sans Postgres.
 */

/**
 * Profondeur de l'activité rapportée avec le catalogue : quatre semaines.
 *
 * De quoi afficher « déjà fait 3 fois » sans porter tout l'historique du compte
 * dans la réponse. Le tableau de bord (F7) travaillera sur ses propres fenêtres,
 * hebdomadaire et mensuelle ; ce n'est pas la même question.
 */
export const ACTIVITY_WINDOW_DAYS = 28

/**
 * Champs d'un exercice exposés hors du serveur.
 *
 * `isActive` n'en fait pas partie : un exercice retiré du catalogue n'est jamais
 * renvoyé, l'interface n'a donc rien à filtrer ni à afficher. Projection unique,
 * comme `preferenceSelect`, pour qu'aucune route n'en laisse filtrer davantage.
 */
export const exerciseSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  steps: true,
  type: true,
  durationMin: true,
} as const

interface LogRow {
  exerciseId: string
  completedAt: Date
}

interface ExerciseActivity {
  /** Nombre de réalisations sur la fenêtre. */
  count: number
  /** Réalisation la plus récente, toutes journées confondues. */
  lastCompletedAt: Date
  /** Au moins une réalisation dans la journée locale en cours. */
  doneToday: boolean
}

/**
 * Range les réalisations par exercice.
 *
 * `logs` est attendu du plus récent au plus ancien : le premier enregistrement
 * rencontré pour un exercice est donc sa réalisation la plus récente, et il n'y
 * a pas de comparaison de dates à faire.
 */
export function summariseActivity(logs: LogRow[], now: Date) {
  const today = dayKey(now)
  const byExercise = new Map<string, ExerciseActivity>()
  let todayCount = 0

  for (const log of logs) {
    // Journée locale, et non « depuis minuit UTC » : à 1 h du matin à Paris en
    // été, la journée UTC a deux heures de retard sur celle de l'utilisateur.
    const isToday = dayKey(log.completedAt) === today

    if (isToday) todayCount++

    const entry = byExercise.get(log.exerciseId)

    if (entry) {
      entry.count++
      entry.doneToday ||= isToday
    }
    else {
      byExercise.set(log.exerciseId, { count: 1, lastCompletedAt: log.completedAt, doneToday: isToday })
    }
  }

  return { byExercise, todayCount }
}

/**
 * Deux déclarations rapprochées du même exercice sont-elles la même réalisation ?
 *
 * Le point d'entrée de CU-08.1 est un bouton : un double clic, un retour arrière
 * ou un onglet resté ouvert produisent deux appels pour un seul exercice fait.
 * La fenêtre retenue est la durée annoncée de l'exercice — on ne peut pas avoir
 * fait deux fois un exercice de cinq minutes en moins de cinq minutes. Elle est
 * donc courte pour un étirement de deux minutes et large pour une méditation,
 * ce qui est exactement le comportement recherché.
 *
 * Le choix de la déduplication plutôt que du refus est délibéré : ce n'est pas
 * une erreur de l'utilisateur, il n'a aucune raison d'en être averti.
 */
export function isRepeatDeclaration(lastCompletedAt: Date | null, durationMin: number, now: Date) {
  if (!lastCompletedAt) return false

  return now.getTime() - lastCompletedAt.getTime() < durationMin * 60_000
}

/** Clause de filtrage du catalogue, telle que la reçoit Prisma. */
export function exerciseFilter({ type, maxMin }: ExercisesQuery) {
  return {
    isActive: true,
    ...(type ? { type } : {}),
    ...(maxMin ? { durationMin: { lte: maxMin } } : {}),
  }
}

/**
 * Catalogue filtré, trié du plus court au plus long.
 *
 * Le tri par durée et non par titre : on ouvre le catalogue avec un temps
 * disponible en tête, pas un nom d'exercice. Le titre départage à durée égale
 * pour que deux appels successifs rendent le même ordre — sans second critère,
 * Postgres n'a aucune obligation de stabilité.
 */
export function readCatalogue(query: ExercisesQuery) {
  return prisma.exercise.findMany({
    where: exerciseFilter(query),
    orderBy: [{ durationMin: 'asc' }, { title: 'asc' }],
    select: exerciseSelect,
  })
}

/**
 * Un exercice publié, par son identifiant lisible.
 *
 * Renvoie `null` aussi bien pour un identifiant mal formé que pour un exercice
 * inexistant ou retiré : les trois cas doivent produire la même réponse, voir
 * `exerciseSlugSchema`.
 */
export async function readExercise(slug: string | undefined) {
  const parsed = exerciseSlugSchema.safeParse(slug)

  if (!parsed.success) return null

  return await prisma.exercise.findFirst({
    where: { slug: parsed.data, isActive: true },
    select: exerciseSelect,
  })
}

/** Réalisations du collaborateur sur la fenêtre d'activité, rangées par exercice. */
export async function readActivity(userId: string, now: Date) {
  const logs = await prisma.exerciseLog.findMany({
    where: { userId, completedAt: { gte: historySince(ACTIVITY_WINDOW_DAYS, now) } },
    orderBy: { completedAt: 'desc' },
    select: { exerciseId: true, completedAt: true },
  })

  return summariseActivity(logs, now)
}
