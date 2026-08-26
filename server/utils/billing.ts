import { createError } from 'h3'
import type Stripe from 'stripe'
import type { H3Event } from 'h3'
import { findPlan, planFromLookupKey, priceInCents, stripeLookupKey } from '../../shared/utils/plans'
import type { Plan, Role, SubscriptionStatus } from '../../lib/generated/prisma/enums.js'

/**
 * Abonnement d'entreprise (F11, CU-15) : ce que dit le prestataire, traduit dans
 * le vocabulaire du produit, puis rangé en base.
 *
 * La séparation tenue ici : **traduire** est pur et se teste sans rien brancher ;
 * **ranger** touche Prisma. Tout ce que le prestataire nous envoie passe par la
 * première moitié avant d'atteindre la seconde — un statut inconnu, une formule
 * qu'on ne vend pas ou une échéance absente sont des cas normaux d'une interface
 * tierce, pas des accidents.
 */

/* ─── Traduire ce que dit le prestataire ──────────────────────────────────── */

/**
 * Statut du prestataire → statut du produit.
 *
 * Le SDK type ce statut comme une **chaîne ouverte** (`| OtherString`), et il a
 * raison de le faire : la liste s'allonge au fil des versions. D'où le refus par
 * défaut plutôt qu'un `switch` exhaustif que le compilateur croirait complet.
 * Un statut qu'on ne connaît pas ne peut pas ouvrir de droits : on ne sait pas
 * ce qu'il veut dire.
 *
 * - `trialing` vaut `ACTIVE` — une période d'essai est un abonnement en cours,
 *   et fermer la vue entreprise à qui essaie le produit reviendrait à vendre
 *   l'essai sans le livrer ;
 * - `unpaid` rejoint `past_due` : les deux disent qu'un prélèvement a échoué,
 *   à des stades différents de la relance ;
 * - `incomplete_expired` vaut `CANCELED` — le paiement initial n'est jamais
 *   arrivé, l'abonnement n'a donc jamais commencé ;
 * - `paused` reste `INCOMPLETE` : suspendu par l'entreprise, il ne donne rien
 *   et n'est pas non plus résilié.
 */
export function toSubscriptionStatus(status: Stripe.Subscription.Status | string): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'ACTIVE'
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE'
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELED'
    default:
      return 'INCOMPLETE'
  }
}

/**
 * Échéance de la période en cours.
 *
 * ⚠️ **Elle se lit sur la ligne d'abonnement, pas sur l'abonnement.** Le champ
 * `current_period_end` a changé de place entre deux versions de l'interface ; un
 * code écrit contre l'ancienne compile encore et lit `undefined`, ce qui ne lève
 * rien et se découvre à la première échéance mal calculée. C'est la raison pour
 * laquelle la version d'API est épinglée à la main dans `stripe.ts`.
 *
 * Un abonnement sans ligne n'existe pas en pratique ; le repli est là pour que
 * ce cas rende `null` — « on ne sait pas » — plutôt qu'une date inventée.
 */
export function periodEndOf(subscription: Stripe.Subscription): Date | null {
  const seconds = subscription.items.data[0]?.current_period_end

  return typeof seconds === 'number' ? new Date(seconds * 1000) : null
}

/**
 * Formule souscrite, lue sur le **tarif** de la ligne.
 *
 * La clé de recherche est la source qui fait foi : c'est elle qui relie une
 * formule d'ici à un tarif de là-bas (`shared/utils/plans.ts`). Les métadonnées
 * de la session servent de repli — elles disent ce que l'application *croyait*
 * vendre au moment du clic, là où le tarif dit ce qui est *facturé*. Quand les
 * deux divergent, c'est la facture qui a raison.
 */
export function planOfSubscription(subscription: Stripe.Subscription): Plan | null {
  const item = subscription.items.data[0]
  const fromPrice = planFromLookupKey(item?.price?.lookup_key)

  if (fromPrice) return fromPrice

  const fromMetadata = subscription.metadata?.plan

  return fromMetadata === 'STANDARD' || fromMetadata === 'PREMIUM' ? fromMetadata : null
}

