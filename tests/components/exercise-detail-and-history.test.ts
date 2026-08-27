import { describe, expect, it } from 'vitest'
import ExerciseDetailPage from '../../app/pages/exercices/[slug].vue'
import HistoryPage from '../../app/pages/pauses/historique.vue'
import { $fetch, mountAsync, route, router, serve } from '../helpers/vue'

/**
 * CU-08 — la fiche détaillée d'un exercice, et la postcondition de CU-07 —
 * « une pause horodatée est visible dans l'historique ».
 *
 * Les deux écrans ont en commun de rendre lisible une donnée que le serveur
 * livre brute : un déroulé pas à pas d'un côté, une année de pauses de l'autre.
 * C'est là que les décisions d'affichage se prennent, et elles se testent.
 */

const SOUFFLE = {
  id: 'exr_1',
  slug: 'souffle-4-7-8',
  title: 'Souffle 4-7-8',
  description: 'Une respiration lente pour redescendre.',
  type: 'BREATHING',
  durationMin: 4,
  steps: ['Inspirez 4 secondes', 'Retenez 7 secondes', 'Expirez 8 secondes'],
}

function servirFiche(overrides: Record<string, unknown> = {}) {
  route.params = { slug: 'souffle-4-7-8' }

  serve('/api/exercises/souffle-4-7-8', {
    exercise: SOUFFLE,
    activity: null,
    windowDays: 28,
    related: [
      { slug: 'souffle-carre', title: 'Souffle carré', durationMin: 3, type: 'BREATHING' },
    ],
    ...overrides,
  })
}

describe('la fiche d\'exercice (CU-08)', () => {
  /** F4 exigeait un déroulé pas à pas : sans lui, la « fiche détaillée » se réduit à une phrase. */
  it('affiche le déroulé pas à pas, dans l\'ordre', async () => {
    servirFiche()

    const wrapper = await mountAsync(ExerciseDetailPage)
    const etapes = wrapper.findAll('ol li')

    expect(etapes).toHaveLength(3)
    expect(etapes[0]!.text()).toContain('Inspirez 4 secondes')
    expect(etapes[2]!.text()).toContain('Expirez 8 secondes')
  })

  /** La fiche doit pouvoir se refermer sur une autre proposition, pas sur un cul-de-sac. */
  it('propose d\'autres exercices de la même famille et le retour au catalogue', async () => {
    servirFiche()

    const wrapper = await mountAsync(ExerciseDetailPage)

    expect(wrapper.find('a[href="/exercices"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/exercices/souffle-carre"]').exists()).toBe(true)
  })

  /** CU-08.1 — F4 demande une réalisation enregistrable en une interaction depuis la fiche. */
  it('déclare la réalisation en une interaction', async () => {
    servirFiche()
    $fetch.mockResolvedValue({ repeated: false })

    const wrapper = await mountAsync(ExerciseDetailPage)
    await wrapper.findAll('button').find(b => b.text().includes('fait'))!.trigger('click')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/exercises/souffle-4-7-8/log', { method: 'POST' })
    expect(wrapper.text()).toContain('Exercice enregistré')
  })

  it('ne présente pas une déclaration répétée comme une erreur', async () => {
    servirFiche()
    $fetch.mockResolvedValue({ repeated: true })

    const wrapper = await mountAsync(ExerciseDetailPage)
    await wrapper.findAll('button').find(b => b.text().includes('fait'))!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Rien n\'a été compté deux fois')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('rappelle ce qui a déjà été fait sur la fenêtre d\'activité', async () => {
    servirFiche({ activity: { count: 4, doneToday: false } })

    const texte = (await mountAsync(ExerciseDetailPage)).text()

    expect(texte).toContain('4')
    expect(texte).toContain('28')
  })
})

/** Une journée d'historique, telle que le serveur la découpe. */
function jour(date: string, count: number) {
  return {
    date,
    count,
    totalSec: count * 600,
    sessions: Array.from({ length: count }, (_, index) => ({
      id: `${date}-${index}`,
      startedAt: `${date}T07:00:00.000Z`,
      endedAt: `${date}T07:10:00.000Z`,
      durationSec: 600,
    })),
  }
}

/** `days` journées consécutives en remontant, la plus récente d'abord. */
function historique(days: number, countPerDay = 2) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 27) - index * 86_400_000)

    return jour(date.toISOString().slice(0, 10), countPerDay)
  })
}

describe('l\'historique des pauses (CU-07)', () => {
  function servirHistorique(days: number) {
    serve('/api/breaks', {
      current: null,
      days: historique(days),
      goal: 6,
      preferences: {
        workStartHour: 9,
        workEndHour: 18,
        remindersEnabled: true,
        reminderIntervalMin: 90,
        favoriteTypes: [],
      },
    })
  }

  it('ouvre sur les trente derniers jours, journée par journée', async () => {
    servirHistorique(30)

    const texte = (await mountAsync(HistoryPage)).text()

    expect(texte).toContain('Les 30 derniers jours, journée par journée.')
  })

  /**
   * Trois cent soixante-six barres dans la largeur d'un téléphone font des
   * traits de moins d'un pixel : le graphique cesse d'être lisible au moment
   * précis où on lui demande de montrer une tendance longue. Au-delà d'un mois,
   * les journées sont donc regroupées par semaine — et la phrase d'accroche
   * suit la maille réellement affichée.
   */
  it('regroupe par semaine au-delà d\'un mois, et le dit', async () => {
    route.query = { fenetre: 'annee' }
    servirHistorique(90)

    const texte = (await mountAsync(HistoryPage)).text()

    expect(texte).toContain('semaine par semaine')
  })

  /** La fenêtre vit dans l'URL : une vue se partage et se met en favori. */
  it('écrit la profondeur dans l\'adresse, et retire celle par défaut', async () => {
    servirHistorique(30)

    const wrapper = await mountAsync(HistoryPage)
    const fenetres = wrapper.findAll('[role="group"] button')

    expect(fenetres).toHaveLength(3)

    await fenetres[2]!.trigger('click')
    expect(router.push).toHaveBeenCalledWith({ query: { fenetre: 'annee' } })

    await fenetres[0]!.trigger('click')
    expect(router.push).toHaveBeenCalledWith({ query: {} })
  })

  /**
   * La moyenne porte sur les seules journées avec pause. Rapportée à toute la
   * fenêtre, elle intégrerait les week-ends et les congés et afficherait un
   * chiffre bas que rien ne permettrait de corriger.
   */
  it('ne moyenne que les journées où une pause a été prise', async () => {
    serve('/api/breaks', {
      current: null,
      days: [jour('2026-08-27', 4), jour('2026-08-26', 0), jour('2026-08-25', 0)],
      goal: 6,
      preferences: {
        workStartHour: 9,
        workEndHour: 18,
        remindersEnabled: true,
        reminderIntervalMin: 90,
        favoriteTypes: [],
      },
    })

    const texte = (await mountAsync(HistoryPage)).text()

    // Quatre pauses sur une seule journée active : la moyenne est 4, pas 1,3.
    expect(texte).toContain('4')
    expect(texte).not.toContain('1,3')
  })

  it('dit qu\'il n\'y a rien plutôt que d\'afficher un graphique vide', async () => {
    serve('/api/breaks', {
      current: null,
      days: [jour('2026-08-27', 0)],
      goal: 6,
      preferences: {
        workStartHour: 9,
        workEndHour: 18,
        remindersEnabled: true,
        reminderIntervalMin: 90,
        favoriteTypes: [],
      },
    })

    expect((await mountAsync(HistoryPage)).text().toLowerCase()).toContain('aucune pause')
  })
})
