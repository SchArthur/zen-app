import { dayKey, dayKeysBack, historySince } from '../../shared/utils/time'
import { PERIODS, delta } from './stats'
import type { Period } from './stats'

/**
 * CU-12.1 — Vérifier le seuil d'anonymat.
 *
 * Pièce **partagée** par la vue d'équipe (CU-12), la vue entreprise (CU-13) et
 * l'export (CU-14). C'est la traduction en code de la relation `«include»` du
 * diagramme des cas d'utilisation : mutualiser le contrôle interdit qu'une des
 * trois vues l'oublie.
 *
 * Deux principes gouvernent tout ce fichier.
 *
 * **1. Le seuil est vérifié avant le calcul, pas à l'affichage.** Filtrer côté
 * interface laisserait les valeurs individuelles transiter par le réseau, où
 * elles seraient lisibles dans les outils de développement du navigateur. C'est
 * le genre d'écart qui rend une promesse d'anonymat fausse tout en la laissant
 * vraie à l'écran (`cas-utilisation.md`, §5, CU-12).
 *
 * **2. Aucun identifiant ne ressort d'ici.** Les identifiants entrent pour
 * compter des personnes distinctes ; ils ne figurent dans aucun type de sortie.
 */

/**
 * Nombre minimal de personnes ayant déclaré pour qu'un agrégat soit calculé.
 *
 * Cinq, comme l'exige F8. Ce n'est pas un réglage : c'est la traduction
 * opérationnelle de l'engagement de non-intrusion du cahier des charges, et le
 * descendre viderait la promesse de sa substance.
 */
export const ANONYMITY_THRESHOLD = 5

interface ScopedBreak {
  startedAt: Date
  durationSec: number | null
}

interface ScopedLog {
  completedAt: Date
}

interface ScopedCheckIn {
  /** Sert à compter des personnes distinctes. Ne ressort jamais. */
  userId: string
  date: Date
  mood: number
  stress: number
}

export interface AggregateDay {
  date: string
  breaks: number
  exercises: number
  /** Moyenne du jour, `null` si trop peu de déclarants ce jour-là. */
  mood: number | null
  stress: number | null
}

export interface AggregateTotals {
  breaks: number
  breakSec: number
  exercises: number
  moodAvg: number | null
  stressAvg: number | null
  /** Personnes distinctes ayant déclaré au moins une fois sur la période. */
  declarants: number
}

/**
 * Journée civile d'une déclaration.
 *
 * `MoodCheckIn.date` est une colonne `date` stockée à minuit UTC de la journée
 * locale : la clé se lit donc directement sur la partie ISO. La repasser par
 * `dayKey` fonctionnerait aujourd'hui par coïncidence — minuit UTC tombe le même
 * jour à Paris — mais cesserait d'être vrai pour un fuseau à l'ouest de
 * Greenwich. Les pauses et les exercices, eux, sont de vrais horodatages et
 * passent bien par `dayKey`.
 */
function checkInDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

/** Personnes distinctes ayant déclaré sur la période. */
export function countDeclarants(checkIns: ScopedCheckIn[]) {
  return new Set(checkIns.map(checkIn => checkIn.userId)).size
}

function average(values: number[]) {
  if (!values.length) return null

  return values.reduce((total, value) => total + value, 0) / values.length
}

/**
 * Range l'activité du périmètre par journée.
 *
 * Les compteurs de pauses et d'exercices sont des **sommes** : elles ne
 * s'attribuent à personne, et sont rendues telles quelles. Les moyennes d'humeur
 * et de stress, en revanche, sont masquées dès qu'une journée compte moins de
 * déclarants que le seuil.
 *
 * Ce masquage **par journée** va au-delà de la lettre de F8, qui ne parle que du
 * seuil sur la période. Il en respecte l'intention : dans une équipe de six où
 * une seule personne déclare le mardi, la « moyenne d'équipe du mardi » est la
 * valeur de cette personne, et le manager sait qui était là. Une donnée
 * d'article 9 nominative, affichée sous un nom d'agrégat.
 */
export function aggregateDays(
  keys: string[],
  breaks: ScopedBreak[],
  logs: ScopedLog[],
  checkIns: ScopedCheckIn[],
): AggregateDay[] {
  const counters = new Map(keys.map(date => [date, { breaks: 0, exercises: 0 }]))
  const declarations = new Map<string, { moods: number[], stresses: number[], people: Set<string> }>()

  for (const session of breaks) {
    const day = counters.get(dayKey(session.startedAt))

    if (day) day.breaks++
  }

  for (const log of logs) {
    const day = counters.get(dayKey(log.completedAt))

    if (day) day.exercises++
  }

  for (const checkIn of checkIns) {
    const key = checkInDay(checkIn.date)

    if (!counters.has(key)) continue

    const bucket = declarations.get(key)
      ?? { moods: [], stresses: [], people: new Set<string>() }

    bucket.moods.push(checkIn.mood)
    bucket.stresses.push(checkIn.stress)
    bucket.people.add(checkIn.userId)
    declarations.set(key, bucket)
  }

  return keys.map((date) => {
    const counts = counters.get(date)!
    const declared = declarations.get(date)
    const enough = (declared?.people.size ?? 0) >= ANONYMITY_THRESHOLD

    return {
      date,
      breaks: counts.breaks,
      exercises: counts.exercises,
      mood: enough ? average(declared!.moods) : null,
      stress: enough ? average(declared!.stresses) : null,
    }
  })
}

