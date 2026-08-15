/**
 * CU-02.1 — confirmation d'adresse depuis le lien reçu par courriel.
 *
 * Variante GET : c'est celle que suit un clic dans un client de messagerie.
 * Elle disparaîtra au profit de l'écran `/confirmer-email`, qui appellera la
 * variante POST — un jeton ne devrait pas être consommable par une simple
 * prélecture de lien.
 */
export default defineEventHandler(async (event) => {
  const { token } = validateQuery(event, verificationTokenSchema)

  return emailVerificationResponse(await consumeEmailVerification(token))
})
