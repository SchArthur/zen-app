import { beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
import { expectApiError, prismaMock, runtimeConfig, signIn, testEvent } from '../helpers/nitro'

import checkout from '../../server/api/billing/checkout.post'
import portal from '../../server/api/billing/portal.post'
import subscriptionState from '../../server/api/billing/subscription.get'
import confirm from '../../server/api/billing/confirm.post'
import webhook from '../../server/api/billing/webhook.post'

/**
 * CU-15 — Souscrire un abonnement (F11).
 *
 * Le fil de ce fichier est le critère mesurable de F11 : **aucune donnée
 * bancaire ne transite par l'application ni n'y est stockée**. Il s'ensuit que
 * rien de ce que l'appelant transmet sur un paiement n'est cru — ni le prix, ni
 * l'entreprise, ni le fait que le paiement ait eu lieu. Tout est relu chez le
 * prestataire, et les tests vérifient précisément cela.
 *
 * Le client du prestataire est remplacé par un double : ce qui est testé est ce
 * que la route lui demande et ce qu'elle fait de sa réponse, pas le SDK.
 */

const HR = { id: 'usr_hr', role: 'HR' as const, companyId: 'cmp_1', email: 'dir@atelier-voisin.fr' }

/** Un tarif conforme à la grille publique : 6 € par poste et par mois, en euros. */
const PREMIUM_PRICE = {
  id: 'price_premium',
  unit_amount: 600,
  currency: 'eur',
  recurring: { interval: 'month' },
}

const stripe = {
  prices: { list: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn() },
  webhooks: { constructEventAsync: vi.fn() },
}

beforeEach(() => {
  for (const group of Object.values(stripe)) {
    for (const entry of Object.values(group)) {
      if (typeof entry === 'function') (entry as ReturnType<typeof vi.fn>).mockReset()
      else for (const method of Object.values(entry)) (method as ReturnType<typeof vi.fn>).mockReset()
    }
  }

  runtimeConfig.stripe.secretKey = 'sk_test_zentime'
  runtimeConfig.stripe.webhookSecret = 'whsec_zentime'

  vi.stubGlobal('stripeClient', () => stripe)
  vi.stubGlobal('isBillingConfigured', () => Boolean(runtimeConfig.stripe.secretKey))
  vi.stubGlobal('webhookSecret', () => runtimeConfig.stripe.webhookSecret)
})

describe('POST /api/billing/checkout — ouvrir le tunnel de paiement', () => {
  it('ouvre un tunnel hébergé et rend son adresse, sans rien écrire en base', async () => {
    signIn(HR)
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    prismaMock.user.count.mockResolvedValue(12)
    stripe.prices.list.mockResolvedValue({ data: [PREMIUM_PRICE] })
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/c/1' })

    const result = await checkout(testEvent({
      method: 'POST',
      path: '/api/billing/checkout',
      body: { plan: 'PREMIUM' },
    }))

    expect(result).toEqual({ url: 'https://checkout.stripe.test/c/1', plan: 'PREMIUM', seats: 12 })

    // L'abonnement naît de la notification, jamais d'un appel que le navigateur
    // peut passer lui-même.
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled()

    const session = stripe.checkout.sessions.create.mock.calls[0]![0]
    // Le lien avec l'entreprise est posé deux fois : sur la session, et sur
    // l'abonnement qui lui survivra.
    expect(session.client_reference_id).toBe('cmp_1')
    expect(session.subscription_data.metadata.companyId).toBe('cmp_1')
    expect(session.line_items[0].quantity).toBe(12)
  })

  /**
   * **Rien ne se demande, tout se déduit.** Ni l'entreprise ni le prix n'entrent
   * par la requête : les transmettre ne change rien.
   */
  it('ignore une entreprise ou un prix transmis dans le corps', async () => {
    signIn(HR)
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    prismaMock.user.count.mockResolvedValue(3)
    stripe.prices.list.mockResolvedValue({ data: [PREMIUM_PRICE] })
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/c/1' })

    await checkout(testEvent({
      method: 'POST',
      body: { plan: 'PREMIUM', companyId: 'cmp_autre', pricePerSeat: 1, seats: 500 },
    }))

    const session = stripe.checkout.sessions.create.mock.calls[0]![0]
    expect(session.client_reference_id).toBe('cmp_1')
    expect(session.line_items[0].quantity).toBe(3)
    expect(session.line_items[0].price).toBe('price_premium')
  })

  /**
   * Le contrôle qui rend le mot « source unique » vrai plutôt que pieux : la
   * grille publique et le tarif du prestataire sont rapprochés **avant** le
   * paiement. Un refus est désagréable ; facturer six euros une formule affichée
   * trois l'est davantage, et se répare beaucoup moins bien.
   */
  it('refuse d\'ouvrir un tunnel si le tarif du prestataire a divergé de la grille', async () => {
    signIn(HR)
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    stripe.prices.list.mockResolvedValue({ data: [{ ...PREMIUM_PRICE, unit_amount: 900 }] })

    await expectApiError(
      checkout(testEvent({ method: 'POST', body: { plan: 'PREMIUM' } })),
      { statusCode: 409, code: 'price_mismatch' },
    )

    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('refuse quand les tarifs ne sont pas encore publiés chez le prestataire', async () => {
    signIn(HR)
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    stripe.prices.list.mockResolvedValue({ data: [] })

    await expectApiError(
      checkout(testEvent({ method: 'POST', body: { plan: 'PREMIUM' } })),
      { statusCode: 503, code: 'billing_not_provisioned' },
    )
  })

  /**
   * Une seconde souscription créerait un second abonnement chez le prestataire,
   * quand la table n'a qu'une ligne par entreprise : l'ancienne continuerait de
   * prélever sans que rien, ici, ne sache qu'elle existe.
   */
  it('refuse d\'ouvrir un second tunnel quand un abonnement vit déjà', async () => {
    signIn(HR)
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: 'PREMIUM', status: 'ACTIVE' })

    await expectApiError(
      checkout(testEvent({ method: 'POST', body: { plan: 'PREMIUM' } })),
      { statusCode: 409, code: 'already_subscribed' },
    )
  })

  it('refuse une formule inconnue', async () => {
    signIn(HR)

    await expectApiError(
      checkout(testEvent({ method: 'POST', body: { plan: 'PLATINE' } })),
      { statusCode: 422 },
    )
  })

  it('refuse un collaborateur et un manager', async () => {
    for (const role of ['COLLABORATOR', 'MANAGER'] as const) {
      signIn({ role })

      await expectApiError(
        checkout(testEvent({ method: 'POST', body: { plan: 'PREMIUM' } })),
        { statusCode: 403, code: 'forbidden' },
      )
    }
  })

  it('exige une session', async () => {
    await expectApiError(
      checkout(testEvent({ method: 'POST', body: { plan: 'PREMIUM' } })),
      { statusCode: 401 },
    )
  })
})

describe('POST /api/billing/portal — gérer son abonnement', () => {
  it('ouvre le portail client du prestataire', async () => {
    signIn(HR)
    prismaMock.subscription.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' })
    stripe.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.test/p/1' })

    const result = await portal(testEvent({ method: 'POST', path: '/api/billing/portal' }))

    expect(result).toEqual({ url: 'https://billing.stripe.test/p/1' })
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1' }),
    )
  })

  /** Sans cette route, la garde de plan serait à sens unique : on saurait souscrire et pas partir. */
  it('refuse quand l\'entreprise n\'a aucune fiche client chez le prestataire', async () => {
    signIn(HR)
    prismaMock.subscription.findUnique.mockResolvedValue(null)

    await expectApiError(portal(testEvent({ method: 'POST' })), {
      statusCode: 409,
      code: 'no_subscription',
    })
  })

  it('refuse un manager', async () => {
    signIn({ role: 'MANAGER' })

    await expectApiError(portal(testEvent({ method: 'POST' })), {
      statusCode: 403,
      code: 'forbidden',
    })
  })
})

