import { describe, expect, it } from 'vitest'
import DashboardPage from '../../app/pages/tableau-de-bord.vue'
import StatsPage from '../../app/pages/statistiques.vue'
import { $fetch, mountAsync, route, router, serve, userSession } from '../helpers/vue'

/**
 * CU-10 et CU-11 — le tableau de bord et les statistiques personnelles.
 *
 * Deux écrans, deux questions : « et là, maintenant ? » d'un côté, « comment
 * j'évolue ? » de l'autre. Ce qu'ils ont en commun est ce qu'ils s'interdisent —
 * F7 exclut nommément tout score global et toute comparaison avec d'autres
 * utilisateurs. La seule comparaison autorisée est celle de soi-même à la
 * période précédente.
 */

const PREFERENCES = {
  workStartHour: 9,
  workEndHour: 18,
  remindersEnabled: true,
  reminderIntervalMin: 90,
  favoriteTypes: ['BREATHING'],
}

const RECOMMENDATION = {
  rule: 'stress_high',
  reason: 'Vous avez déclaré un stress élevé aujourd\'hui.',
  exercise: {
    id: 'exr_1',
    slug: 'souffle-4-7-8',
    title: 'Souffle 4-7-8',
    description: 'Une respiration lente pour redescendre.',
    type: 'BREATHING',
    durationMin: 4,
  },
}

/** Une semaine complète, avec des journées non déclarées. */
const WEEK = [
  { date: '2026-08-21', mood: null, stress: null },
  { date: '2026-08-22', mood: 3, stress: 3 },
  { date: '2026-08-23', mood: null, stress: null },
  { date: '2026-08-24', mood: null, stress: null },
  { date: '2026-08-25', mood: 4, stress: 2 },
  { date: '2026-08-26', mood: 4, stress: 2 },
  { date: '2026-08-27', mood: 5, stress: 1 },
]

function servirTableauDeBord(overrides: Record<string, unknown> = {}) {
  serve('/api/dashboard', {
    breaks: { current: null, taken: 2, totalSec: 900, goal: 6, lastEndedAt: null },
    sitting: { minutes: 45, basis: 'break' },
    mood: { today: { date: '2026-08-27', mood: 5, stress: 1 }, week: WEEK },
    exercises: { doneToday: 1 },
    recommendation: RECOMMENDATION,
    preferences: PREFERENCES,
    ...overrides,
  })
}