/** Nombre de postes facturés. Au moins un : un abonnement à zéro poste ne se vend pas. */
export function seatsOf(subscription: Stripe.Subscription) {
  return Math.max(1, subscription.items.data[0]?.quantity ?? 1)
}

/* ─── Ranger ce qu'on en a compris ────────────────────────────────────────── */

/**
 * Postes facturables d'une entreprise — les comptes **confirmés**.
 *
 * C'est la définition de « collaborateur actif » de la page publique, et elle
 * n'est pas choisie pour la commodité : personne n'est inscrit par son
 * employeur. On crée son compte soi-même, avec son adresse professionnelle, et
 * on confirme son adresse. Un compte confirmé est donc exactement quelqu'un qui
 * a décidé de se servir du produit — et facturer l'effectif plutôt que ces
 * comptes-là donnerait à l'employeur une raison d'insister auprès des autres,
 * ce qui suffirait à vicier le consentement sur lequel repose la collecte
 * (`normes-et-conformite.md` §3.3).
 *
 * Le plancher à un poste est une contrainte du prestataire, pas une règle
 * commerciale : une quantité nulle fait refuser la session de paiement.
 */
export async function countBillableSeats(companyId: string) {
  const seats = await prisma.user.count({
    where: { companyId, emailVerifiedAt: { not: null } },
  })

  return Math.max(1, seats)
}

/** Abonnement de l'entreprise, ou `null` si elle n'a jamais souscrit. */
export async function readCompanySubscription(companyId: string) {
  return await prisma.subscription.findUnique({ where: { companyId } })
}

/**
 * Garde de plan, appelée par la barrière de l'API.
 *
 * Le rattachement est **relu en base** et jamais repris du cookie de session,
 * pour la raison exposée dans `scopes.ts` : la session recopie `companyId` à la
 * connexion, et un droit facturé qui se déciderait sur une valeur figée dans un
 * cookie serait un droit qu'on ne peut plus retirer avant la reconnexion.
 *
 * Une lecture de plus par requête, sur les seules routes facturées — deux
 * aujourd'hui. C'est le même arbitrage que `assertAccountExists`, qui en coûte
 * une sur toutes.
 *
 * **402 et non 403.** Les deux refusent, mais ils ne disent pas la même chose :
 * 403 signifie « pas vous », 402 « pas encore payé ». La distinction n'est pas
 * théorique — c'est elle qui permet à l'écran de proposer la page tarifaire au
 * lieu d'un cul-de-sac, et à qui lit les journaux de ne pas confondre une
 * tentative d'accès indue avec un client dont la carte a expiré.
 *
 * ⚠️ **Le message dépend de qui le reçoit, et c'est délibéré.** Poser la garde à
 * la barrière la place **avant** le contrôle de rôle du gestionnaire : un
 * collaborateur qui sonde une route facturée reçoit donc ce refus-ci plutôt
 * qu'un 403, et apprendrait au passage à quelle formule son entreprise a
 * souscrit. Seul le responsable RH — le seul qui puisse y remédier (CU-15) —
 * reçoit le détail ; aux autres, le refus ne dit que « pas ouvert ». C'est le
 * raisonnement d'`assertRole`, qui ne nomme pas non plus le rôle attendu.
 *
 * Ce que cela ne referme pas : le **code de statut** reste 402 pour tout le
 * monde, si bien que qui inspecte les réponses peut déduire que l'entreprise
 * n'a pas souscrit. Le refermer supposerait de connaître les rôles servis par
 * chaque route à la barrière, donc de recopier ici ce que `requireRole` dit
 * déjà — et un jour d'en recopier une version périmée.
 */