describe('GET /api/billing/subscription — l\'état de l\'abonnement', () => {
  /**
   * Ce que la réponse ne contient pas est aussi délibéré que ce qu'elle
   * contient : les références opaques du prestataire n'ont aucun usage à l'écran
   * et n'ont rien à faire dans le cache d'un navigateur ni dans une capture
   * d'écran de soutenance.
   */
  it('rend l\'état sans laisser sortir les références du prestataire', async () => {
    signIn(HR)
    prismaMock.subscription.findUnique.mockResolvedValue({
      plan: 'PREMIUM',
      status: 'ACTIVE',
      seats: 12,
      currentPeriodEnd: new Date('2026-09-27T00:00:00Z'),
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })
    prismaMock.user.count.mockResolvedValue(12)

    const result = await subscriptionState(testEvent({ path: '/api/billing/subscription' }))
    const payload = JSON.stringify(result)

    expect(result.subscription?.plan).toBe('PREMIUM')
    expect(result.canManage).toBe(true)
    expect(result.canSubscribe).toBe(false)
    expect(payload).not.toContain('cus_1')
    expect(payload).not.toContain('sub_1')
  })

  /** Un environnement sans clés doit l'annoncer plutôt qu'offrir un bouton qui échoue. */
  it('annonce un environnement sans paiement configuré', async () => {
    signIn(HR)
    runtimeConfig.stripe.secretKey = ''
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    prismaMock.user.count.mockResolvedValue(4)

    const result = await subscriptionState(testEvent({ path: '/api/billing/subscription' }))

    expect(result.configured).toBe(false)
    expect(result.subscription).toBeNull()
  })

  it('refuse un collaborateur', async () => {
    signIn()

    await expectApiError(subscriptionState(testEvent({ path: '/api/billing/subscription' })), {
      statusCode: 403,
      code: 'forbidden',
    })
  })
})

