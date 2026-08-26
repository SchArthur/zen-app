/**
 * CU-15 — confirmation au retour du tunnel de paiement.
 *
 * Le prestataire ramène l'utilisateur sur `/tarifs` avec l'identifiant de la
 * session qu'il vient de payer. Cette route relit cette session **chez lui** et
 * en tire le même état que la notification : l'écran affiche donc l'abonnement
 * réel dès le retour, sans attendre.
 *
 * ⚠️ **Ce n'est pas le chemin qui fait foi, et ce n'en est pas un second.** Les
 * deux appellent `applyCheckoutSession`, qui interroge le prestataire et fait un
 * `upsert` : arriver par ici, par la notification, ou par les deux dans
 * n'importe quel ordre écrit les mêmes valeurs. Ce que cette route ajoute est un
 * confort d'affichage — et, en développement, le seul moyen de voir
 * l'abonnement se poser quand aucun tunnel n'est ouvert vers le poste.
 *
 * Ce qu'elle n'est pas : un moyen de s'accorder un abonnement. Rien de ce que
 * l'appelant transmet n'est cru. La session est relue à la source, elle doit
 * être payée, et **elle doit désigner l'entreprise du demandeur** — sans quoi il
 * suffirait de récupérer l'identifiant de session d'un client pour lui prendre
 * son abonnement.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireRole(event, 'HR')
  const { session: sessionId } = await validateBody(event, checkoutConfirmSchema)

  let session

  try {
    session = await stripeClient(event).checkout.sessions.retrieve(sessionId)
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Cette session de paiement est introuvable.',
      data: { code: 'checkout_session_unknown' },
    })
  }

  const companyId = session.client_reference_id || session.metadata?.companyId

  if (companyId !== user.companyId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Cette session de paiement ne concerne pas votre entreprise.',
      data: { code: 'checkout_session_foreign' },
    })
  }

  const subscription = await applyCheckoutSession(event, session)

  // Une session ouverte mais non aboutie n'est pas une erreur : c'est le cas de
  // qui revient sur l'adresse de retour sans avoir payé. L'écran doit pouvoir le
  // dire sans afficher un message d'échec.
  if (!subscription) {
    return { applied: false, subscription: null }
  }

  return {
    applied: true,
    subscription: {
      plan: subscription.plan,
      status: subscription.status,
      seats: subscription.seats,
      currentPeriodEnd: subscription.currentPeriodEnd,
    },
  }
})
