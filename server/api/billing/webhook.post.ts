import type Stripe from 'stripe'

/**
 * CU-15 — notification de paiement. Fonction F11, tâche 7.4.
 *
 * C'est **le** chemin qui fait foi. Le retour de l'utilisateur sur `/tarifs`
 * n'est qu'une commodité d'affichage : il suppose un navigateur ouvert, une
 * redirection suivie, et un onglet qu'on n'a pas fermé. Rien de tout cela n'est
 * acquis — un paiement validé par l'application bancaire dix minutes plus tard,
 * un renouvellement mensuel, un prélèvement rejeté six mois après, une
 * résiliation depuis le portail : aucun de ces évènements n'a d'écran en face.
 *
 * **La seule route du produit dont l'appelant n'a pas de session.** Elle est
 * donc nommée dans `PUBLIC_API_ROUTES`, et son authentification est ailleurs :
 * une signature du corps exact de la requête, avec un secret partagé, vérifiée
 * avant toute chose. Sans elle, n'importe qui offrirait un abonnement Premium à
 * n'importe quelle entreprise en envoyant un objet JSON bien formé.
 *
 * Trois évènements sont traités, et le reste est acquitté sans être lu :
 *
 * - `checkout.session.completed` — la souscription, seul évènement exigé par le
 *   plan de lot ;
 * - `customer.subscription.updated` — changement de formule, de quantité,
 *   échec de prélèvement, reprise ;
 * - `customer.subscription.deleted` — fin de l'abonnement.
 *
 * Les deux derniers ne sont pas du zèle. Sans eux, la garde de plan saurait
 * ouvrir des droits et jamais les refermer, et une entreprise résiliée
 * garderait sa vue consolidée jusqu'à ce que quelqu'un s'en aperçoive.
 */
export default defineEventHandler(async (event) => {
  const signature = getHeader(event, 'stripe-signature')

  if (!signature) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Notification non signée.',
      data: { code: 'missing_signature' },
    })
  }

  /**
   * Le corps **brut**, octet pour octet.
   *
   * La signature porte sur les octets reçus, pas sur l'objet qu'on en déduit :
   * lire le corps en JSON puis le resérialiser change un espace ou l'ordre d'une
   * clé, et la vérification échoue sans qu'on comprenne pourquoi. C'est le piège
   * classique de cette intégration, et il ne se voit qu'à l'exécution.
   */
  const payload = await readRawBody(event)

  if (!payload) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Notification vide.',
      data: { code: 'empty_payload' },
    })
  }

  /**
   * ⚠️ **Le client et le secret sont résolus hors du `try`, et ce n'est pas un
   * détail de style.**
   *
   * Les deux lèvent un 503 quand l'environnement n'a pas ses clés. À l'intérieur
   * du bloc, ce refus était rattrapé et renvoyé en « Signature invalide » —
   * constaté en l'exécutant, sur un environnement sans clés. Le message
   * désignait alors le seul élément de la chaîne qui n'était pas en cause, et
   * l'on peut y passer des heures : au déploiement, « signature invalide » fait
   * chercher du côté du secret recopié, de la version d'API ou du corps
   * reconstitué, jamais du côté d'une variable absente.
   */
  const stripe = stripeClient(event)
  const secret = webhookSecret(event)

  let notification: Stripe.Event

  try {
    // La variante asynchrone : elle s'accommode des environnements dont la
    // primitive de signature n'est pas synchrone, ce qui est le cas d'une
    // exécution en périphérie. Le comportement est le même sous Node.
    notification = await stripe.webhooks.constructEventAsync(payload, signature, secret)
  }
  catch {
    // Le motif du rejet n'est pas repris dans la réponse : signature invalide,
    // horodatage hors tolérance et secret erroné se distinguent dans nos
    // journaux, pas dans ce que reçoit l'appelant. Les distinguer ici
    // renseignerait qui cherche à en fabriquer une.
    throw createError({
      statusCode: 400,
      statusMessage: 'Signature invalide.',
      data: { code: 'invalid_signature' },
    })
  }

  switch (notification.type) {
    case 'checkout.session.completed': {
      await applyCheckoutSession(event, notification.data.object)
      break
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await applySubscriptionEvent(notification.data.object)
      break
    }

    // Tout le reste est acquitté sans être traité. Le prestataire envoie des
    // dizaines de types d'évènements ; répondre en erreur à ceux qu'on ne
    // traite pas le ferait relancer indéfiniment des notifications dont on n'a
    // que faire, et noierait dans le bruit les échecs qui comptent.
    default:
      break
  }

  // Acquittement. Le corps n'est pas lu par le prestataire — seul le code de
  // statut l'est — mais une réponse vide se confond avec une panne quand on
  // relit la notification dans sa console.
  return { received: true }
})
