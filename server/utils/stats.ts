import { dayKey } from '../../shared/utils/time'

/**
 * CU-11 — Consulter son tableau de bord personnel (F7).
 *
 * Agrégations pures : elles reçoivent des lignes, elles rendent des séries. Rien
 * ici ne touche la base, et c'est volontaire — une moyenne calculée sur le mauvais
 * dénominateur ne se voit pas à l'écran, elle se voit dans un test.
 *
 * Deux règles traversent tout le fichier :
 *
 * 1. **Une journée sans déclaration n'est pas une journée à zéro.** L'alternative
 *    A2 de CU-09 l'exige pour l'humeur, et le principe vaut pour tout ce qui est
 *    déclaratif : la moyenne se calcule sur les journées renseignées, jamais sur
 *    la longueur de la période.
 * 2. **Aucun score global, aucune comparaison entre personnes.** F7 l'interdit
 *    explicitement, pour ne pas transformer le bien-être en performance. Il n'y a
 *    donc ici ni indice composite, ni classement, ni référence à autrui — la
 *    seule comparaison possible est celle d'une personne avec sa propre période
 *    précédente.
 */

/** Les deux périodes sélectionnables de F7, en journées civiles. */
export const PERIODS = { semaine: 7, mois: 30 } as const

export type Period = keyof typeof PERIODS

interface BreakRow {
  startedAt: Date
  durationSec: number | null
}

interface LogRow {
  completedAt: Date
}

interface CheckInRow {
  /** Journée civile `AAAA-MM-JJ`, telle que la rend `readCheckInHistory`. */
  date: string
  mood: number
  stress: number
}

export interface DayStat {
  date: string
  breaks: number
  breakSec: number
  exercises: number
  /** `null` quand la journée n'a pas été déclarée — et non 0. */
  mood: number | null
  stress: number | null
}

export interface Totals {
  breaks: number
  breakSec: number
  exercises: number
  /** Moyenne sur les seules journées déclarées, `null` s'il n'y en a aucune. */
  moodAvg: number | null
  stressAvg: number | null
  /** Journées effectivement déclarées, qui portent le dénominateur des moyennes. */
  declaredDays: number
  /** Journées comptant au moins une pause. */
  activeDays: number
}

/**
 * Range pauses, exercices et déclarations dans les journées demandées.
 *
 * `keys` donne à la fois la fenêtre et l'ordre : les journées sans aucune
 * activité y figurent avec des compteurs à zéro et des déclarations à `null`.
 * Les enregistrements hors fenêtre sont ignorés — c'est ce qui permet aux
 * requêtes de remonter un jour plus loin par sécurité sans fausser le résultat.
 */
export function buildDailyStats(
  keys: string[],
  breaks: BreakRow[],
  logs: LogRow[],
  checkIns: CheckInRow[],
): DayStat[] {
  const stats = new Map<string, DayStat>(
    keys.map(date => [date, { date, breaks: 0, breakSec: 0, exercises: 0, mood: null, stress: null }]),
  )

  for (const session of breaks) {
    const day = stats.get(dayKey(session.startedAt))

    if (!day) continue

    day.breaks++
    day.breakSec += session.durationSec ?? 0
  }

  for (const log of logs) {
    const day = stats.get(dayKey(log.completedAt))

    if (!day) continue

    day.exercises++
  }

  for (const checkIn of checkIns) {
    const day = stats.get(checkIn.date)

    if (!day) continue

    day.mood = checkIn.mood
    day.stress = checkIn.stress
  }

  return keys.map(date => stats.get(date)!)
}

/** Moyenne des valeurs renseignées, `null` s'il n'y en a aucune. */
function average(values: (number | null)[]) {
  const declared = values.filter((value): value is number => value !== null)

  if (!declared.length) return null

  return declared.reduce((total, value) => total + value, 0) / declared.length
}

/** Cumuls et moyennes d'une série de journées. */
export function summarise(days: DayStat[]): Totals {
  const moods = days.map(day => day.mood)

  return {
    breaks: days.reduce((total, day) => total + day.breaks, 0),
    breakSec: days.reduce((total, day) => total + day.breakSec, 0),
    exercises: days.reduce((total, day) => total + day.exercises, 0),
    moodAvg: average(moods),
    stressAvg: average(days.map(day => day.stress)),
    declaredDays: moods.filter(mood => mood !== null).length,
    activeDays: days.filter(day => day.breaks > 0).length,
  }
}

/**
 * Écart entre la période et la précédente.
 *
 * `null` dès qu'un des deux termes manque : sans point de comparaison, il n'y a
 * pas de tendance, et afficher « + 100 % » face à une période vide serait un
 * chiffre inventé. C'est la seule comparaison que le produit s'autorise, et elle
 * porte sur soi-même (F7).
 */
export function delta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null

  return current - previous
}

/**
 * Découpe une série de `2 × n` journées en période courante et précédente.
 *
 * Les deux fenêtres viennent de la même requête : demander deux fois la base
 * pour comparer une semaine à la précédente coûterait un aller-retour de plus
 * pour exactement les mêmes lignes.
 */
export function splitPeriods(days: DayStat[], length: number) {
  return {
    current: days.slice(-length),
    previous: days.slice(0, days.length - length),
  }
}
