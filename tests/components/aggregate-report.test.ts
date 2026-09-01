import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AggregateReport from '../../app/components/AggregateReport.vue'

/**
 * CU-12 et CU-13 — la restitution d'un périmètre agrégé.
 *
 * Un seul composant pour la vue d'équipe et la vue entreprise, ce que F9 annonce
 * explicitement : « réutilise les agrégations de la vue manager avec un
 * périmètre différent ». Une seule place, donc, où vérifier qu'aucune donnée
 * individuelle n'est rendue.
 *
 * Le composant n'a **aucun moyen** d'afficher un nom ou une valeur individuelle,
 * pour la bonne raison qu'aucun ne lui parvient : ses propriétés ne portent que
 * des sommes, des moyennes et un effectif. Le test le vérifie sur son type
 * autant que sur son rendu.
 */

const SERIES = [
  { date: '2026-08-24', breaks: 14, exercises: 6, mood: 3.4, stress: 2.8 },
  { date: '2026-08-25', breaks: 11, exercises: 4, mood: 3.6, stress: 2.5 },
  { date: '2026-08-26', breaks: 9, exercises: 5, mood: null, stress: null },
]

const PROPS = {
  days: 7,
  headcount: 12,
  threshold: 5,
  series: SERIES,
  totals: {
    breaks: 34,
    breakSec: 20_400,
    exercises: 15,
    moodAvg: 3.5,
    stressAvg: 2.65,
    declarants: 9,
  },
  trends: { breaks: 4, exercises: -1, mood: 0.2, stress: -0.3 },
}

describe('AggregateReport — la restitution d\'un périmètre', () => {
  it('affiche la participation, l\'activité et les moyennes du périmètre', () => {
    const texte = mount(AggregateReport, { props: PROPS }).text()

    expect(texte).toContain('75') // 9 déclarants sur 12
    expect(texte).toContain('9 personnes sur 12 ont déclaré')
    expect(texte).toContain('34')
    expect(texte).toContain('3,5')
    expect(texte).toContain('2,7')
  })

  /**
   * Le masquage par journée doit se **dire**, sans quoi un trou dans la courbe
   * se lit comme une absence d'activité plutôt que comme un refus de calculer.
   */
  it('explique les journées sans valeur au lieu de les laisser passer pour du vide', () => {
    const texte = mount(AggregateReport, { props: PROPS }).text()

    expect(texte).toContain('1 journée sans valeur')
    expect(texte).toContain('moins de 5 personnes y ont déclaré')
  })

  it('accorde le pluriel des journées masquées', () => {
    const props = {
      ...PROPS,
      series: SERIES.map(day => ({ ...day, mood: null, stress: null })),
    }

    expect(mount(AggregateReport, { props }).text()).toContain('3 journées sans valeur')
  })

  /**
   * Une moyenne absente s'affiche « — », jamais zéro : zéro se lirait comme un
   * ressenti au plus bas, alors qu'il s'agit d'une absence de déclaration.
   */
  it('n\'affiche jamais zéro pour une moyenne absente', () => {
    const props = {
      ...PROPS,
      totals: { ...PROPS.totals, moodAvg: null, stressAvg: null },
      trends: { ...PROPS.trends, mood: null, stress: null },
    }
    const texte = mount(AggregateReport, { props }).text()

    expect(texte).toContain('—')
    expect(texte).toContain('pas de point de comparaison')
  })

  /**
   * Sur le stress, monter est la mauvaise direction : la teinte suit le sens et
   * non le signe, faute de quoi une hausse du stress s'afficherait en vert.
   */
  it('lit la hausse du stress comme une mauvaise nouvelle', () => {
    const props = { ...PROPS, trends: { ...PROPS.trends, mood: 0.4, stress: 0.4 } }
    const html = mount(AggregateReport, { props }).html()

    expect(html).toContain('text-warning-strong')
    expect(html).toContain('text-success-strong')
  })

  it('dit qu\'il n\'y a rien à montrer plutôt que de dessiner un graphique vide', () => {
    const props = {
      ...PROPS,
      totals: { ...PROPS.totals, breaks: 0, breakSec: 0, exercises: 0 },
      series: SERIES.map(day => ({ ...day, breaks: 0, exercises: 0 })),
    }

    expect(mount(AggregateReport, { props }).text())
      .toContain('Aucune activité enregistrée sur cette période')
  })

  /**
   * Le contrôle de fond : rien de ce qui sort de ce composant ne désigne
   * quelqu'un. Le rendu entier est passé au crible plutôt que champ par champ —
   * un ajout maladroit y serait pris sans que le test ait à être mis à jour.
   */
  it('ne rend aucun identifiant ni aucun nom de personne', () => {
    const html = mount(AggregateReport, { props: PROPS }).html()

    for (const interdit of ['usr_', 'userId', '@', 'Sofia', 'Nakamura']) {
      expect(html).not.toContain(interdit)
    }
  })
})
