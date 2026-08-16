/**
 * CU-02.1 — confirmation d'adresse, appelée par l'écran `/confirmer-email`.
 *
 * Le jeton est transmis dans le corps de la requête : il n'apparaît alors ni
 * dans les journaux du serveur, ni dans l'en-tête `Referer` des requêtes
 * suivantes, contrairement à un paramètre d'URL.
 */
export default defineEventHandler(async (event) => {
  const { token } = await validateBody(event, verificationTokenSchema)

  return emailVerificationResponse(await consumeEmailVerification(token))
})
