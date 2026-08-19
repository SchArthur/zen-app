/**
 * CU-07 — état complet de l'écran des pauses : minuteur en cours, historique,
 * réglages de rappel.
 *
 * Une seule route pour un seul écran, comme `/api/profile` : le minuteur, le
 * décompte du jour et le rappel s'affichent ensemble et n'ont aucune raison de
 * coûter trois allers-retours.
 *
 * Les préférences sont relues par `readPreferences`, la même fonction que
 * l'écran de profil : le rappel doit se déclencher sur les valeurs réellement
 * enregistrées, y compris pour un compte qui n'a jamais ouvert ses réglages.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { days } = validateQuery(event, breaksQuerySchema)

  const now = new Date()
  const running = await readRunningBreak(user.id, now)

  const sessions = await prisma.breakSession.findMany({
    where: {
      userId: user.id,
      endedAt: { not: null },
      startedAt: { gte: historySince(days, now) },
    },
    orderBy: { startedAt: 'desc' },
    select: { id: true, startedAt: true, endedAt: true, durationSec: true },
  })

  const preferences = await readPreferences(user.id)

  return {
    // L'écoulé est calculé par le serveur : le navigateur prend ensuite le
    // relais avec sa propre horloge, mais le premier affichage ne doit pas
    // dépendre d'une pendule qui retarde.
    current: running ? { ...running, elapsedSec: elapsedSec(running.startedAt, now) } : null,
    days: groupSessionsByDay(sessions, days, now),
    goal: dailyBreakGoal(preferences),
    preferences,
  }
})
