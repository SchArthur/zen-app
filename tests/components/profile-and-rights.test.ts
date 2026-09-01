import { describe, expect, it } from 'vitest'
import ProfilePage from '../../app/pages/profil.vue'
import MyDataPage from '../../app/pages/mes-donnees.vue'
import { $fetch, mountAsync, navigateTo, serve, userSession } from '../helpers/vue'

/**
 * CU-06 — le profil et les préférences, et CU-05 — les droits sur ses données.
 *
 * Les deux écrans se répondent : le premier règle ce que l'application fait de
 * la journée de travail, le second ce qu'elle a le droit d'en enregistrer. Le
 * second est le seul endroit d'où l'on peut sortir du produit — c'est ce qui
 * rend la promesse de l'inscription tenable, et c'est ce qui est testé ici.
 */

const PROFILE = {
  profile: {
    email: 'sofia.nakamura@atelier-voisin.fr',
    firstName: 'Sofia',
    lastName: 'Nakamura',
    role: 'MANAGER',
    company: 'Atelier Voisin',
    team: 'Équipe Produit',
  },
  preferences: {
    workStartHour: 9,
    workEndHour: 18,
    remindersEnabled: true,
    reminderIntervalMin: 90,
    favoriteTypes: ['BREATHING'],
  },
}

describe('l\'écran de profil (CU-06)', () => {
  it('affiche l\'identité et le rattachement, en français', async () => {
    serve('/api/profile', PROFILE)

    const texte = (await mountAsync(ProfilePage)).text()

    expect(texte).toContain('Atelier Voisin')
    expect(texte).toContain('Équipe Produit')
    expect(texte).toContain('Manager')
  })

  /**
   * L'adresse sert d'identifiant de connexion et rattache le compte à son
   * entreprise par son domaine : elle s'affiche, elle ne se modifie pas.
   */
  it('montre l\'adresse sans permettre de la changer', async () => {
    serve('/api/profile', PROFILE)

    const wrapper = await mountAsync(ProfilePage)

    expect(wrapper.text()).toContain('sofia.nakamura@atelier-voisin.fr')
    expect(wrapper.find('input[type="email"]:not([disabled])').exists()).toBe(false)
  })

  it('enregistre l\'identité et réaligne la session', async () => {
    serve('/api/profile', PROFILE)
    $fetch.mockResolvedValue({ profile: { firstName: 'Sofia', lastName: 'Nakamura-Roy' } })

    const wrapper = await mountAsync(ProfilePage)
    await wrapper.find('#lastName').setValue('Nakamura-Roy')
    await wrapper.findAll('form')[0]!.trigger('submit')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/profile', {
      method: 'PATCH',
      body: { firstName: 'Sofia', lastName: 'Nakamura-Roy' },
    })
    /**
     * Le nom affiché dans la navigation vient de la session : sans cette
     * relecture, l'ancien resterait à l'écran jusqu'à la prochaine connexion.
     */
    expect(userSession.fetch).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Vos modifications sont enregistrées.')
  })

  /** PUT et non PATCH : le formulaire envoie le jeu complet de réglages. */
  it('envoie le jeu complet de préférences', async () => {
    serve('/api/profile', PROFILE)
    $fetch.mockResolvedValue({ preferences: PROFILE.preferences })

    const wrapper = await mountAsync(ProfilePage)
    await wrapper.findAll('form')[1]!.trigger('submit')

    expect($fetch).toHaveBeenCalledWith('/api/profile/preferences', {
      method: 'PUT',
      body: expect.objectContaining({
        workStartHour: 9,
        workEndHour: 18,
        remindersEnabled: true,
        reminderIntervalMin: 90,
        favoriteTypes: ['BREATHING'],
      }),
    })
  })

  /**
   * Les cases cochées sont une **copie** de la réponse reçue : les partager
   * ferait qu'en cocher une modifierait la donnée du serveur sans rien envoyer.
   */
  it('ne modifie pas la réponse du serveur en cochant une case', async () => {
    serve('/api/profile', PROFILE)
    $fetch.mockResolvedValue({ preferences: PROFILE.preferences })

    const wrapper = await mountAsync(ProfilePage)
    const cases = wrapper.findAll('input[type="checkbox"]')
    await cases[cases.length - 1]!.setValue(true)

    expect(PROFILE.preferences.favoriteTypes).toEqual(['BREATHING'])
  })

  it('rattache les motifs de refus du serveur à leurs champs', async () => {
    serve('/api/profile', PROFILE)
    $fetch.mockRejectedValue({
      data: {
        statusMessage: 'Données invalides',
        data: { errors: { firstName: ['Prénom requis.'] } },
      },
    })

    const wrapper = await mountAsync(ProfilePage)
    await wrapper.findAll('form')[0]!.trigger('submit')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Vérifiez les champs signalés ci-dessous.')
    expect(wrapper.text()).toContain('Prénom requis.')
  })
})

