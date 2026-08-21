import { APP_TIME_ZONE } from '../../shared/utils/time'

/**
 * CU-07 — Suivre une pause.
 *
 * Tout ce qui se calcule sans base de données est isolé ici : durée d'une pause,
 * découpage de l'historique en journées, objectif quotidien. Ces fonctions sont
 * pures, donc vérifiables par un test unitaire sans Postgres — c'est la partie
 * où une erreur d'une heure passerait inaperçue à l'écran mais fausserait
 * durablement les statistiques.
 */

/**
 * Durée maximale retenue pour une pause.
 *
 * Sert de plafond à l'alternative A2 de CU-07 : une pause oubliée en fin de
 * journée est close d'office à cette valeur. Sans plafond, un minuteur laissé
 * ouvert le vendredi soir compterait tout le week-end et écraserait les moyennes
 * de la personne comme celles de son équipe.
 */
export const MAX_BREAK_DURATION_SEC = 2 * 60 * 60

interface BreakRow {
  id: string
  startedAt: Date
  endedAt: Date | null
  durationSec: number | null
}

interface DayBucket {
  /** Journée locale au format `AAAA-MM-JJ`. */
  date: string
  count: number
  totalSec: number
  sessions: BreakRow[]
}

/** Secondes écoulées depuis `from`, jamais négatives. */
export function elapsedSec(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000))
}

/**
 * Durée d'une pause terminée, bornée par le plafond.
 *
 * La durée est calculée ici et jamais reprise du navigateur : c'est une donnée
 * qui alimente les vues d'équipe, un client pourrait donc avoir intérêt à la
 * gonfler (principe 2 de l'architecture).
 */
export function breakDurationSec(startedAt: Date, endedAt: Date) {
  return Math.min(elapsedSec(startedAt, endedAt), MAX_BREAK_DURATION_SEC)
}

// `formatToParts` plutôt qu'une locale qui produirait déjà « AAAA-MM-JJ » : la
// clé est assemblée explicitement, elle ne dépend pas des données de locale
// embarquées par la plateforme.
const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Journée locale d'un instant, au format `AAAA-MM-JJ`. */
export function dayKey(date: Date) {
  const parts = new Map(dayFormatter.formatToParts(date).map(part => [part.type, part.value]))

  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`
}

/**
 * Journée civile précédant `key`.
 *
 * Arithmétique en UTC sur une date sans heure : retirer 24 heures à un instant
 * sauterait ou répéterait un jour lors des changements d'heure.
 */
function previousDay(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))

  date.setUTCDate(date.getUTCDate() - 1)

  return date.toISOString().slice(0, 10)
}

/**
 * Borne basse de la requête d'historique.
 *
 * Un jour de marge : la fenêtre est ensuite découpée en journées locales, dont
 * les bornes ne coïncident pas avec « il y a N × 24 h ». Les pauses en trop sont
 * écartées au regroupement.
 */
export function historySince(days: number, now: Date) {
  return new Date(now.getTime() - (days + 1) * 86_400_000)
}

/**
 * Range les pauses par journée, de la plus récente à la plus ancienne.
 *
 * Les journées sans aucune pause sont présentes, avec un compte à zéro : c'est
 * l'indicateur que le produit met en avant — la **fréquence** des interruptions,
 * pas leur durée cumulée (F3) — et une journée manquante se lirait comme une
 * absence de données plutôt que comme une absence de pause.
 */
export function groupSessionsByDay(sessions: BreakRow[], days: number, now: Date): DayBucket[] {
  const byDay = new Map<string, BreakRow[]>()

  for (const session of sessions) {
    const key = dayKey(session.startedAt)
    const bucket = byDay.get(key)

    if (bucket) bucket.push(session)
    else byDay.set(key, [session])
  }

  const buckets: DayBucket[] = []
  let key = dayKey(now)

  for (let index = 0; index < days; index++) {
    const daySessions = byDay.get(key) ?? []

    buckets.push({
      date: key,
      count: daySessions.length,
      totalSec: daySessions.reduce((total, session) => total + (session.durationSec ?? 0), 0),
      sessions: daySessions,
    })

    key = previousDay(key)
  }

  return buckets
}

/**
 * Nombre de pauses attendues dans une journée de travail.
 *
 * Déduit des préférences plutôt que fixé une fois pour toutes : l'objectif
 * affiché doit être celui que la personne s'est donné (« me rappeler toutes les
 * 90 minutes »), sinon la barre de progression mesure une règle que personne
 * n'a choisie.
 */
export function dailyBreakGoal(preferences: {
  workStartHour: number
  workEndHour: number
  reminderIntervalMin: number
}) {
  const workMinutes = (preferences.workEndHour - preferences.workStartHour) * 60

  return Math.max(1, Math.round(workMinutes / preferences.reminderIntervalMin))
}

/**
 * Pause en cours du collaborateur, close d'office si elle a dépassé le plafond.
 *
 * Appelée par les trois routes : c'est le seul endroit qui décide s'il y a, oui
 * ou non, une pause en cours. La clôture est faite à la lecture plutôt que par
 * une tâche planifiée — le périmètre exclut les traitements déclenchés par le
 * temps (`cas-utilisation.md`, §3), et une pause oubliée n'a de conséquence
 * qu'au moment où on la relit.
 */
export async function readRunningBreak(userId: string, now: Date) {
  const running = await prisma.breakSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: { id: true, startedAt: true },
  })

  if (!running) return null
  if (elapsedSec(running.startedAt, now) <= MAX_BREAK_DURATION_SEC) return running

  await prisma.breakSession.update({
    where: { id: running.id },
    data: {
      endedAt: new Date(running.startedAt.getTime() + MAX_BREAK_DURATION_SEC * 1000),
      durationSec: MAX_BREAK_DURATION_SEC,
    },
  })

  return null
}