export async function assertPlan(user: { id: string, role: Role }, required: Plan) {
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      company: {
        select: { subscription: { select: { plan: true, status: true } } },
      },
    },
  })

  if (subscriptionOpens(account?.company?.subscription, required)) return

  const canSubscribe = user.role === 'HR'
  const offer = findPlan(required)

  throw createError({
    statusCode: 402,
    statusMessage: canSubscribe
      ? `Cette fonctionnalité est comprise dans la formule ${offer?.name ?? required}, à laquelle votre entreprise n'a pas souscrit.`
      : 'Cette fonctionnalité n\'est pas ouverte à votre entreprise.',
    data: canSubscribe
      ? { code: 'plan_required', requiredPlan: required }
      : { code: 'plan_required' },
  })
}

/**
 * Enregistre l'état d'un abonnement tel que le prestataire le décrit.
 *
 * `upsert` sur `companyId`, qui est unique : **rejouer la même notification
 * réécrit les mêmes valeurs**. C'est ce que demande F11 — « notification de
 * paiement rejouée sans double comptabilisation » — et c'est obtenu par la forme
 * de l'écriture plutôt que par un registre des notifications déjà vues. Un tel
 * registre serait une table de plus, à purger, et qui ne protégerait que ce que
 * cette écriture-ci rend déjà inoffensif : il n'y a rien à incrémenter, rien à
 * additionner, seulement un état à recopier.
 *
 * Ce que cette forme ne protège pas, en revanche, c'est le **désordre** : deux
 * notifications qui se croisent peuvent écrire l'ancienne après la nouvelle.
 * D'où la garde des gestionnaires d'abonnement, qui refusent d'écrire sur une
 * ligne qui ne désigne pas le même abonnement chez le prestataire.
 */
/**
 * Tarif courant d'une formule chez le prestataire, **et vérification qu'il dit
 * la même chose que la page publique**.
 *
 * C'est le contrôle qui rend le mot « source unique » vrai plutôt que pieux.
 * `shared/utils/plans.ts` affiche un prix au visiteur ; le prestataire en
 * facture un autre s'il a été retouché dans sa console, ou si le script de
 * synchronisation n'a pas été rejoué après un changement de grille. Rien, dans
 * une architecture normale, ne rapproche jamais les deux : le premier vit dans
 * un fichier, le second dans un compte tiers, et l'écart se découvre sur une
 * facture — la nôtre, ou celle du client.
 *
 * Ici il se découvre **avant le paiement**, et la session n'est pas ouverte. Un
 * refus est désagréable ; facturer six euros une formule affichée trois l'est
 * davantage, et se répare beaucoup moins bien.
 */
export async function resolvePrice(event: H3Event | undefined, plan: Plan) {
  const offer = findPlan(plan)

  if (!offer) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Cette formule n\'est plus proposée.',
      data: { code: 'unknown_plan' },
    })
  }

  const lookupKey = stripeLookupKey(plan)
  const { data } = await stripeClient(event).prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  })

  const price = data[0]

  if (!price) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Les tarifs ne sont pas encore publiés chez notre prestataire de paiement.',
      data: { code: 'billing_not_provisioned', lookupKey },
    })
  }

  const expected = priceInCents(offer.pricePerSeat)
  const matches = price.unit_amount === expected
    && price.currency === 'eur'
    && price.recurring?.interval === 'month'

  if (!matches) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Le tarif de cette formule ne correspond plus à celui affiché. La souscription est suspendue le temps de la vérification.',
      data: { code: 'price_mismatch', lookupKey },
    })
  }

  return price
}