const CONSENT = {
  policyVersion: 'v1',
  analytics: null as boolean | null,
  analyticsDecidedAt: null as string | null,
  wellbeing: 'granted' as string | null,
  wellbeingDecidedAt: '2026-08-01T09:00:00.000Z',
}

describe('l\'écran « mes données » (CU-05)', () => {
  it('porte les quatre droits au même endroit', async () => {
    serve('/api/consent', CONSENT)

    const wrapper = await mountAsync(MyDataPage)
    const texte = wrapper.text()

    // Consentement, export, suppression — et la politique qui les explique.
    expect(texte).toContain('Mes consentements')
    expect(wrapper.find('a[href="/api/me/export"]').exists()).toBe(true)
    expect(texte.toLowerCase()).toContain('supprim')
  })

  /** « Jamais demandé » et « retiré » ne se disent pas de la même façon. */
  it('distingue les trois états du consentement bien-être', async () => {
    serve('/api/consent', { ...CONSENT, wellbeing: 'granted' })
    expect((await mountAsync(MyDataPage)).text()).toContain('Accordé')

    serve('/api/consent', { ...CONSENT, wellbeing: 'withdrawn' })
    expect((await mountAsync(MyDataPage)).text()).toContain('Retiré')

    serve('/api/consent', { ...CONSENT, wellbeing: 'unknown' })
    expect((await mountAsync(MyDataPage)).text()).toContain('Pas encore décidé')
  })

  /**
   * Une décision, un appel. Envoyer les deux finalités à chaque fois
   * réaffirmerait un choix que la personne n'a pas repris, et le journal
   * enregistrerait des décisions qu'elle n'a pas prises.
   */
  it('n\'envoie que la finalité sur laquelle la personne s\'est prononcée', async () => {
    serve('/api/consent', CONSENT)
    $fetch.mockResolvedValue({ ...CONSENT, wellbeing: 'withdrawn' })

    const wrapper = await mountAsync(MyDataPage)
    const retirer = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('retirer'))

    await retirer!.trigger('click')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/consent', {
      method: 'PUT',
      body: { wellbeing: false },
    })
    expect($fetch.mock.calls[0]![1].body).not.toHaveProperty('analytics')
  })

  /**
   * CU-05.2 — la suppression exige le mot de passe, puis vide l'état de session
   * du navigateur : le cookie a déjà été retiré par le serveur, mais
   * l'application afficherait encore le nom de quelqu'un qui n'existe plus.
   */
  it('supprime le compte, vide la session et quitte l\'application', async () => {
    serve('/api/consent', CONSENT)
    $fetch.mockResolvedValue({ status: 'deleted' })

    const wrapper = await mountAsync(MyDataPage)
    await wrapper.find('#password').setValue('MotDePasseSolide1')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.findAll('form').at(-1)!.trigger('submit')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/me', {
      method: 'DELETE',
      body: { password: 'MotDePasseSolide1' },
    })
    expect(userSession.clear).toHaveBeenCalled()
    expect(navigateTo).toHaveBeenCalledWith('/connexion?compte=supprime')
  })

  it('affiche le refus d\'un mot de passe erroné sans rien effacer', async () => {
    serve('/api/consent', CONSENT)
    $fetch.mockRejectedValue({
      data: { statusMessage: 'Mot de passe incorrect.', data: { code: 'invalid_password' } },
    })

    const wrapper = await mountAsync(MyDataPage)
    await wrapper.findAll('form').at(-1)!.trigger('submit')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Mot de passe incorrect.')
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
