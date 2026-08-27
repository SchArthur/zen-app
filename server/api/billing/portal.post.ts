/**
 * CU-15 — gestion de l'abonnement en cours, chez le prestataire.
 *
 * Changer de formule, mettre à jour un moyen de paiement, récupérer ses
 * factures, résilier : tout cela est délégué au portail client hébergé, pour la
 * même raison que le tunnel de paiement l'est. Réimplémenter la résiliation
 * signifierait manipuler des prorata, des dates d'effet et des avoirs — du
 * domaine de la facturation, pas du bien-être au travail.
 *
 * **Sans cette route, la garde de plan serait à sens unique** : on saurait
 * souscrire et pas partir. Un abonnement dont on ne peut pas sortir depuis
 * l'application est autant un défaut de conformité qu'un défaut de produit.
 *
 * Ce que le portail sait faire remonte ici par les notifications
 * `customer.subscription.*` — c'est ce qui referme la boucle : une résiliation
 * décidée là-bas retire les droits ici, sans que personne n'ait à y penser.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireRole(event, 'HR')

  const subscription = await readCompanySubscription(user.companyId)

  if (!subscription?.stripeCustomerId) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Votre entreprise n\'a pas encore d\'abonnement à gérer.',
      data: { code: 'no_subscription' },
    })
  }

  const { public: { appUrl } } = useRuntimeConfig(event)

  const session = await stripeClient(event).billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl}/tarifs`,
  })

  return { url: session.url }
})
