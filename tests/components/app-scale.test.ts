import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppScale from '../../app/components/AppScale.vue'
import { moodLevels } from '../../app/utils/mood'

/**
 * CU-09 — l'échelle du formulaire d'humeur.
 *
 * Deux exigences se vérifient ici et nulle part ailleurs, parce qu'elles portent
 * sur le rendu :
 *
 * - **F5 : aucune valeur pré-cochée.** Une valeur par défaut serait envoyée
 *   telle quelle par tous ceux qui ouvrent l'écran sans y penser, et le produit
 *   croirait mesurer un ressenti alors qu'il mesurerait une inertie.
 * - **De vrais boutons radio.** La navigation au clavier, le regroupement par
 *   `name` et l'annonce « 3 sur 5 » par les lecteurs d'écran sont alors ceux du
 *   navigateur. Un `role="radiogroup"` posé sur des `<button>` obligerait à les
 *   réécrire à la main, moins bien.
 */

function monter(props: Record<string, unknown> = {}) {
  return mount(AppScale, {
    props: {
      id: 'humeur',
      legend: 'Comment vous sentez-vous ?',
      levels: moodLevels,
      modelValue: null,
      ...props,
    },
  })
}

describe('AppScale — l\'échelle à cinq niveaux', () => {
  it('n\'a aucun niveau pré-coché à l\'ouverture', () => {
    const inputs = monter().findAll('input[type="radio"]')

    expect(inputs).toHaveLength(5)
    expect(inputs.some(input => (input.element as HTMLInputElement).checked)).toBe(false)
  })

  it('est bâtie sur de vrais boutons radio, regroupés par leur nom', () => {
    const inputs = monter().findAll('input[type="radio"]')

    for (const input of inputs) {
      expect(input.attributes('name')).toBe('humeur')
    }
  })

  /** Le libellé est toujours affiché, jamais réservé à une infobulle — qui n'existe pas au doigt. */
  it('affiche le libellé de chaque niveau', () => {
    const texte = monter().text()

    for (const level of moodLevels) expect(texte).toContain(level.label)
  })

  it('remonte le niveau choisi', async () => {
    const wrapper = monter()

    await wrapper.findAll('input[type="radio"]')[3]!.setValue()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([4])
  })

  it('rouvre le formulaire sur une déclaration déjà faite (A1)', () => {
    const inputs = monter({ modelValue: 2 }).findAll('input[type="radio"]')

    expect((inputs[1]!.element as HTMLInputElement).checked).toBe(true)
  })

  /**
   * Le câblage ARIA est la partie qu'on abîme en la recopiant : `aria-describedby`
   * ne doit désigner que des éléments réellement présents, sous peine de renvoyer
   * les lecteurs d'écran vers du vide.
   */
  it('ne renvoie vers une aide ou une erreur que si elle existe', () => {
    expect(monter().find('fieldset').attributes('aria-describedby')).toBeUndefined()

    const avecAide = monter({ hint: 'Une seule déclaration par jour.' })
    expect(avecAide.find('fieldset').attributes('aria-describedby')).toBe('humeur-hint')
    expect(avecAide.find('#humeur-hint').exists()).toBe(true)

    const avecErreur = monter({
      hint: 'Une seule déclaration par jour.',
      errors: ['Choisissez un niveau d\'humeur.'],
    })
    expect(avecErreur.find('fieldset').attributes('aria-describedby')).toBe('humeur-hint humeur-error')
    expect(avecErreur.find('#humeur-error').text()).toContain('Choisissez un niveau')
  })

  it('marque les saisies comme invalides quand un motif de refus est donné', () => {
    const wrapper = monter({ errors: ['Choisissez un niveau d\'humeur.'] })

    for (const input of wrapper.findAll('input[type="radio"]')) {
      expect(input.attributes('aria-invalid')).toBe('true')
    }
  })
})
