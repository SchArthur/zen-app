import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { PLANS, formatPrice } from '../../shared/utils/plans'
import LandingPage from '../../app/pages/index.vue'
import PrivacyPage from '../../app/pages/confidentialite.vue'
import ErrorPage from '../../app/error.vue'
import { navigateTo, route, userSession } from '../helpers/vue'

/**
 * CU-01 — la présentation publique, et la politique de confidentialité.
 *
 * Ces deux pages sont les **seules surfaces indexables** du produit, et les
 * seules qu'un prospect voie avant d'avoir un compte. Elles portent donc un
 * engagement particulier : ce qu'elles annoncent doit être ce que le code fait.
 * Une page publique qui promet ce que le produit ne tient pas est un écart de
 * plus, et c'est le seul qu'un visiteur puisse constater lui-même.
 *
 * Les tests portent sur ce qui pourrait diverger sans qu'on le voie : la grille
 * tarifaire, les garanties chiffrées, la version des textes de consentement.
 */

describe('la page d\'accueil publique (CU-01, F12)', () => {
  it('annonce les garanties chiffrées que le code tient réellement', () => {
    const texte = mount(LandingPage).text()

    // Le seuil d'anonymat, la promesse la plus vérifiable du produit.
    expect(texte).toContain('cinq')
    expect(texte).toContain('Trois lectures des mêmes données, trois interdits')
  })

  /**
   * Les cartes tarifaires viennent de `shared/utils/plans.ts`, la même source
   * que l'écran de souscription et que les produits créés chez le prestataire.
   * Un prix recopié finirait par annoncer autre chose que ce qui est facturé.
   */
  it('affiche la grille tarifaire depuis sa source unique', () => {
    const texte = mount(LandingPage).text()

    for (const offer of PLANS) {
      expect(texte, offer.id).toContain(offer.name)
      expect(texte, offer.id).toContain(formatPrice(offer.pricePerSeat))

      for (const excluded of offer.excluded ?? []) {
        expect(texte, excluded).toContain(excluded)
      }
    }
  })

  /**
   * Aucune coquille d'application : les écrans connectés ont une barre latérale
   * et une barre d'onglets qui n'ont rien à faire devant quelqu'un sans compte.
   */
  it('mène à l\'inscription tant que personne n\'est connecté', () => {
    const visiteur = mount(LandingPage)

    expect(visiteur.find('a[href="/inscription"]').exists()).toBe(true)
    expect(visiteur.find('a[href="/confidentialite"]').exists()).toBe(true)

    userSession.loggedIn.value = true
    const connecte = mount(LandingPage)

    expect(connecte.find('a[href="/tableau-de-bord"]').exists()).toBe(true)
  })
})

describe('la politique de confidentialité', () => {
  /**
   * `CONSENT_POLICY_VERSION` est la version que le journal des consentements
   * recopie dans chaque décision. Modifier cette page sans l'incrémenter ferait
   * dire au journal que les personnes ont accepté un texte qu'elles n'ont pas lu.
   */
  it('affiche la version des textes et sa date', () => {
    const texte = mount(PrivacyPage).text()

    expect(texte).toContain('v1')
    expect(texte).toContain('25 août 2026')
  })

  /** Articles 12 à 14 : les finalités, les bases légales, les durées, les droits. */
  it('énonce les finalités, les durées et les droits', () => {
    const texte = mount(PrivacyPage).text().toLowerCase()

    for (const attendu of ['finalité', 'conservation', 'droits', 'consentement', 'réclamation']) {
      expect(texte, attendu).toContain(attendu)
    }
  })

  it('est lisible sans compte', () => {
    expect(mount(PrivacyPage).exists()).toBe(true)
  })
})

describe('la page d\'erreur', () => {
  function monter(error: Record<string, unknown>) {
    return mount(ErrorPage, { props: { error } })
  }

  /**
   * Une session expirée mène à la connexion **en gardant l'adresse demandée** :
   * c'est ce que fait déjà le middleware de route, et l'erreur ne doit pas
   * défaire ce que la navigation normale sait faire.
   */
  it('renvoie une session expirée à la connexion, sans perdre la page', async () => {
    route.path = '/equipe'
    Object.assign(route, { fullPath: '/equipe' })

    const wrapper = monter({ statusCode: 401 })

    expect(wrapper.text()).toContain('Votre session a expiré')

    await wrapper.find('button, a').trigger('click')

    expect(wrapper.html()).toContain('Se reconnecter')
  })

  /**
   * 402 est distinct de 403 à dessein : « pas vous » n'a pas d'issue, « pas
   * encore payé » en a une. Encore faut-il que celui qui lit puisse s'en
   * servir — l'écran de souscription est réservé au responsable RH, et y
   * envoyer un collaborateur le mènerait d'un refus à un autre.
   */
  it('ne mène aux formules que le responsable RH', () => {
    userSession.user.value = { role: 'HR' }
    expect(monter({ statusCode: 402 }).text()).toContain('Voir les formules')

    userSession.user.value = { role: 'COLLABORATOR' }
    expect(monter({ statusCode: 402 }).text()).not.toContain('Voir les formules')
  })

  /** La page ne nomme pas le rôle attendu, comme `assertRole`. */
  it('refuse un accès sans renseigner sur l\'organisation interne', () => {
    const texte = monter({ statusCode: 403 }).text()

    expect(texte).toContain('Cette page ne vous est pas ouverte')
    for (const role of ['Manager', 'Responsable RH', 'MANAGER', 'HR']) {
      expect(texte, role).not.toContain(role)
    }
  })

  /**
   * Le message du serveur n'est repris que s'il **vient de nous**, et le signe
   * en est `data.code`. Sans ce filtre, une adresse inconnue affichait « Page
   * not found: /page-qui-nexiste-pas » — le message anglais du routeur de Nuxt,
   * sur une page française. Une erreur non maîtrisée pourrait tout aussi bien
   * porter un nom de table ou un chemin de fichier.
   */
  it('n\'affiche que nos propres messages', () => {
    const notre = monter({
      statusCode: 404,
      message: 'Cet exercice n\'existe pas ou n\'est plus proposé.',
      data: { code: 'exercise_not_found' },
    })
    expect(notre.text()).toContain('Cet exercice n\'existe pas ou n\'est plus proposé.')

    const etranger = monter({
      statusCode: 404,
      message: 'Page not found: /page-qui-nexiste-pas',
    })
    expect(etranger.text()).not.toContain('Page not found')
    expect(etranger.text()).toContain('L\'adresse demandée ne correspond à aucun écran de ZenTime.')
  })

  it('propose de réessayer sur une panne, plutôt qu\'un cul-de-sac', () => {
    const texte = monter({ statusCode: 500 }).text()

    expect(texte).toContain('Quelque chose s\'est mal passé')
    expect(texte).toContain('réessayez')
  })

  it('ramène un visiteur à l\'accueil et une personne connectée à son tableau de bord', () => {
    expect(monter({ statusCode: 404 }).text()).toContain('Retour à l\'accueil')

    userSession.loggedIn.value = true
    expect(monter({ statusCode: 404 }).text()).toContain('Retour à mon tableau de bord')
  })
})

describe('la navigation depuis la page d\'erreur', () => {
  it('défait l\'état d\'erreur avant de naviguer', async () => {
    const wrapper = mount(ErrorPage, { props: { error: { statusCode: 404 } } })

    await wrapper.find('button').trigger('click')

    // `clearError` s'en charge : sans lui, l'état d'erreur persisterait.
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
