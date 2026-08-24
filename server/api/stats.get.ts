import { dayKeysBack, historySince } from '../../shared/utils/time'

/**
 * CU-11 — la progression sur la période (F7).
 *
 * La requête remonte **deux fois** la période demandée, en une fois : la moitié
 * récente donne les indicateurs, la moitié ancienne donne le point de
 * comparaison. Deux requêtes séparées liraient les mêmes lignes deux fois pour
 * un résultat identique.
 *
 * La seule comparaison que le produit s'autorise est celle-là : soi-même, à la
 * période précédente. Aucune moyenne d'équipe, aucun classement, aucun indice
 * composite — F7 les exclut nommément, et c'est ce qui distingue un tableau de
 * bord de bien-être d'un tableau de bord de performance.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { period } = validateQuery(event, statsQuerySchema)

  const now = new Date()
  const length = PERIODS[period]
  const span = length * 2

  // Ordre chronologique : les séries se lisent de gauche à droite, comme un
  // calendrier. `dayKeysBack` part, lui, de la journée la plus récente.
  const keys = [...dayKeysBack(span, now)].reverse()

  const [breaks, logs, checkIns] = await Promise.all([
    prisma.breakSession.findMany({
      where: {
        userId: user.id,
        endedAt: { not: null },
        startedAt: { gte: historySince(span, now) },
      },
      select: { startedAt: true, durationSec: true },
    }),
    prisma.exerciseLog.findMany({
      where: { userId: user.id, completedAt: { gte: historySince(span, now) } },
      select: { completedAt: true },
    }),
    readCheckInHistory(user.id, span, now),
  ])

  const { current, previous } = splitPeriods(buildDailyStats(keys, breaks, logs, checkIns), length)

  const totals = summarise(current)
  const before = summarise(previous)

  return {
    period,
    days: length,
    series: current,
    totals,
    // Les tendances sont des **écarts**, pas des pourcentages : sur des effectifs
    // d'une dizaine de pauses, « + 50 % » dit moins que « + 3 » et impressionne
    // davantage. Une tendance à `null` signifie qu'il n'y a rien à comparer, et
    // l'écran doit le dire plutôt que d'afficher zéro.
    trends: {
      breaks: delta(totals.breaks, before.breaks),
      exercises: delta(totals.exercises, before.exercises),
      mood: delta(totals.moodAvg, before.moodAvg),
      stress: delta(totals.stressAvg, before.stressAvg),
    },
    previous: before,
  }
})
