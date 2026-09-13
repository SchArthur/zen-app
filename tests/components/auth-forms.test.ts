import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginPage from '../../app/pages/connexion.vue'
import RegisterPage from '../../app/pages/inscription.vue'
import ConfirmPage from '../../app/pages/confirmer-email.vue'
import { $fetch, navigateTo, route, userSession } from '../helpers/vue'

/**
 * CU-02 et CU-03 — les écrans d'entrée dans l'application.
 *
 * Le fil est le **double opt-in vu de l'interface** : l'inscription ne connecte
 * personne, elle envoie un lien ; la connexion refuse un compte non confirmé et
 * doit alors proposer d'en redemander un — c'est le seul endroit où ce
 * renvoi a du sens, puisque le serveur ne signale ce cas qu'à qui a donné le bon
 * mot de passe.
 */

/** Une erreur de `$fetch`, telle que Nitro l'emballe. */
function apiError(payload: Record<string, unknown>) {
  return { data: payload }
}

describe('l\'écran de connexion (CU-03)', () => {
  it('recharge la session avant de naviguer', async () => {
    $fetch.mockResolvedValue({ user: { id: 'usr_1' } })

    const wrapper = mount(LoginPage)
    await wrapper.find('#email').setValue('sofia@atelier-voisin.fr')
    await wrapper.find('#password').setValue('MotDePasseSolide1')
    await wrapper.find('form').trigger('submit')

    expect($fetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { email: 'sofia@atelier-voisin.fr', password: 'MotDePasseSolide1' },
    })
    /**
     * Sans ce rechargement, le middleware de route de la page suivante croirait
     * encore à un visiteur et renverrait aussitôt vers la connexion.
     */
    expect(userSession.fetch).toHaveBeenCalled()
    expect(navigateTo).toHaveBeenCalledWith('/tableau-de-bord')
  })

  /** L'écran d'où l'on venait est repris dans l'adresse : on y retourne. */
  it('revient là où la personne avait été interrompue', async () => {
    route.query = { suite: '/equipe' }
    $fetch.mockResolvedValue({ user: { id: 'usr_1' } })

    const wrapper = mount(LoginPage)
    await wrapper.find('form').trigger('submit')

    expect(navigateTo).toHaveBeenCalledWith('/equipe')
  })

  it('affiche le refus du serveur', async () => {
    $fetch.mockRejectedValue(apiError({
      statusMessage: 'Adresse email ou mot de passe incorrect.',
      data: { code: 'invalid_credentials' },
    }))

    const wrapper = mount(LoginPage)
    await wrapper.find('form').trigger('submit')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Adresse email ou mot de passe incorrect.')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  /**
   * Quand chaque champ porte déjà son motif de refus, répéter en tête le libellé
   * technique du serveur n'ajoute rien : on oriente vers les champs.
   */
  it('oriente vers les champs plutôt que de répéter le libellé du serveur', async () => {
    $fetch.mockRejectedValue(apiError({
      statusMessage: 'Données invalides',
      data: { errors: { email: ['Adresse email invalide.'] } },
    }))

    const wrapper = mount(LoginPage)
    await wrapper.find('form').trigger('submit')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Vérifiez les champs signalés ci-dessous.')
    expect(wrapper.text()).toContain('Adresse email invalide.')
    expect(wrapper.text()).not.toContain('Données invalides')
  })

  /** A2 de CU-02 : le lien a expiré ou n'est jamais arrivé. */
  it('propose de redemander un lien à un compte non confirmé, et à lui seul', async () => {
    $fetch.mockRejectedValue(apiError({
      statusMessage: 'Votre adresse n\'est pas encore confirmée.',
      data: { code: 'email_not_verified' },
    }))

    const wrapper = mount(LoginPage)
    await wrapper.find('#email').setValue('sofia@atelier-voisin.fr')
    await wrapper.find('form').trigger('submit')
    await wrapper.vm.$nextTick()

    const renvoi = wrapper.findAll('button').find(button => button.text().includes('nouveau lien'))
    expect(renvoi).toBeDefined()

    $fetch.mockResolvedValue({ message: 'Un nouveau lien vient d\'être envoyé.' })
    await renvoi!.trigger('click')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenLastCalledWith('/api/auth/resend-verification', {
      method: 'POST',
      body: { email: 'sofia@atelier-voisin.fr' },
    })
    expect(wrapper.text()).toContain('Un nouveau lien vient d\'être envoyé.')
  })

  /**
   * CU-05.2 — retour de la suppression de compte. Le message est porté par
   * l'adresse et non par un état conservé : la page est atteinte après un
   * changement de session, qui remet tout état applicatif à zéro.
   */
  it('salue une suppression de compte réussie', async () => {
    route.query = { compte: 'supprime' }

    expect(mount(LoginPage).text()).toContain('Votre compte et vos déclarations ont été supprimés')
  })
})

describe('l\'écran d\'inscription (CU-02)', () => {
  /**
   * Le formulaire disparaît une fois la demande acceptée : le seul geste utile
   * est alors d'aller relever sa boîte de réception. Personne n'est connecté.
   */
  it('remplace le formulaire par la consigne de relever sa boîte mail', async () => {
    $fetch.mockResolvedValue({
      status: 'pending',
      message: 'Si cette adresse peut être inscrite, un lien vient d\'être envoyé.',
    })

    const wrapper = mount(RegisterPage)
    await wrapper.find('form').trigger('submit')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Vérifiez votre boîte mail')
    expect(wrapper.text()).toContain('un lien vient d\'être envoyé')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  /** E2 de CU-02 : chaque critère non respecté est signalé nommément, sur son champ. */
  it('affiche chaque critère de mot de passe refusé', async () => {
    $fetch.mockRejectedValue(apiError({
      statusMessage: 'Données invalides',
      data: {
        errors: {
          password: [
            'Le mot de passe doit contenir au moins 12 caractères.',
            'Le mot de passe doit contenir au moins un chiffre.',
          ],
        },
      },
    }))

    const wrapper = mount(RegisterPage)
    await wrapper.find('form').trigger('submit')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('#password-error li')).toHaveLength(2)
  })

  it('transmet l\'acceptation des conditions', async () => {
    $fetch.mockResolvedValue({ status: 'pending', message: 'ok' })

    const wrapper = mount(RegisterPage)
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit')

    expect($fetch.mock.calls[0]![1].body.acceptTerms).toBe(true)
  })
})

describe('l\'écran de confirmation d\'adresse (CU-02.1)', () => {
  /**
   * Le jeton est consommé par un POST et non en suivant le lien : viser l'API
   * directement en GET laisserait un antivirus de messagerie activer le compte
   * en prélisant le lien, avant même que le destinataire ait ouvert le message.
   */
  it('consomme le jeton de l\'adresse par un envoi, pas par la navigation', async () => {
    route.query = { token: 'a'.repeat(48) }
    $fetch.mockResolvedValue({ status: 'verified', message: 'Votre adresse est confirmée.' })

    const wrapper = mount(ConfirmPage)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/auth/verify-email', {
      method: 'POST',
      body: { token: 'a'.repeat(48) },
    })
    expect(wrapper.text()).toContain('Votre adresse est confirmée.')
  })

  /** Sans jeton, l'écran sert à en redemander un — c'est l'alternative A2. */
  it('propose de redemander un lien quand l\'adresse n\'en porte aucun', async () => {
    const wrapper = mount(ConfirmPage)
    await wrapper.vm.$nextTick()

    expect($fetch).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(true)
  })
})
