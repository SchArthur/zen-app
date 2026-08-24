import { dayKeysBack, historySince } from '../../shared/utils/time'

/**
 * CU-10 / CU-11 — l'état du jour : où j'en suis maintenant, et quoi faire ensuite.
 *
 * Une seule route pour un seul écran, comme les autres. Le tableau de bord
 * répond à une question de l'instant — « et là, maintenant ? » — là où
 * `/api/stats` répond à une question de période. Les séparer évite qu'un
 * changement de période recalcule la recommandation, et qu'un rafraîchissement
 * du minuteur relise un mois d'historique.
 *
 * Rien de ce que renvoie cette route ne parle de quelqu'un d'autre : ni moyenne
 * d'équipe, ni classement, ni score composite. F7 l'interdit, et c'est la
 * contrepartie de ce que le produit demande à ses utilisateurs.
 */

/** Fenêtre de la petite série d'humeur affichée sous le tableau de bord. */
const WEEK_DAYS = 7

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const now = new Date()

  const [preferences, running, sessions, checkIn, moodWeek, activity, catalogue] = await Promise.all([
    readPreferences(user.id),
    readRunningBreak(user.id, now),
    prisma.breakSession.findMany({
      where: {
        userId: user.id,
        endedAt: { not: null },
        startedAt: { gte: historySince(WEEK_DAYS, now) },
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true, startedAt: true, endedAt: true, durationSec: true },
    }),
    readTodayCheckIn(user.id, now),
    readCheckInHistory(user.id, WEEK_DAYS, now),
    readActivity(user.id, now),
    readRecommendableExercises(),
  ])

  const days = groupSessionsByDay(sessions, WEEK_DAYS, now)

  // Fin de la dernière pause terminée, prise sur les lignes déjà chargées : la
  // demander à la base coûterait un aller-retour de plus pour une valeur qui est
  // dans le lot. Le maximum est cherché sur `endedAt` et non sur l'ordre de la
  // requête, qui trie par heure de **début** — une pause commencée plus tôt peut
  // s'être terminée plus tard.
  const lastBreakEndedAt = sessions.reduce<Date | null>(
    (latest, session) =>
      session.endedAt && (!latest || session.endedAt > latest) ? session.endedAt : latest,
    null,
  )

  // Un seul état, deux lectures : le moteur de règles et le compteur de temps
  // assis regardent exactement la même chose. Les construire séparément les
  // laisserait diverger — la carte pourrait afficher deux heures d'immobilité
  // pendant que la recommandation, elle, ne la verrait pas.
  const state = {
    now,
    preferences,
    checkIn,
    lastBreakEndedAt,
    breakRunning: Boolean(running),
    activity: activity.byExercise,
    catalogue,
  }

  return {
    breaks: {
      current: running ? { ...running, elapsedSec: elapsedSec(running.startedAt, now) } : null,
      taken: days[0]?.count ?? 0,
      totalSec: days[0]?.totalSec ?? 0,
      goal: dailyBreakGoal(preferences),
      lastEndedAt: lastBreakEndedAt,
    },
    // Le temps assis est calculé par le serveur pour que la carte affiche une
    // valeur dès le premier rendu ; l'écran la fait ensuite avancer avec sa
    // propre horloge, comme le minuteur.
    sitting: sittingState(state),
    mood: {
      today: checkIn,
      // La semaine est **complétée** par le serveur, journées non déclarées
      // comprises : c'est lui qui décide où commence aujourd'hui, et laisser le
      // navigateur reconstruire la fenêtre la ferait diverger au passage de
      // minuit. Une journée non déclarée vaut `null`, jamais zéro (A2 de CU-09).
      week: [...dayKeysBack(WEEK_DAYS, now)].reverse().map((date) => {
        const declared = moodWeek.find(entry => entry.date === date)

        return { date, mood: declared?.mood ?? null, stress: declared?.stress ?? null }
      }),
    },
    exercises: { doneToday: activity.todayCount },
    recommendation: recommend(state),
    preferences,
  }
})
