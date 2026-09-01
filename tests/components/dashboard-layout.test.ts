import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardLayout from '../../app/layouts/dashboard.vue'
import AuthLayout from '../../app/layouts/auth.vue'
import { $fetch, navigateTo, route, userSession } from '../helpers/vue'

/**
 * La coquille des espaces connectés.
 *
 * Un seul layout, trois menus. Ce qui est vérifié ici est la **matrice des
 * accès rendue visible** : la navigation d'encadrement s'ajoute à la navigation
 * commune, elle ne la remplace pas. La maquette prévoyait l'inverse, et un
 * manager n'aurait alors atteint ni ses pauses, ni son humeur — alors qu'il y a
 * droit, et que c'est aussi le propos du produit : un manager est un
 * collaborateur comme les autres.
 */

function monter(role?: string) {
  if (role) userSession.user.value = { role, firstName: 'Sofia', lastName: 'Nakamura' }

  return mount(DashboardLayout, { slots: { default: '<p>contenu</p>' } })
}

/** Les adresses des liens de navigation rendus. */
function liens(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('a').map(link => link.attributes('href'))
}

describe('la coquille des espaces connectés', () => {
  it('donne au collaborateur ses cinq écrans, et rien d\'encadrement', () => {
    const adresses = liens(monter('COLLABORATOR'))

    for (const commun of ['/tableau-de-bord', '/pauses', '/exercices', '/humeur', '/statistiques']) {
      expect(adresses, commun).toContain(commun)
    }

    expect(adresses).not.toContain('/equipe')
    expect(adresses).not.toContain('/entreprise')
    expect(adresses).not.toContain('/tarifs')
  })

  /** La navigation d'encadrement **s'ajoute** : elle ne remplace pas. */
  it('ajoute son équipe au manager sans lui retirer ses propres écrans', () => {
    const adresses = liens(monter('MANAGER'))

    expect(adresses).toContain('/equipe')
    expect(adresses).toContain('/humeur')
    expect(adresses).toContain('/pauses')
    expect(adresses).not.toContain('/entreprise')
  })

  /** CU-15 — le responsable RH est le seul rôle qui souscrit. */
  it('ajoute l\'entreprise et l\'abonnement au responsable RH', () => {
    const adresses = liens(monter('HR'))

    expect(adresses).toContain('/entreprise')
    expect(adresses).toContain('/tarifs')
    expect(adresses).not.toContain('/equipe')
  })

  it('affiche le rôle en français', () => {
    expect(monter('HR').text()).toContain('Responsable RH')
    expect(monter('MANAGER').text()).toContain('Manager')
  })

  /**
   * Le layout n'est monté que derrière le middleware `auth`, mais `user` reste
   * nullable le temps que la session soit hydratée : le repli évite un écran nu.
   */
  it('ne rend pas un écran nu tant que la session n\'est pas hydratée', () => {
    userSession.user.value = null

    expect(monter().text()).toContain('Collaborateur')
  })

  /** Une sous-page doit garder son onglet parent allumé. */
  it('garde l\'onglet parent allumé sur une sous-page', () => {
    route.path = '/pauses/historique'

    const wrapper = monter('COLLABORATOR')
    const pauses = wrapper.findAll('a').find(link => link.attributes('href') === '/pauses')

    expect(pauses!.attributes('aria-current')).toBe('page')
  })

  /**
   * Le raccourci « prendre une pause » disparaît sur l'écran du minuteur, et là
   * seulement : c'est le seul écran qui porte déjà le contrôle, avec l'état réel
   * de la pause. Deux boutons pour la même action, dont un qui ignore qu'une
   * pause est en cours, se contrediraient à l'usage.
   */
  it('retire le raccourci de pause sur l\'écran du minuteur, et là seulement', () => {
    route.path = '/pauses'
    expect(monter('COLLABORATOR').text()).not.toContain('Prendre une pause')

    route.path = '/pauses/historique'
    expect(monter('COLLABORATOR').text()).toContain('Prendre une pause')
  })

  /**
   * `clear` s'exécute même si l'appel réseau a échoué : rester affiché comme
   * connecté après avoir cliqué sur « Se déconnecter » serait le pire des deux
   * résultats possibles.
   */
  it('déconnecte même quand l\'appel au serveur échoue', async () => {
    $fetch.mockRejectedValue(new Error('réseau'))

    const wrapper = monter('COLLABORATOR')
    const deconnexion = wrapper.findAll('button').find(b => b.text().includes('déconnecter'))

    await deconnexion!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(userSession.clear).toHaveBeenCalled()
    expect(navigateTo).toHaveBeenCalledWith('/connexion')
  })

  /**
   * La barre d'onglets mobile n'affiche que quatre entrées : celles marquées
   * « bureau seulement » en sont écartées.
   */
  it('réduit la barre d\'onglets mobile aux entrées essentielles', () => {
    const wrapper = monter('HR')
    const mobile = wrapper.find('nav[aria-label="Navigation principale mobile"]')

    if (mobile.exists()) {
      const adresses = mobile.findAll('a').map(link => link.attributes('href'))

      expect(adresses).not.toContain('/tarifs')
      expect(adresses).not.toContain('/statistiques')
    }
  })
})

describe('la coquille des écrans d\'entrée', () => {
  /**
   * Les garanties de confidentialité s'annoncent **avant** l'inscription (F12),
   * pas une fois le compte créé.
   */
  it('annonce la politique de confidentialité avant même le formulaire', () => {
    const wrapper = mount(AuthLayout, { slots: { default: '<form />' } })

    expect(wrapper.find('a[href="/confidentialite"]').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(true)
  })
})