/**
 * Cumuls et moyennes de la période.
 *
 * Les moyennes sont calculées sur les déclarations brutes et non sur les
 * journées masquées : le seuil de période garantit déjà qu'au moins cinq
 * personnes distinctes y ont contribué. Les recalculer à partir des journées
 * visibles écarterait des déclarations réelles et biaiserait le résultat vers
 * les seules journées à forte participation.
 */
export function summariseAggregate(
  breaks: ScopedBreak[],
  logs: ScopedLog[],
  checkIns: ScopedCheckIn[],
): AggregateTotals {
  return {
    breaks: breaks.length,
    breakSec: breaks.reduce((total, session) => total + (session.durationSec ?? 0), 0),
    exercises: logs.length,
    moodAvg: average(checkIns.map(checkIn => checkIn.mood)),
    stressAvg: average(checkIns.map(checkIn => checkIn.stress)),
    declarants: countDeclarants(checkIns),
  }
}

/**
 * Résultat d'une consultation agrégée.
 *
 * Le cas bloqué ne porte **aucun** chiffre de participation : dans une équipe de
 * six, « trois personnes ont déclaré » se combine à ce que le manager sait déjà
 * de ses effectifs. Le seuil et l'effectif suffisent à expliquer la règle, qui
 * est ce que demande l'alternative A1 de CU-12.
 */
export type AggregateResult =
  | { available: false, threshold: number, headcount: number }
  | {
    available: true
    threshold: number
    headcount: number
    /** Série journalière. Nommée comme dans `/api/stats`, pour que les deux
     * réponses se lisent de la même façon — et pour ne pas entrer en collision
     * avec `days`, qui désigne partout ailleurs la longueur de la période. */
    series: AggregateDay[]
    totals: AggregateTotals
    trends: { breaks: number | null, exercises: number | null, mood: number | null, stress: number | null }
  }

/**
 * Agrégats d'un périmètre de personnes, sur une période et la précédente.
 *
 * `userIds` est résolu par l'appelant — l'équipe du manager, ou l'entreprise du
 * responsable RH. C'est là que se joue le cloisonnement : cette fonction agrège
 * ce qu'on lui donne, elle ne décide pas de qui a le droit de voir quoi.
 */
export async function readAggregates(
  userIds: string[],
  period: Period,
  now: Date,
): Promise<AggregateResult> {
  const length = PERIODS[period]
  const span = length * 2
  const headcount = userIds.length

  const blocked = { available: false, threshold: ANONYMITY_THRESHOLD, headcount } as const

  // Un périmètre trop petit est refusé sans même interroger la base : il ne
  // pourra jamais atteindre le seuil, et le dire coûte une requête de moins.
  if (headcount < ANONYMITY_THRESHOLD) return blocked

  const since = historySince(span, now)
  const keys = [...dayKeysBack(span, now)].reverse()
  const window = new Set(keys)

  const [breaks, logs, checkIns] = await Promise.all([
    prisma.breakSession.findMany({
      where: { userId: { in: userIds }, endedAt: { not: null }, startedAt: { gte: since } },
      select: { startedAt: true, durationSec: true },
    }),
    prisma.exerciseLog.findMany({
      where: { userId: { in: userIds }, completedAt: { gte: since } },
      select: { completedAt: true },
    }),
    prisma.moodCheckIn.findMany({
      where: { userId: { in: userIds }, date: { gte: since } },
      select: { userId: true, date: true, mood: true, stress: true },
    }),
  ])

  const current = keys.slice(length)
  const currentWindow = new Set(current)

  const inCurrent = <T>(items: T[], key: (item: T) => string) =>
    items.filter(item => currentWindow.has(key(item)))
  const inPrevious = <T>(items: T[], key: (item: T) => string) =>
    items.filter(item => window.has(key(item)) && !currentWindow.has(key(item)))

  const currentCheckIns = inCurrent(checkIns, checkIn => checkInDay(checkIn.date))

  // **Le contrôle décisif.** Il porte sur la période demandée, avant tout calcul
  // et avant toute écriture dans la réponse : en dessous du seuil, aucun agrégat
  // n'est produit, donc aucun ne peut fuiter.
  if (countDeclarants(currentCheckIns) < ANONYMITY_THRESHOLD) return blocked

  const currentBreaks = inCurrent(breaks, session => dayKey(session.startedAt))
  const currentLogs = inCurrent(logs, log => dayKey(log.completedAt))

  const totals = summariseAggregate(currentBreaks, currentLogs, currentCheckIns)
  const before = summariseAggregate(
    inPrevious(breaks, session => dayKey(session.startedAt)),
    inPrevious(logs, log => dayKey(log.completedAt)),
    inPrevious(checkIns, checkIn => checkInDay(checkIn.date)),
  )

  return {
    available: true,
    threshold: ANONYMITY_THRESHOLD,
    headcount,
    series: aggregateDays(current, currentBreaks, currentLogs, currentCheckIns),
    totals,
    trends: {
      breaks: delta(totals.breaks, before.breaks),
      exercises: delta(totals.exercises, before.exercises),
      mood: delta(totals.moodAvg, before.moodAvg),
      stress: delta(totals.stressAvg, before.stressAvg),
    },
  }
}