describe('POST /api/billing/confirm — le retour du tunnel', () => {
  /**
   * Ce n'est pas un moyen de s'accorder un abonnement : la session est relue à
   * la source, et **elle doit désigner l'entreprise du demandeur**. Sans ce
   * contrôle, il suffirait de récupérer l'identifiant de session d'un client
   * pour lui prendre son abonnement.
   */
  it('refuse une session de paiement qui désigne une autre entreprise', async () => {
    signIn(HR)
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      client_reference_id: 'cmp_autre',
      mode: 'subscription',
      payment_status: 'paid',
    })

    await expectApiError(
      confirm(testEvent({ method: 'POST', body: { session: 'cs_test_0123456789abcdef' } })),
      { statusCode: 403, code: 'checkout_session_foreign' },
    )
  })

  /**
   * Revenir sur l'adresse de retour sans avoir payé n'est pas une erreur :
   * l'écran doit pouvoir le dire sans afficher un message d'échec.
   */
  it('rend « non appliqué » pour une session ouverte mais non payée', async () => {
    signIn(HR)
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      client_reference_id: 'cmp_1',
      mode: 'subscription',
      payment_status: 'unpaid',
    })

    const result = await confirm(testEvent({ method: 'POST', body: { session: 'cs_test_0123456789abcdef' } }))

    expect(result).toEqual({ applied: false, subscription: null })
  })

  it('traduit une session inconnue en 404 et une panne du prestataire en 502', async () => {
    signIn(HR)

    stripe.checkout.sessions.retrieve.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({ type: 'invalid_request_error', code: 'resource_missing' }),
    )
    await expectApiError(
      confirm(testEvent({ method: 'POST', body: { session: 'cs_test_0123456789abcdef' } })),
      { statusCode: 404, code: 'checkout_session_unknown' },
    )

    stripe.checkout.sessions.retrieve.mockRejectedValue(
      new Stripe.errors.StripeAPIError({ type: 'api_error' }),
    )
    await expectApiError(
      confirm(testEvent({ method: 'POST', body: { session: 'cs_test_0123456789abcdef' } })),
      { statusCode: 502, code: 'checkout_session_unavailable' },
    )
  })

  it('refuse un collaborateur', async () => {
    signIn()

    await expectApiError(
      confirm(testEvent({ method: 'POST', body: { session: 'cs_test_0123456789abcdef' } })),
      { statusCode: 403, code: 'forbidden' },
    )
  })
})

