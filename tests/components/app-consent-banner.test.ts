import { describe, expect, it } from 'vitest'
import AppConsentBanner from '../../app/components/AppConsentBanner.vue'
import { $fetch, mountAsync, serve } from '../helpers/vue'

/**
 * CU-04 — le bandeau de consentement à la mesure d'audience.
 *
 * **Le test central de ce fichier est celui de l'égalité des deux boutons.** La
 * recommandation de la CNIL demande que refuser soit aussi simple qu'accepter,
 * et F10 le reprend mot pour mot. Un refus grisé, plus petit ou repoussé en
 * dessous respecterait la lettre du « un seul clic » en trahissant le reste.
 *
 * C'est aussi le genre d'exigence qu'une relecture humaine laisse passer : deux
 * boutons se ressemblent tant qu'on ne compare pas leurs classes caractère par
 * caractère. Une machine, si.
 */

function servirConsentement(analytics: boolean | null) {
  serve('/api/consent', {
    policyVersion: 'v1',
    analytics,
    analyticsDecidedAt: null,
    wellbeing: null,
    wellbeingDecidedAt: null,
  })
}

describe('AppConsentBanner — poser la question', () => {
  it('s\'affiche tant qu\'aucune décision valide n\'a été prise', async () => {
    servirConsentement(null)

    const wrapper = await mountAsync(AppConsentBanner)

    expect(wrapper.find('section').exists()).toBe(true)
    expect(wrapper.text()).toContain('Mesure d\'audience')
  })

  /**
   * Refuser n'est pas une décision à reposer : le bandeau disparaît aussi bien
   * après un refus qu'après une acceptation.
   */
  it('disparaît dès qu\'une décision est en vigueur, quelle qu\'elle soit', async () => {
    for (const decision of [true, false]) {
      servirConsentement(decision)

      const wrapper = await mountAsync(AppConsentBanner)

      expect(wrapper.find('section').exists(), String(decision)).toBe(false)
    }
  })

  /** L'exigence F10, vérifiée au caractère près sur ce que le navigateur reçoit. */
  it('donne exactement les mêmes classes aux deux boutons', async () => {
    servirConsentement(null)

    const wrapper = await mountAsync(AppConsentBanner)
    const boutons = wrapper.findAll('section button')

    expect(boutons).toHaveLength(2)
    expect(boutons[0]!.text()).toBe('Refuser')
    expect(boutons[1]!.text()).toBe('Accepter')
    expect(boutons[0]!.attributes('class')).toBe(boutons[1]!.attributes('class'))
  })

  /**
   * Le bandeau ne bloque pas la page. Une fenêtre modale forcerait la décision
   * pour atteindre le contenu, ce qui rendrait le consentement moins libre — et
   * poserait au passage un piège à clavier sur toutes les pages du produit.
   */
  it('ne bloque pas la page et renvoie à la politique de confidentialité', async () => {
    servirConsentement(null)

    const wrapper = await mountAsync(AppConsentBanner)

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('[aria-modal]').exists()).toBe(false)
    expect(wrapper.find('a[href="/confidentialite"]').exists()).toBe(true)
  })

  it('enregistre le refus comme l\'acceptation, en un seul clic', async () => {
    servirConsentement(null)
    $fetch.mockResolvedValue({ analytics: false })

    const wrapper = await mountAsync(AppConsentBanner)
    await wrapper.findAll('section button')[0]!.trigger('click')

    expect($fetch).toHaveBeenCalledWith('/api/consent', {
      method: 'PUT',
      body: { analytics: false },
    })
  })

  /**
   * Le refus d'enregistrement ne referme pas le bandeau : le laisser disparaître
   * laisserait croire que le choix est pris alors qu'il n'est consigné nulle part.
   */
  it('reste ouvert et le dit quand le choix n\'a pas pu être enregistré', async () => {
    servirConsentement(null)
    $fetch.mockRejectedValue(new Error('réseau'))

    const wrapper = await mountAsync(AppConsentBanner)
    await wrapper.findAll('section button')[1]!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('section').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toContain('n\'a pas pu être enregistré')
  })
})
