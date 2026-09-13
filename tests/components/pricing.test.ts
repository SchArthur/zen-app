import { describe, expect, it } from 'vitest'
import { PLANS, formatPrice } from '../../shared/utils/plans'
import PricingPage from '../../app/pages/tarifs.vue'
import { $fetch, mountAsync, navigateTo, route, router, serve } from '../helpers/vue'

/**
 * CU-15 — l'écran d'abonnement.
 *
 * Le point vérifié en priorité est celui de F11 : **aucune donnée bancaire ne
 * passe par cet écran**. Il n'y a donc aucun champ de carte à chercher — ce qui
 * se teste très bien — et le bouton ne fait qu'ouvrir un tunnel hébergé, en
 * navigation de premier plan.
 *
 * Le second point est la **source unique de la grille tarifaire** : les formules
 * affichées ici sont exactement celles de la page publique. Un écran de
 * souscription qui redécrirait l'offre finirait par la décrire autrement, et
 * c'est entre les deux descriptions que se glisse un litige.
 */

function servirAbonnement(overrides: Record<string, unknown> = {}) {
  serve('/api/billing/subscription', {
    configured: true,
    seats: 12,
    canSubscribe: true,
    canManage: false,
    subscription: null,
    ...overrides,
  })
}

describe('l\'écran d\'abonnement (CU-15)', () => {
  it('affiche la grille tarifaire commune, sans la redécrire', async () => {
    servirAbonnement()

    const texte = (await mountAsync(PricingPage)).text()

    for (const offer of PLANS) {
      expect(texte, offer.id).toContain(offer.name)
      expect(texte, offer.id).toContain(formatPrice(offer.pricePerSeat))
    }
  })

  /** Le critère mesurable de F11, vérifié sur ce que le navigateur reçoit. */
  it('ne présente aucun champ bancaire', async () => {
    servirAbonnement()

    const wrapper = await mountAsync(PricingPage)
    const html = wrapper.html().toLowerCase()

    expect(wrapper.findAll('input[type="password"]')).toHaveLength(0)
    for (const interdit of ['carte', 'cvc', 'cvv', 'iban', 'card-number', 'expiration']) {
      expect(html, interdit).not.toContain(interdit)
    }
  })

  it('accorde le décompte de postes facturables', async () => {
    servirAbonnement({ seats: 1 })
    expect((await mountAsync(PricingPage)).text()).toContain('1 compte confirmé')

    servirAbonnement({ seats: 12 })
    expect((await mountAsync(PricingPage)).text()).toContain('12 comptes confirmés')
  })

  /**
   * Navigation de premier plan, et non redirection suivie par `fetch` : le
   * tunnel doit s'ouvrir devant l'utilisateur, pas dans une réponse que personne
   * ne regarde.
   */
  it('ouvre le tunnel de paiement en navigation de premier plan', async () => {
    servirAbonnement()
    $fetch.mockResolvedValue({ url: 'https://checkout.stripe.test/c/1' })

    const wrapper = await mountAsync(PricingPage)
    const souscrire = wrapper.findAll('button').filter(b => b.text().toLowerCase().includes('souscrire'))

    await souscrire[0]!.trigger('click')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/billing/checkout', {
      method: 'POST',
      body: { plan: expect.any(String) },
    })
    expect(navigateTo).toHaveBeenCalledWith('https://checkout.stripe.test/c/1', { external: true })
  })

  /** Un environnement sans clés le dit, plutôt que d'offrir un bouton qui échoue. */
  it('annonce un environnement sans paiement configuré', async () => {
    servirAbonnement({ configured: false })

    expect((await mountAsync(PricingPage)).text())
      .toContain('Le paiement en ligne n\'est pas configuré sur cet environnement')
  })

  /**
   * Sans le portail, la garde de plan serait à sens unique : on saurait
   * souscrire et pas partir.
   */
  it('mène au portail du prestataire pour changer de formule ou résilier', async () => {
    servirAbonnement({
      canSubscribe: false,
      canManage: true,
      subscription: {
        plan: 'PREMIUM',
        status: 'ACTIVE',
        seats: 12,
        currentPeriodEnd: '2026-09-27T00:00:00.000Z',
      },
    })
    $fetch.mockResolvedValue({ url: 'https://billing.stripe.test/p/1' })

    const wrapper = await mountAsync(PricingPage)

    expect(wrapper.text()).toContain('Abonnement actif')

    const gerer = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('gérer'))
    await gerer!.trigger('click')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/billing/portal', { method: 'POST' })
    expect(navigateTo).toHaveBeenCalledWith('https://billing.stripe.test/p/1', { external: true })
  })

  /** Le vocabulaire du prestataire ne sort jamais de l'application. */
  it('traduit un prélèvement en échec en français, sans alarme', async () => {
    servirAbonnement({
      canSubscribe: false,
      canManage: true,
      subscription: { plan: 'PREMIUM', status: 'PAST_DUE', seats: 12, currentPeriodEnd: null },
    })

    const texte = (await mountAsync(PricingPage)).text()

    expect(texte).toContain('Prélèvement en échec')
    expect(texte).toContain('Mettez à jour votre moyen de paiement')
    expect(texte).not.toContain('past_due')
  })
})

describe('le retour du tunnel de paiement', () => {
  /**
   * Les paramètres sont retirés de l'adresse une fois traités : sans cela, un
   * rafraîchissement rejouerait la confirmation, et l'adresse recopiée dans un
   * courriel porterait un identifiant de session.
   */
  it('confirme le paiement et nettoie l\'adresse', async () => {
    route.query = { paiement: 'succes', session: 'cs_test_0123456789abcdef' }
    servirAbonnement()
    $fetch.mockResolvedValue({ applied: true, subscription: { plan: 'PREMIUM' } })

    const wrapper = await mountAsync(PricingPage)
    await wrapper.vm.$nextTick()

    expect(router.replace).toHaveBeenCalledWith({ query: {} })
    expect($fetch).toHaveBeenCalledWith('/api/billing/confirm', {
      method: 'POST',
      body: { session: 'cs_test_0123456789abcdef' },
    })
    expect(wrapper.text()).toContain('Paiement accepté')
  })

  it('ne présente pas un abandon comme un échec', async () => {
    route.query = { paiement: 'annule' }
    servirAbonnement()

    const wrapper = await mountAsync(PricingPage)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Rien n\'a été prélevé')
    expect($fetch).not.toHaveBeenCalled()
  })

  /**
   * L'échec de la confirmation n'est pas l'échec du paiement : la notification,
   * elle, arrivera. Le message le dit plutôt que d'annoncer un refus qui n'a pas
   * eu lieu.
   */
  it('ne transforme pas un échec de relecture en échec de paiement', async () => {
    route.query = { paiement: 'succes', session: 'cs_test_0123456789abcdef' }
    servirAbonnement()
    $fetch.mockRejectedValue({
      data: {
        statusMessage: 'La session n\'a pas pu être relue.',
        data: { code: 'checkout_session_unavailable' },
      },
    })

    const wrapper = await mountAsync(PricingPage)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('votre abonnement s\'activera d\'ici quelques instants')
  })
})