describe('POST /api/billing/webhook — la notification du prestataire', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' })

  /**
   * **La seule route du produit dont l'appelant n'a pas de session.** Son
   * authentification est une signature du corps exact de la requête : sans elle,
   * n'importe qui offrirait un abonnement Premium à n'importe quelle entreprise
   * en envoyant un objet JSON bien formé.
   */
  it('refuse une notification non signée', async () => {
    await expectApiError(
      webhook(testEvent({ method: 'POST', path: '/api/billing/webhook', rawBody: payload })),
      { statusCode: 400, code: 'missing_signature' },
    )

    expect(stripe.webhooks.constructEventAsync).not.toHaveBeenCalled()
  })

  it('refuse une notification vide', async () => {
    await expectApiError(
      webhook(testEvent({
        method: 'POST',
        path: '/api/billing/webhook',
        headers: { 'stripe-signature': 't=1,v1=abc' },
      })),
      { statusCode: 400, code: 'empty_payload' },
    )
  })

  /**
   * Le motif du rejet n'est pas repris dans la réponse : signature invalide,
   * horodatage hors tolérance et secret erroné se distinguent dans nos journaux,
   * pas dans ce que reçoit l'appelant.
   */
  it('refuse une signature invalide sans dire pourquoi', async () => {
    stripe.webhooks.constructEventAsync.mockRejectedValue(new Error('no match'))

    const refus = await expectApiError(
      webhook(testEvent({
        method: 'POST',
        path: '/api/billing/webhook',
        rawBody: payload,
        headers: { 'stripe-signature': 't=1,v1=abc' },
      })),
      { statusCode: 400, code: 'invalid_signature' },
    )

    expect(refus.statusMessage).toBe('Signature invalide.')
  })

  /**
   * La signature porte sur les **octets reçus**, pas sur l'objet qu'on en
   * déduit : lire le corps en JSON puis le resérialiser change un espace ou
   * l'ordre d'une clé, et la vérification échoue. C'est le piège classique de
   * cette intégration, et il ne se voit qu'à l'exécution.
   */
  it('vérifie la signature sur le corps brut, octet pour octet', async () => {
    const brut = '{"id":"evt_1",  "type":"invoice.paid"}'
    stripe.webhooks.constructEventAsync.mockResolvedValue({ id: 'evt_1', type: 'invoice.paid' })

    await webhook(testEvent({
      method: 'POST',
      path: '/api/billing/webhook',
      rawBody: brut,
      headers: { 'stripe-signature': 't=1,v1=abc' },
    }))

    expect(stripe.webhooks.constructEventAsync)
      .toHaveBeenCalledWith(brut, 't=1,v1=abc', 'whsec_zentime')
  })

  /**
   * Répondre en erreur aux évènements qu'on ne traite pas ferait relancer
   * indéfiniment des notifications dont on n'a que faire, et noierait dans le
   * bruit les échecs qui comptent.
   */
  it('acquitte sans les traiter les évènements qui ne nous concernent pas', async () => {
    stripe.webhooks.constructEventAsync.mockResolvedValue({ id: 'evt_1', type: 'invoice.paid' })

    const result = await webhook(testEvent({
      method: 'POST',
      path: '/api/billing/webhook',
      rawBody: payload,
      headers: { 'stripe-signature': 't=1,v1=abc' },
    }))

    expect(result).toEqual({ received: true })
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled()
  })

  /**
   * Sans le traitement des évènements d'abonnement, la garde de plan saurait
   * ouvrir des droits et jamais les refermer : une entreprise résiliée garderait
   * sa vue consolidée jusqu'à ce que quelqu'un s'en aperçoive.
   */
  it('referme les droits sur une résiliation venue du portail', async () => {
    const applySubscriptionEvent = vi.fn()
    vi.stubGlobal('applySubscriptionEvent', applySubscriptionEvent)

    stripe.webhooks.constructEventAsync.mockResolvedValue({
      id: 'evt_1',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    })

    const result = await webhook(testEvent({
      method: 'POST',
      path: '/api/billing/webhook',
      rawBody: payload,
      headers: { 'stripe-signature': 't=1,v1=abc' },
    }))

    expect(applySubscriptionEvent).toHaveBeenCalledWith({ id: 'sub_1' })
    expect(result).toEqual({ received: true })
  })

  /**
   * ⚠️ Le client et le secret sont résolus **hors** du bloc qui rattrape les
   * erreurs de signature. Constaté en l'exécutant : à l'intérieur, un
   * environnement sans clés répondait « Signature invalide » — le message
   * désignait alors le seul élément de la chaîne qui n'était pas en cause.
   */
  it('dit qu\'il manque un secret plutôt que d\'accuser la signature', async () => {
    runtimeConfig.stripe.webhookSecret = ''
    vi.stubGlobal('webhookSecret', () => {
      throw Object.assign(new Error('non configuré'), {
        statusCode: 503,
        data: { code: 'billing_unconfigured' },
      })
    })

    await expectApiError(
      webhook(testEvent({
        method: 'POST',
        path: '/api/billing/webhook',
        rawBody: payload,
        headers: { 'stripe-signature': 't=1,v1=abc' },
      })),
      { statusCode: 503, code: 'billing_unconfigured' },
    )
  })
})
