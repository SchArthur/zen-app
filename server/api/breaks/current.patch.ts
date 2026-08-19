/**
 * CU-07 — arrêter la pause en cours.
 *
 * La pause en cours est une ressource unique par collaborateur : son
 * identifiant n'est pas dans l'URL, le serveur sait laquelle est ouverte. Cela
 * retire du même coup la question de savoir si l'on a le droit d'arrêter la
 * pause de quelqu'un d'autre — il n'y a pas d'identifiant à deviner.
 *
 * PATCH et non DELETE : la pause n'est pas supprimée, elle est terminée.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const now = new Date()
  const running = await readRunningBreak(user.id, now)

  // Y compris quand `readRunningBreak` vient de clore une pause oubliée : la
  // durée est alors celle du plafond, et l'écran l'apprend en relisant.
  if (!running) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Aucune pause n\'est en cours.',
      data: { code: 'no_break_running' },
    })
  }

  const session = await prisma.breakSession.update({
    where: { id: running.id },
    data: { endedAt: now, durationSec: breakDurationSec(running.startedAt, now) },
    select: { id: true, startedAt: true, endedAt: true, durationSec: true },
  })

  return { session }
})
