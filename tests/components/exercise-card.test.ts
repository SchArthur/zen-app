import { describe, expect, it } from 'vitest'
import CataloguePage from '../../app/pages/exercices/index.vue'
import { $fetch, mountAsync, route, router, serve } from '../helpers/vue'

/**
 * CU-08 — la carte d'exercice du catalogue.
 *
 * La carte n'a pas de composant à elle : elle vit dans l'écran, parce qu'elle
 * n'est affichée que là. C'est donc l'écran qui est monté, avec un serveur qui a
 * déjà répondu — l'état dans lequel la personne le voit. Le montage passe par
 * `Suspense`, comme Nuxt le fait autour de ses pages.
 *
 * Ce que la carte doit porter, d'après F4 : la famille, la durée, un titre qui
 * mène au déroulé, et de quoi déclarer la réalisation **en une interaction**.
 */

const SOUFFLE = {
  id: 'exr_1',
  slug: 'souffle-4-7-8',
  title: 'Souffle 4-7-8',
  description: 'Une respiration lente pour redescendre.',
  type: 'BREATHING',
  durationMin: 4,
  activity: null,
}

const NUQUE = {
  id: 'exr_2',
  slug: 'nuque-douce',
  title: 'Nuque douce',
  description: 'Relâcher les trapèzes sans quitter sa chaise.',
  type: 'STRETCHING',
  durationMin: 2,
  activity: { count: 3, doneToday: false, lastCompletedAt: '2026-08-25T10:00:00.000Z' },
}

function servirCatalogue(overrides: Record<string, unknown> = {}) {
  serve('/api/exercises', {
    exercises: [NUQUE, SOUFFLE],
    countsByType: { STRETCHING: 6, BREATHING: 5, MEDITATION: 4 },
    doneToday: 0,
    windowDays: 28,
    favoriteTypes: ['BREATHING'],
    ...overrides,
  })
}

describe('la carte d\'exercice', () => {
  it('porte la famille, la durée, le titre et la description', async () => {
    servirCatalogue()

    const cartes = (await mountAsync(CataloguePage)).findAll('ul li')

    expect(cartes).toHaveLength(2)
    expect(cartes[0]!.text()).toContain('Étirement')
    expect(cartes[0]!.text()).toContain('2 min')
    expect(cartes[0]!.text()).toContain('Nuque douce')
    expect(cartes[0]!.text()).toContain('Relâcher les trapèzes')
  })

  /**
   * La couleur ne porte jamais l'information seule : chaque carte affiche aussi
   * le libellé de la famille. La teinte est un repère, pas un code — sans quoi
   * la famille serait illisible en noir et blanc.
   */
  it('nomme la famille en plus de la teinter', async () => {
    servirCatalogue()

    const carte = (await mountAsync(CataloguePage)).findAll('ul li')[1]!

    expect(carte.html()).toContain('bg-accent-soft')
    expect(carte.text()).toContain('Respiration')
  })

  /** Le lien porte le titre : c'est ce qu'annonce un lecteur d'écran qui liste les liens. */
  it('mène au déroulé par un lien qui porte le titre', async () => {
    servirCatalogue()

    const liens = (await mountAsync(CataloguePage)).findAll('ul li a')

    expect(liens[0]!.attributes('href')).toBe('/exercices/nuque-douce')
    expect(liens[0]!.text()).toBe('Nuque douce')
  })

  it('signale les familles cochées dans le profil sans masquer les autres', async () => {
    servirCatalogue()

    const cartes = (await mountAsync(CataloguePage)).findAll('ul li')

    expect(cartes[1]!.text()).toContain('Dans vos préférences')
    // Le catalogue reste un catalogue : une préférence déclarée un jour ne doit
    // pas enfermer.
    expect(cartes[0]!.text()).not.toContain('Dans vos préférences')
  })

  it('rappelle ce qui a déjà été fait, et le distingue d\'aujourd\'hui', async () => {
    servirCatalogue({
      exercises: [
        { ...NUQUE, activity: { count: 3, doneToday: false } },
        { ...SOUFFLE, activity: { count: 1, doneToday: true } },
      ],
    })

    const cartes = (await mountAsync(CataloguePage)).findAll('ul li')

    expect(cartes[0]!.text()).toContain('Fait 3 fois')
    expect(cartes[0]!.text()).toContain('ces 28 derniers jours')
    expect(cartes[1]!.text()).toContain('Fait aujourd\'hui')
  })

  /**
   * CU-08.1 — F4 demande une réalisation enregistrable « en une interaction ».
   * La proposer depuis la liste évite un aller-retour à qui connaît déjà
   * l'exercice par cœur.
   */
  it('déclare la réalisation en une interaction, depuis la carte', async () => {
    servirCatalogue()
    $fetch.mockResolvedValue({ repeated: false })

    const wrapper = await mountAsync(CataloguePage)
    await wrapper.findAll('ul li button')[0]!.trigger('click')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/exercises/nuque-douce/log', { method: 'POST' })
    expect(wrapper.text()).toContain('« Nuque douce » enregistré')
  })

  /** Une déclaration déjà comptée n'est pas un échec : le message le dit sans reprocher. */
  it('ne présente pas une déclaration répétée comme une erreur', async () => {
    servirCatalogue()
    $fetch.mockResolvedValue({ repeated: true })

    const wrapper = await mountAsync(CataloguePage)
    await wrapper.findAll('ul li button')[0]!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Rien n\'a été compté deux fois')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('les filtres du catalogue', () => {
  /**
   * L'état des filtres vit dans l'URL, et nulle part ailleurs : un catalogue
   * filtré se partage et se met en favori, le bouton « précédent » défait un
   * filtre, et le retour depuis une fiche retrouve la liste telle qu'elle était.
   */
  it('écrit le filtre choisi dans l\'adresse, et non dans un état local', async () => {
    servirCatalogue()

    const wrapper = await mountAsync(CataloguePage)
    const boutons = wrapper.findAll('section button')

    await boutons[0]!.trigger('click')

    expect(router.push).toHaveBeenCalledWith({ query: { type: 'STRETCHING' } })
  })

  /** `undefined` retire le filtre au lieu de le poser à vide : `?type=` ne veut rien dire. */
  it('retire le filtre plutôt que de le laisser vide dans l\'adresse', async () => {
    route.query = { type: 'STRETCHING' }
    servirCatalogue()

    const wrapper = await mountAsync(CataloguePage)
    await wrapper.findAll('section button')[0]!.trigger('click')

    expect(router.push).toHaveBeenCalledWith({ query: {} })
  })

  it('propose de rouvrir tout le catalogue quand aucun exercice ne correspond', async () => {
    servirCatalogue({ exercises: [] })

    const wrapper = await mountAsync(CataloguePage)

    expect(wrapper.find('ul').exists()).toBe(false)
    expect(wrapper.text()).toContain('Aucun exercice ne correspond à ces filtres')
  })
})
