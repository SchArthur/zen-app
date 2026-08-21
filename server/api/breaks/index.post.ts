/**
 * CU-07 — démarrer une pause.
 *
 * Aucune donnée en entrée : l'heure de début est celle du serveur. La laisser
 * choisir par le navigateur rendrait la durée déclarative, alors qu'elle
 * alimente les vues d'équipe.
 *
 * Une pause déjà en cours vaut refus plutôt que création silencieuse d'une
 * seconde : deux pauses ouvertes en parallèle n'ont pas de sens, et le cas se
 * produit dès qu'un second onglet est resté ouvert. L'écran relit alors l'état
 * du serveur et les deux onglets se rejoignent.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const running = await readRunningBreak(user.id, new Date())

  if (running) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Une pause est déjà en cours.',
      data: { code: 'break_already_running' },
    })
  }

  const current = await prisma.breakSession.create({
    data: { userId: user.id },
    select: { id: true, startedAt: true },
  })

  return { current: { ...current, elapsedSec: 0 } }
})