/**
 * Applique une session de paiement aboutie — le seul endroit où un paiement
 * devient un abonnement en base.
 *
 * Deux chemins y mènent, et c'est voulu qu'ils n'en fassent qu'un :
 *
 * - la **notification** du prestataire (`checkout.session.completed`), qui est
 *   le chemin qui fait foi et le seul qui fonctionne quand personne ne regarde
 *   l'écran — carte rejetée puis réessayée, paiement validé le lendemain par un
 *   dispositif d'authentification bancaire, onglet fermé avant le retour ;
 * - le **retour de l'utilisateur** sur `/tarifs`, qui rejoue le même calcul pour
 *   que l'écran n'annonce pas « en attente » alors que le paiement est passé.
 *
 * Les deux relisent la session **chez le prestataire** plutôt que de croire ce
 * qu'on leur présente, et aboutissent au même `upsert`. Rejouer l'un, l'autre,
 * ou les deux dans n'importe quel ordre écrit les mêmes valeurs.
 *
 * Rend `null` quand la session ne décrit pas un abonnement payé : ce n'est pas
 * une erreur, seulement une notification qui ne nous concerne pas.
 */
export async function applyCheckoutSession(event: H3Event | undefined, session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return null

  // `no_payment_required` est le cas d'un montant nul — un code promotionnel
  // couvrant la première échéance. La session est aboutie malgré tout.
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return null

  const companyId = session.client_reference_id || session.metadata?.companyId

  if (!companyId) return null

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id

  if (!subscriptionId) return null

  // L'abonnement est relu chez le prestataire, et non reconstitué depuis la
  // session : c'est lui qui porte le statut réel, l'échéance et la quantité
  // finalement facturée, qui peut différer de celle demandée au clic.
  const subscription = await stripeClient(event).subscriptions.retrieve(subscriptionId)
  const plan = planOfSubscription(subscription)

  // Un abonnement facturé sur un tarif que le produit ne vend pas — créé à la
  // main dans la console du prestataire, hérité d'une ancienne grille — n'ouvre
  // aucun droit. Deviner la formule à sa place serait accorder gratuitement ce
  // qu'on ne sait pas identifier.
  if (!plan) return null

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null

  return await saveSubscriptionState({
    companyId,
    plan,
    status: toSubscriptionStatus(subscription.status),
    seats: seatsOf(subscription),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: periodEndOf(subscription),
  })
}

/**
 * Répercute le cycle de vie d'un abonnement déjà connu — renouvellement, échec
 * de prélèvement, résiliation.
 *
 * Sans ces notifications-là, la garde de plan n'aurait qu'une moitié de vie :
 * elle saurait ouvrir des droits et jamais les refermer. Une entreprise qui
 * résilie garderait la vue consolidée jusqu'à ce que quelqu'un s'en aperçoive,
 * ce qui est exactement l'écart qu'on vient de fermer, retourné.
 *
 * **La ligne n'est retrouvée que par la référence du prestataire**, jamais par
 * l'entreprise. C'est ce qui protège du désordre : deux notifications qui se
 * croisent concernent le même abonnement ou aucun, et une notification portant
 * sur un abonnement remplacé ne peut pas écraser l'état du nouveau.
 *
 * Rend `null` quand l'abonnement ne nous est pas connu : une notification qui
 * arrive avant la fin du tunnel de paiement est un cas normal, pas une erreur.
 */
export async function applySubscriptionEvent(subscription: Stripe.Subscription) {
  const known = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { companyId: true, plan: true },
  })

  if (!known) return null

  return await saveSubscriptionState({
    companyId: known.companyId,
    // La formule peut changer en cours de route — c'est ce que fait un
    // changement de formule depuis le portail client. On garde la précédente
    // seulement si le tarif facturé n'est plus identifiable.
    plan: planOfSubscription(subscription) ?? known.plan,
    status: toSubscriptionStatus(subscription.status),
    seats: seatsOf(subscription),
    stripeCustomerId: typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: periodEndOf(subscription),
  })
}

export async function saveSubscriptionState(state: {
  companyId: string
  plan: Plan
  status: SubscriptionStatus
  seats: number
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodEnd: Date | null
}) {
  const { companyId, ...fields } = state

  return await prisma.subscription.upsert({
    where: { companyId },
    create: { companyId, ...fields },
    update: fields,
  })
}
