import { describe, expect, it } from 'vitest'
import MoodPage from '../../app/pages/humeur.vue'
import { $fetch, mountAsync, serve } from '../helpers/vue'

/**
 * CU-09 — l'écran de déclaration d'humeur.
 *
 * Trois exigences se rencontrent ici, et l'écran doit les tenir ensemble :
 *
 * - **F5 : rien n'est pré-coché**, et les deux échelles vont ensemble ;
 * - **CU-04 : le consentement conditionne le formulaire** — et il a trois états,
 *   pas deux. « Jamais demandé » appelle la question, « retiré » appelle une
 *   explication ;
 * - **A1 : la correction remplace**, et le message doit le dire.
 */

function servirEcran(overrides: Record<string, unknown> = {}) {
  serve('/api/mood', {
    today: null,
    history: [],
    days: 14,
    consent: 'granted',
    ...overrides,
  })
}

describe('l\'écran de déclaration', () => {
  it('ouvre le formulaire vierge quand rien n\'a été déclaré', async () => {
    servirEcran()

    const wrapper = await mountAsync(MoodPage)
    const inputs = wrapper.findAll('input[type="radio"]')

    expect(inputs).toHaveLength(10)
    expect(inputs.some(input => (input.element as HTMLInputElement).checked)).toBe(false)
  })

  /** A1 de CU-09 : une déclaration déjà faite rouvre le formulaire sur ses valeurs. */
  it('rouvre le formulaire sur la déclaration du jour', async () => {
    servirEcran({ today: { date: '2026-08-27', mood: 4, stress: 2 } })

    const wrapper = await mountAsync(MoodPage)
    const coches = wrapper.findAll('input[type="radio"]')
      .filter(input => (input.element as HTMLInputElement).checked)
      .map(input => (input.element as HTMLInputElement).value)

    expect(coches).toEqual(['4', '2'])
  })

  /**
   * Le refus est prononcé **avant** l'appel réseau et rattaché au champ manquant
   * plutôt qu'au formulaire : c'est la même forme de message que celle du
   * serveur, qui répond par champ. La personne voit ce qu'il lui reste à faire,
   * pas qu'elle s'est trompée.
   */
  it('refuse une déclaration incomplète sans appeler le serveur, champ par champ', async () => {
    servirEcran()

    const wrapper = await mountAsync(MoodPage)
    await wrapper.find('form').trigger('submit')

    expect($fetch).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Choisissez un niveau d\'humeur.')
    expect(wrapper.text()).toContain('Choisissez un niveau de stress.')
  })

  it('envoie les deux échelles ensemble', async () => {
    servirEcran()
    $fetch.mockResolvedValue({ today: { date: '2026-08-27', mood: 5, stress: 1 } })

    const wrapper = await mountAsync(MoodPage)
    const inputs = wrapper.findAll('input[type="radio"]')
    await inputs[4]!.setValue()
    await inputs[5]!.setValue()
    await wrapper.find('form').trigger('submit')

    expect($fetch).toHaveBeenCalledWith('/api/mood/today', {
      method: 'PUT',
      body: { mood: 5, stress: 1 },
    })
  })

  /** La correction remplace : le message le dit, sinon on croit avoir ajouté une ligne. */
  it('distingue l\'enregistrement de la correction dans son message', async () => {
    servirEcran({ today: { date: '2026-08-27', mood: 3, stress: 3 } })
    $fetch.mockResolvedValue({})

    const wrapper = await mountAsync(MoodPage)
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('C\'est la nouvelle valeur qui est conservée')
  })

  it('affiche le refus du serveur sur le champ concerné', async () => {
    servirEcran()
    $fetch.mockRejectedValue({
      data: {
        statusMessage: 'Données invalides',
        data: { errors: { mood: ['Humeur invalide.'] } },
      },
    })

    const wrapper = await mountAsync(MoodPage)
    const inputs = wrapper.findAll('input[type="radio"]')
    await inputs[2]!.setValue()
    await inputs[7]!.setValue()
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Humeur invalide.')
  })
})

describe('l\'écran de déclaration face au consentement', () => {
  /**
   * Exception E1 de CU-09 : consentement retiré, le formulaire n'est plus
   * proposé. Le dire, plutôt que l'afficher et refuser à l'envoi.
   */
  it('ferme le formulaire et l\'explique quand le consentement a été retiré', async () => {
    servirEcran({ consent: 'withdrawn' })

    const wrapper = await mountAsync(MoodPage)

    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('Le suivi de votre bien-être est désactivé')
    expect(wrapper.find('a[href="/mes-donnees"]').exists()).toBe(true)
  })

  /**
   * « Jamais demandé » n'est pas « refusé ». C'est le seul chemin par lequel
   * quelqu'un peut dire oui — sans lui, fermer la tolérance du serveur
   * reviendrait à fermer le formulaire pour de bon.
   */
  it('pose la question quand le consentement n\'a jamais été demandé', async () => {
    servirEcran({ consent: 'unknown' })

    const wrapper = await mountAsync(MoodPage)

    expect(wrapper.text()).toContain('Avant de déclarer, une question')
    expect(wrapper.find('a[href="/confidentialite"]').exists()).toBe(true)
  })

  it('enregistre l\'accord et relit l\'état', async () => {
    servirEcran({ consent: 'unknown' })
    $fetch.mockResolvedValue({})

    const wrapper = await mountAsync(MoodPage)
    await wrapper.find('section button').trigger('click')

    expect($fetch).toHaveBeenCalledWith('/api/consent', {
      method: 'PUT',
      body: { wellbeing: true },
    })
  })

  it('dit quand l\'accord n\'a pas pu être enregistré', async () => {
    servirEcran({ consent: 'unknown' })
    $fetch.mockRejectedValue(new Error('réseau'))

    const wrapper = await mountAsync(MoodPage)
    await wrapper.find('section button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="alert"]').text()).toContain('n\'a pas pu être enregistré')
  })
})

describe('la série des quatorze jours', () => {
  /**
   * A2 de CU-09 : la moyenne porte sur les seules journées déclarées. Rapportée
   * aux quatorze jours, elle compterait les week-ends comme des zéros — le
   * contresens que l'alternative demande justement d'éviter.
   */
  it('ne moyenne que les journées déclarées', async () => {
    servirEcran({
      history: [
        { date: '2026-08-25', mood: 4, stress: 2 },
        { date: '2026-08-26', mood: 2, stress: 4 },
      ],
    })

    const wrapper = await mountAsync(MoodPage)

    // Moyenne sur deux journées, pas sur quatorze.
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).not.toContain('0,4')
  })

  /** Un graphique n'est rien pour un lecteur d'écran : la même information est donnée en phrase. */
  it('double la série d\'un résumé lisible à la voix', async () => {
    servirEcran({ history: [{ date: '2026-08-26', mood: 4, stress: 2 }] })

    const html = (await mountAsync(MoodPage)).html()

    expect(html).toContain('Humeur des 14 derniers jours')
  })
})