describe('le tableau de bord (CU-10, CU-11)', () => {
  it('salue la personne par son prénom et donne l\'état du jour', async () => {
    userSession.user.value = { firstName: 'Sofia' }
    servirTableauDeBord()

    const texte = (await mountAsync(DashboardPage)).text()

    expect(texte).toContain('Bonjour, Sofia')
    expect(texte).toContain('2 / 6')
  })

  /**
   * Le temps assis part de la valeur du **serveur** : c'est lui qui sait où
   * commence la journée déclarée. Ce qui est écrit dessous doit dire d'où il
   * part, faute de quoi le compteur ne veut rien dire.
   */
  it('dit d\'où part le compteur de temps assis', async () => {
    servirTableauDeBord()

    expect((await mountAsync(DashboardPage)).text()).toContain('depuis votre dernière pause')

    servirTableauDeBord({ sitting: { minutes: 120, basis: 'day' } })

    const surLaJournee = await mountAsync(DashboardPage)
    expect(surLaJournee.text()).toContain('depuis le début de votre journée')
    expect(surLaJournee.text()).toContain('2 h 00')
  })

  /**
   * Les journées non déclarées gardent leur place, avec une humeur à `null` :
   * les tasser donnerait une série de barres contiguës qui se lirait comme
   * quatre jours de suite. La place vide dit quelque chose de juste.
   */
  it('garde la place des journées non déclarées dans la semaine', async () => {
    servirTableauDeBord()

    const html = (await mountAsync(DashboardPage)).html()

    // Sept journées, dont quatre déclarées : la teinte neutre marque les autres.
    expect(html).toContain('bg-mist-300')
    expect(html).toContain('Les autres journées n\'ont pas été déclarées')
  })

  /** Un graphique n'est rien pour un lecteur d'écran : la série est doublée d'une phrase. */
  it('double la série d\'un résumé lisible à la voix', async () => {
    servirTableauDeBord()

    expect((await mountAsync(DashboardPage)).html())
      .toContain('Humeur des sept derniers jours')
  })

  it('invite à ouvrir la série quand rien n\'a été déclaré', async () => {
    servirTableauDeBord({
      mood: { today: null, week: WEEK.map(day => ({ ...day, mood: null, stress: null })) },
    })

    const texte = (await mountAsync(DashboardPage)).text()

    expect(texte).toContain('Aucune déclaration cette semaine')
    expect(texte).toContain('Déclarer mon humeur')
  })

  /** CU-10 — le motif est affiché à côté de la suggestion, jamais la suggestion seule. */
  it('affiche la suggestion avec son motif', async () => {
    servirTableauDeBord()

    const texte = (await mountAsync(DashboardPage)).text()

    expect(texte).toContain('Souffle 4-7-8')
    expect(texte).toContain('Vous avez déclaré un stress élevé aujourd\'hui.')
  })

  /** CU-08.1 — déclarer l'exercice recommandé sans quitter l'écran. */
  it('déclare l\'exercice recommandé depuis le tableau de bord', async () => {
    servirTableauDeBord()
    $fetch.mockResolvedValue({ repeated: false })

    const wrapper = await mountAsync(DashboardPage)
    const bouton = wrapper.findAll('button').find(b => b.text().includes('fait'))

    await bouton!.trigger('click')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/exercises/souffle-4-7-8/log', { method: 'POST' })
    expect(wrapper.text()).toContain('Exercice enregistré')
  })

  /** F7 : ni score composite, ni comparaison avec d'autres. */
  it('n\'affiche aucun score global ni aucune comparaison avec autrui', async () => {
    servirTableauDeBord()

    const texte = (await mountAsync(DashboardPage)).text().toLowerCase()

    for (const interdit of ['score', 'classement', 'moyenne de l\'équipe', 'vs collègues']) {
      expect(texte).not.toContain(interdit)
    }
  })
})

describe('l\'écran des statistiques (CU-11)', () => {
  function servirStats(overrides: Record<string, unknown> = {}) {
    serve('/api/stats', {
      period: 'semaine',
      days: 7,
      series: WEEK.map(day => ({
        date: day.date,
        breaks: 3,
        breakSec: 900,
        exercises: 1,
        mood: day.mood,
        stress: day.stress,
      })),
      totals: { breaks: 21, breakSec: 6300, exercises: 7, moodAvg: 4, stressAvg: 2 },
      trends: { breaks: 4, exercises: -1, mood: 0.3, stress: -0.4 },
      previous: { breaks: 17, breakSec: 5100, exercises: 8, moodAvg: 3.7, stressAvg: 2.4 },
      ...overrides,
    })
  }

  it('affiche les totaux de la période et l\'écart avec la précédente', async () => {
    servirStats()

    const texte = (await mountAsync(StatsPage)).text()

    expect(texte).toContain('21')
    expect(texte).toContain('vs période précédente')
  })

  /** F7 en demande deux, sélectionnables : la semaine et le mois, et rien d'autre. */
  it('propose exactement deux périodes, et les écrit dans l\'adresse', async () => {
    servirStats()

    const wrapper = await mountAsync(StatsPage)
    const periodes = wrapper.findAll('[role="group"] button')

    expect(periodes).toHaveLength(2)

    await periodes[1]!.trigger('click')

    expect(router.push).toHaveBeenCalledWith({ query: { periode: 'mois' } })
  })

  it('lit la période depuis l\'adresse', async () => {
    route.query = { periode: 'mois' }
    servirStats({ period: 'mois', days: 30 })

    const wrapper = await mountAsync(StatsPage)

    expect(wrapper.findAll('[role="group"] button')[1]!.attributes('aria-pressed')).toBe('true')
  })

  /** Une tendance nulle se dit, plutôt que de s'afficher comme un zéro. */
  it('dit qu\'il n\'y a rien à comparer quand rien n\'a été déclaré', async () => {
    servirStats({
      totals: { breaks: 0, breakSec: 0, exercises: 0, moodAvg: null, stressAvg: null },
      trends: { breaks: null, exercises: null, mood: null, stress: null },
    })

    expect((await mountAsync(StatsPage)).text()).toContain('pas de point de comparaison')
  })
})
