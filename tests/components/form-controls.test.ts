import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppField from '../../app/components/AppField.vue'
import AppSelect from '../../app/components/AppSelect.vue'
import AppAlert from '../../app/components/AppAlert.vue'
import AppGauge from '../../app/components/AppGauge.vue'

/**
 * Les briques de formulaire et d'affichage partagées.
 *
 * Ce qui est testé ici est presque entièrement de l'**accessibilité**, et ce
 * n'est pas un hasard : ces composants existent précisément parce que le câblage
 * ARIA est la partie qu'on abîme en la recopiant d'un écran à l'autre.
 * `aria-describedby` ne doit désigner que des éléments réellement présents, sous
 * peine de renvoyer les lecteurs d'écran vers du vide — et cela ne se voit pas à
 * l'œil.
 */

describe('AppField — un champ de saisie', () => {
  it('lie le libellé à la saisie', () => {
    const wrapper = mount(AppField, {
      props: { id: 'email', label: 'Adresse email', modelValue: '' },
    })

    expect(wrapper.find('label').attributes('for')).toBe('email')
    expect(wrapper.find('input').attributes('id')).toBe('email')
  })

  it('ne désigne une aide ou une erreur que si elle existe', () => {
    const sansRien = mount(AppField, {
      props: { id: 'email', label: 'Adresse email', modelValue: '' },
    })
    expect(sansRien.find('input').attributes('aria-describedby')).toBeUndefined()
    expect(sansRien.find('input').attributes('aria-invalid')).toBe('false')

    const avecLesDeux = mount(AppField, {
      props: {
        id: 'email',
        label: 'Adresse email',
        modelValue: '',
        hint: 'Votre adresse professionnelle.',
        errors: ['Adresse email invalide.'],
      },
    })
    expect(avecLesDeux.find('input').attributes('aria-describedby')).toBe('email-hint email-error')
    expect(avecLesDeux.find('input').attributes('aria-invalid')).toBe('true')
  })

  /**
   * Le serveur renvoie un message par critère non respecté ; les résumer en
   * « champ invalide » retirerait à la personne ce qu'il lui manque pour
   * corriger.
   */
  it('affiche chaque motif de refus, un par un', () => {
    const errors = [
      'Le mot de passe doit contenir au moins 12 caractères.',
      'Le mot de passe doit contenir au moins un chiffre.',
    ]
    const wrapper = mount(AppField, {
      props: { id: 'password', label: 'Mot de passe', modelValue: '', errors },
    })

    expect(wrapper.findAll('#password-error li')).toHaveLength(2)
    for (const reason of errors) expect(wrapper.text()).toContain(reason)
  })

  it('remonte la saisie', async () => {
    const wrapper = mount(AppField, {
      props: { id: 'email', label: 'Adresse email', modelValue: '' },
    })

    await wrapper.find('input').setValue('sofia@atelier-voisin.fr')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['sofia@atelier-voisin.fr'])
  })
})

describe('AppSelect — une liste déroulante', () => {
  it('applique le même câblage ARIA qu\'un champ de saisie', () => {
    const wrapper = mount(AppSelect, {
      props: {
        id: 'rappel',
        label: 'Fréquence de rappel',
        modelValue: 60,
        hint: 'De 30 à 120 minutes.',
      },
      slots: { default: '<option :value="60">60 minutes</option>' },
    })

    expect(wrapper.find('select').attributes('aria-describedby')).toBe('rappel-hint')
    expect(wrapper.find('label').attributes('for')).toBe('rappel')
  })

  /** Un `<option :value="9">` renvoie le nombre 9, pas la chaîne « 9 ». */
  it('conserve le type de la valeur choisie', async () => {
    const wrapper = mount(AppSelect, {
      props: { id: 'debut', label: 'Début de journée', modelValue: 9 },
      slots: { default: '<option :value="9">9 h</option><option :value="10">10 h</option>' },
    })

    await wrapper.find('select').setValue('10')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([10])
  })
})

describe('AppAlert — un bandeau de message', () => {
  it('décline ses quatre tons sans jamais recourir au rouge vif', () => {
    for (const tone of ['info', 'success', 'warning', 'danger'] as const) {
      const html = mount(AppAlert, { props: { tone }, slots: { default: 'Message' } }).html()

      // La charte proscrit l'alarme agressive, même pour dire non : les fonds
      // sont les surfaces douces du thème.
      expect(html, tone).toContain(`bg-${tone}-soft`)
      expect(html, tone).toContain(`text-${tone}-strong`)
    }
  })

  /**
   * Le rôle ARIA revient à l'appelant : `role="alert"` interrompt la lecture en
   * cours, `role="status"` attend la fin. Tout n'a pas la même urgence.
   */
  it('n\'impose aucun rôle ARIA', () => {
    const wrapper = mount(AppAlert, { slots: { default: 'Message' } })

    expect(wrapper.attributes('role')).toBeUndefined()
  })
})

describe('AppGauge — une progression vers un objectif', () => {
  /**
   * F7 interdit tout « score global de bien-être » : l'anneau mesure une
   * progression vers un objectif que la personne s'est **elle-même** donnée, ce
   * qui n'est pas la même chose — le dénominateur vient de ses propres réglages
   * et n'a de sens que pour elle. Le libellé accessible doit donc venir de
   * l'appelant, jamais d'un barème.
   */
  it('décrit l\'anneau pour les lecteurs d\'écran et masque le dessin', () => {
    const wrapper = mount(AppGauge, {
      props: { value: 3, max: 6, label: '3 pauses prises sur un objectif de 6' },
    })

    expect(wrapper.find('[role="img"]').attributes('aria-label'))
      .toBe('3 pauses prises sur un objectif de 6')
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
  })

  /**
   * Une valeur hors bornes vient d'une donnée fausse, pas d'un choix de design :
   * on la ramène dans l'anneau plutôt que de dessiner n'importe quoi.
   */
  it('ramène une valeur hors bornes dans l\'anneau', () => {
    const trace = (value: number) => {
      const cercles = mount(AppGauge, { props: { value, max: 6, label: 'x' } }).findAll('circle')

      return Number(cercles[1]!.attributes('stroke-dashoffset'))
    }

    const circonference = trace(0)

    // Vide à zéro et en dessous, plein au maximum et au-delà.
    expect(trace(-4)).toBe(circonference)
    expect(trace(12)).toBe(0)
    expect(trace(6)).toBe(0)
  })
})
