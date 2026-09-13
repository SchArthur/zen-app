import { Prisma } from '../../../lib/generated/prisma/client.js'

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
 *
 * L'unicité est garantie par un index partiel de base de données
 * (`BreakSession_userId_open_key`) — pas par une vérification applicative. Un
 * `SELECT` suivi d'un `INSERT` dans deux requêtes séparées laisserait une
 * fenêtre de concurrence : deux onglets pourraient observer l'absence de pause
 * et créer deux sessions simultanément. L'index rejette le second `INSERT` avec
 * une violation de contrainte unique (P2002), que l'on traduit ici en 409.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  try {
    const current = await prisma.breakSession.create({
      data: { userId: user.id },
      select: { id: true, startedAt: true },
    })

    return { current: { ...current, elapsedSec: 0 } }
  }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Une pause est déjà en cours.',
        data: { code: 'break_already_running' },
      })
    }

    throw error
  }
})
