/**
 * Déconnexion. Volontairement idempotente : appelée sans session, elle réussit
 * sans rien faire plutôt que de renvoyer une erreur, car son seul effet attendu
 * est qu'il n'y ait plus de session à l'issue de l'appel.
 *
 * Le cookie étant scellé côté client, la déconnexion consiste à le vider et à
 * l'expirer — il n'existe pas de session stockée sur le serveur à supprimer.
 */
export default defineEventHandler(async (event) => {
  await clearUserSession(event)

  return { status: 'ok' }
})
