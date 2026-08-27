/**
 * CU-15 — état de l'abonnement de l'entreprise, pour l'écran `/tarifs`.
 *
 * Ce que la réponse ne contient pas est aussi délibéré que ce qu'elle contient :
 * ni identifiant de client, ni identifiant d'abonnement chez le prestataire. Ce
 * sont des références opaques dont l'écran n'a aucun usage — il ne les affiche
 * pas et ne les renvoie jamais — et les sortir du serveur reviendrait à les
 * poser dans le cache du navigateur, dans les traces d'un mandataire et dans
 * les captures d'écran d'une soutenance.
 *
 * `configured` dit si l'environnement sait encaisser. La distinction compte :
 * un environnement sans clés doit annoncer qu'il n'en a pas plutôt que de
 * proposer un bouton qui échoue.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireRole(event, 'HR')

  const subscription = await readCompanySubscription(user.companyId)
  const seats = await countBillableSeats(user.companyId)

  return {
    configured: isBillingConfigured(event),
    /** Postes facturables aujourd'hui : les comptes confirmés de l'entreprise. */
    seats,
    canSubscribe: canOpenCheckout(subscription),
    /** `true` dès qu'il y a une fiche client chez le prestataire à qui ouvrir le portail. */
    canManage: Boolean(subscription?.stripeCustomerId),
    subscription: subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          seats: subscription.seats,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
  }
})
