/**
 * CU-15 — Souscrire un abonnement. Fonction F11, tâche 7.3.
 *
 * Le gestionnaire ne fait qu'**ouvrir** un tunnel de paiement et rendre son
 * adresse. Il n'encaisse rien, ne voit aucune donnée bancaire, et n'écrit rien
 * en base : l'abonnement naît de la notification du prestataire, jamais d'un
 * appel que le navigateur peut passer lui-même. C'est le critère mesurable de
 * F11 — « aucune donnée bancaire transitant par l'application ni stockée par
 * elle » — et c'est aussi ce qui rend la route sans risque à rejouer : deux
 * clics ouvrent deux tunnels, dont un seul sera payé.
 *
 * **Rien ne se demande, tout se déduit** (voir `billing-schemas.ts`). Le corps
 * ne porte que la formule voulue ; l'entreprise vient du compte, les postes se
 * comptent en base, le montant se lit chez le prestataire. Un identifiant
 * d'entreprise ou un prix qui entreraient par la requête seraient à vérifier —
 * et un jour mal vérifiés.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireRole(event, 'HR')
  const { plan } = await validateBody(event, checkoutRequestSchema)

  const existing = await readCompanySubscription(user.companyId)

  if (!canOpenCheckout(existing)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Votre entreprise a déjà un abonnement en cours. Utilisez la gestion de l\'abonnement pour en changer ou le résilier.',
      data: { code: 'already_subscribed' },
    })
  }

  const price = await resolvePrice(event, plan)
  const seats = await countBillableSeats(user.companyId)
  const { public: { appUrl } } = useRuntimeConfig(event)

  const session = await stripeClient(event).checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: price.id, quantity: seats }],

    /**
     * Le lien entre la session et l'entreprise, posé **deux fois**.
     *
     * `client_reference_id` voyage avec la session ; les métadonnées de
     * l'abonnement lui survivent. Sans les secondes, une notification de
     * renouvellement arrivant dans six mois — qui ne parle que de l'abonnement,
     * plus de la session — n'aurait aucun moyen de dire de quelle entreprise il
     * s'agit autrement qu'en retrouvant sa ligne par l'identifiant du
     * prestataire. Ce chemin existe et il est tenu ; celui-ci est plus direct et
     * ne coûte rien.
     */
    client_reference_id: user.companyId,
    metadata: { companyId: user.companyId, plan },
    subscription_data: { metadata: { companyId: user.companyId, plan } },

    // Un client déjà connu n'en devient pas un second : sans cela, chaque
    // souscription créerait une fiche, et l'historique de facturation d'une
    // entreprise se retrouverait éparpillé sur plusieurs.
    ...(existing?.stripeCustomerId
      ? { customer: existing.stripeCustomerId }
      : { customer_email: user.email }),

    // Facture d'entreprise : l'adresse est nécessaire au calcul de la TVA, et le
    // numéro de TVA intracommunautaire à son autoliquidation hors de France. Les
    // prix affichés sont hors taxes (`plans.ts`) ; sans ces deux collectes, ce
    // « hors taxes » resterait une mention sans suite.
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },

    locale: 'fr',

    // Le paramètre est remplacé par le prestataire au moment de la redirection.
    // Il permet à `/tarifs` de confirmer le paiement sans attendre la
    // notification — utile quand elle tarde, indispensable en développement où
    // elle n'arrive que si un tunnel est ouvert vers le poste.
    success_url: `${appUrl}/tarifs?paiement=succes&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/tarifs?paiement=annule`,
  })

  if (!session.url) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Le tunnel de paiement n\'a pas pu être ouvert. Réessayez dans un instant.',
      data: { code: 'checkout_unavailable' },
    })
  }

  // L'adresse est rendue au navigateur, qui s'y rend lui-même, plutôt que
  // renvoyée en redirection : l'appel vient de `fetch`, et une redirection y
  // serait suivie en arrière-plan — le tunnel s'ouvrirait dans une réponse que
  // personne ne regarde.
  return { url: session.url, plan, seats }
})
