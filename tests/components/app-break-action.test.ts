import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppBreakAction from '../../app/components/AppBreakAction.vue'
import { $fetch, navigateTo } from '../helpers/vue'

/**
 * CU-07, point 1 du scénario nominal — « le collaborateur démarre une pause
 * depuis n'importe quel écran, **en une interaction** », et point 2 — « le
 * système enregistre l'heure de début **et affiche le minuteur** ».
 *
 * Les deux points sont vérifiés ici : un clic, un appel, une navigation. Le cas
 * intéressant est le troisième — la pause déjà en cours. Du point de vue de la
 * personne, le résultat voulu est atteint : elle **est** en pause. On la mène au
 * minuteur sans rien lui reprocher.
 */

/** Une erreur de `$fetch`, telle que Nitro l'emballe. */
function apiError(code: string, message: string) {
  return { data: { statusMessage: message, data: { code } } }
}

describe('AppBreakAction — démarrer une pause en une interaction', () => {
  it('démarre la pause puis mène au minuteur', async () => {
    $fetch.mockResolvedValue({ current: { id: 'brk_1' } })
    const wrapper = mount(AppBreakAction)

    await wrapper.find('button').trigger('click')

    expect($fetch).toHaveBeenCalledWith('/api/breaks', { method: 'POST' })
    expect(navigateTo).toHaveBeenCalledWith('/pauses')
  })

  /**
   * Le second onglet, le retour arrière et le double clic produisent tous le 409
   * de `POST /api/breaks`. Ce n'est pas une erreur à afficher : c'est l'état
   * voulu, atteint autrement.
   */
  it('mène au minuteur sans rien reprocher quand une pause est déjà en cours', async () => {
    $fetch.mockRejectedValue(apiError('break_already_running', 'Une pause est déjà en cours.'))
    const wrapper = mount(AppBreakAction)

    await wrapper.find('button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(navigateTo).toHaveBeenCalledWith('/pauses')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  /**
   * Les autres échecs restent affichés sur place : la pause n'a pas démarré,
   * emmener la personne sur un minuteur à l'arrêt sans un mot serait un mensonge
   * par omission.
   */
  it('affiche l\'échec sur place, et ne navigue pas, quand la pause n\'a pas démarré', async () => {
    $fetch.mockRejectedValue(apiError('internal', 'Le service est indisponible.'))
    const wrapper = mount(AppBreakAction)

    await wrapper.find('button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(navigateTo).not.toHaveBeenCalled()
    // `role="alert"` : l'échec survient après le clic, il doit être annoncé sans
    // que la personne ait à repartir à sa recherche.
    expect(wrapper.find('[role="alert"]').text()).toBe('Le service est indisponible.')
  })

  it('désarme le bouton pendant l\'appel', async () => {
    let resoudre: (value: unknown) => void = () => {}
    $fetch.mockReturnValue(new Promise((resolve) => { resoudre = resolve }))
    const wrapper = mount(AppBreakAction)

    await wrapper.find('button').trigger('click')

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').text()).toBe('Démarrage…')

    resoudre({})
  })

  it('accepte un libellé propre à l\'écran qui l\'accueille', () => {
    const wrapper = mount(AppBreakAction, { props: { label: 'Souffler deux minutes' } })

    expect(wrapper.find('button').text()).toBe('Souffler deux minutes')
  })
})
