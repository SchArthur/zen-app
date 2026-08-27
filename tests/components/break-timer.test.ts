import { describe, expect, it } from 'vitest'
import BreaksPage from '../../app/pages/pauses/index.vue'
import { $fetch, mountAsync, serve } from '../helpers/vue'

/**
 * CU-07 — l'écran du minuteur.
 *
 * Le point qui mérite un test ici est celui qu'on ne voit pas : **tout est
 * dérivé de la réponse du serveur**, rien n'est recopié dans un état local.
 * C'est ce qui remet l'écran d'aplomb quand une pause a été ouverte depuis un
 * autre onglet — et c'est aussi ce qui se casse le plus facilement en
 * refactorisant.
 */

const PREFERENCES = {
  workStartHour: 9,
  workEndHour: 18,
  remindersEnabled: true,
  reminderIntervalMin: 90,
  favoriteTypes: [],
}

/** Une journée d'historique, telle que le serveur la découpe. */
function jour(date: string, sessions: { id: string, startedAt: string, endedAt: string, durationSec: number }[]) {
  return {
    date,
    sessions,
    count: sessions.length,
    totalSec: sessions.reduce((total, session) => total + session.durationSec, 0),
  }
}

function servirEcran(overrides: Record<string, unknown> = {}) {
  serve('/api/breaks', {
    current: null,
    days: [jour('2026-08-27', []), jour('2026-08-26', [])],
    goal: 6,
    preferences: PREFERENCES,
    ...overrides,
  })
}

describe('le minuteur', () => {
  it('est à l\'arrêt quand aucune pause n\'est en cours', async () => {
    servirEcran()

    const wrapper = await mountAsync(BreaksPage)

    expect(wrapper.text()).toContain('00:00')
    expect(wrapper.text()).toContain('minuteur à l\'arrêt')
    expect(wrapper.text()).toContain('Prêt pour une pause')
  })

  /**
   * L'écoulé du premier rendu est celui **du serveur** ; l'horloge du navigateur
   * prend ensuite le relais. Les deux doivent donner la même valeur, faute de
   * quoi Vue signalerait un écart de rendu à l'hydratation — d'où une heure de
   * début réellement située dans le passé.
   */
  it('affiche l\'écoulé de la pause en cours, et le dit en cours', async () => {
    servirEcran({
      current: {
        id: 'brk_1',
        startedAt: new Date(Date.now() - 252_000).toISOString(),
        elapsedSec: 252,
      },
    })

    const wrapper = await mountAsync(BreaksPage)

    expect(wrapper.text()).toContain('04:1')
    expect(wrapper.text()).toContain('pause en cours')
    expect(wrapper.text()).toContain('Arrêter la pause')
  })

  it('démarre une pause et le confirme', async () => {
    servirEcran()
    $fetch.mockResolvedValue({ current: { id: 'brk_1' } })

    const wrapper = await mountAsync(BreaksPage)
    await wrapper.findAll('button').find(button => button.text() === 'Démarrer une pause')!.trigger('click')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/breaks', { method: 'POST' })
    expect(wrapper.text()).toContain('Pause démarrée')
  })

  it('arrête la pause et annonce sa durée', async () => {
    servirEcran({
      current: { id: 'brk_1', startedAt: new Date().toISOString(), elapsedSec: 60 },
    })
    $fetch.mockResolvedValue({ session: { durationSec: 725 } })

    const wrapper = await mountAsync(BreaksPage)
    await wrapper.findAll('button').find(button => button.text() === 'Arrêter la pause')!.trigger('click')
    await wrapper.vm.$nextTick()

    expect($fetch).toHaveBeenCalledWith('/api/breaks/current', { method: 'PATCH' })
    expect(wrapper.text()).toContain('Pause de 12 min enregistrée')
  })

  /**
   * Un refus vient presque toujours d'un écart entre ce que l'écran croit et ce
   * qui est enregistré — un second onglet, un retour arrière. Le message est
   * affiché, et l'état relu.
   */
  it('affiche le refus du serveur au lieu de faire comme si', async () => {
    servirEcran()
    $fetch.mockRejectedValue({
      data: {
        statusMessage: 'Une pause est déjà en cours.',
        data: { code: 'break_already_running' },
      },
    })

    const wrapper = await mountAsync(BreaksPage)
    await wrapper.findAll('button').find(button => button.text() === 'Démarrer une pause')!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="alert"]').text()).toContain('Une pause est déjà en cours.')
  })
})

describe('le décompte du jour', () => {
  it('rapporte les pauses du jour à l\'objectif tiré des préférences', async () => {
    servirEcran({
      days: [
        jour('2026-08-27', [
          { id: 'brk_1', startedAt: '2026-08-27T07:00:00.000Z', endedAt: '2026-08-27T07:10:00.000Z', durationSec: 600 },
          { id: 'brk_2', startedAt: '2026-08-27T09:00:00.000Z', endedAt: '2026-08-27T09:05:00.000Z', durationSec: 300 },
        ]),
      ],
    })

    const wrapper = await mountAsync(BreaksPage)

    expect(wrapper.text()).toContain('2 / 6')
    expect(wrapper.text()).toContain('pauses prises · 15 min au total')
  })

  /** Le décompte est aussi une image : elle a besoin d'une description. */
  it('décrit le décompte pour les lecteurs d\'écran', async () => {
    servirEcran()

    const wrapper = await mountAsync(BreaksPage)

    expect(wrapper.find('[role="img"]').attributes('aria-label'))
      .toBe('0 pauses prises sur un objectif de 6.')
  })

  it('accorde le singulier à une seule pause', async () => {
    servirEcran({
      days: [
        jour('2026-08-27', [
          { id: 'brk_1', startedAt: '2026-08-27T07:00:00.000Z', endedAt: '2026-08-27T07:10:00.000Z', durationSec: 600 },
        ]),
      ],
    })

    const wrapper = await mountAsync(BreaksPage)

    expect(wrapper.text()).toContain('pause prise · 10 min au total')
    expect(wrapper.find('[role="img"]').attributes('aria-label'))
      .toBe('1 pause prise sur un objectif de 6.')
  })
})
