import { describe, expect, it } from 'vitest'
import { ExerciseType } from '../../lib/generated/prisma/enums.js'
import {
  durationFilters,
  exerciseTypeLabels,
  exerciseTypeTones,
  exerciseTypes,
  formatExerciseDuration,
} from '../../app/utils/exercises'
import { plural } from '../../app/utils/text'
import { roleLabels } from '../../app/utils/roles'
import { formatTrend } from '../../app/utils/trends'

/**
 * Le vocabulaire et les repères visuels de l'interface.
 *
 * Tous ces tableaux ont la même raison d'être : **une seule définition** pour
 * plusieurs écrans. Le catalogue, le formulaire de préférences et le moteur de
 * recommandation affichent les mêmes mots ; la vue personnelle, la vue d'équipe
 * et la vue entreprise affichent les mêmes écarts. Deux copies auraient fini par
 * diverger, et l'écart se serait vu à l'écran.
 *
 * Le test qui compte le plus ici est celui de l'**exhaustivité** : chaque valeur
 * de l'énumération de la base doit avoir son libellé. Un type d'exercice ajouté
 * demain sans son entrée s'afficherait « undefined ».
 */

describe('le vocabulaire du catalogue', () => {
  it('nomme et habille chaque famille déclarée en base', () => {
    for (const type of Object.values(ExerciseType)) {
      expect(exerciseTypeLabels[type], type).toBeTruthy()
      expect(exerciseTypeTones[type], type).toMatchObject({
        chip: expect.any(String),
        dot: expect.any(String),
        halo: expect.any(String),
      })
    }
  })

  it('ordonne les familles du plus physique au plus mental', () => {
    expect(exerciseTypes).toEqual(['STRETCHING', 'BREATHING', 'MEDITATION'])
  })

  it('annonce la durée en minutes', () => {
    expect(formatExerciseDuration(3)).toBe('3 min')
  })

  /**
   * Le filtre est un **maximum**, jamais un intervalle : personne n'écarte un
   * exercice parce qu'il est trop court. Les libellés doivent le dire.
   */
  it('propose des paliers de durée exprimés comme un maximum', () => {
    for (const filter of durationFilters) {
      expect(filter.label).toContain('ou moins')
    }
  })
})

describe('roleLabels — les trois rôles', () => {
  it('nomme les trois rôles en français', () => {
    expect(roleLabels).toEqual({
      COLLABORATOR: 'Collaborateur',
      MANAGER: 'Manager',
      HR: 'Responsable RH',
    })
  })
})

describe('plural — l\'accord en nombre', () => {
  /** Singulier au seul « un », pluriel partout ailleurs — zéro compris. */
  it('met le pluriel à zéro comme au-delà de un', () => {
    expect(plural(0, 'pause')).toBe('pauses')
    expect(plural(1, 'pause')).toBe('pause')
    expect(plural(2, 'pause')).toBe('pauses')
  })

  it('accepte une forme irrégulière', () => {
    expect(plural(2, 'œil', 'yeux')).toBe('yeux')
    expect(plural(1, 'œil', 'yeux')).toBe('œil')
  })
})

describe('formatTrend — l\'écart avec la période précédente', () => {
  /**
   * Les écarts sont des **différences**, jamais des pourcentages : sur une
   * douzaine de pauses, « + 3 » informe davantage que « + 50 % » et impressionne
   * moins. Le produit ne cherche pas à faire de la performance.
   */
  it('exprime un écart en valeur absolue, jamais en pourcentage', () => {
    expect(formatTrend(3).label).toBe('+ 3 vs période précédente')
    expect(formatTrend(-2).label).toBe('− 2 vs période précédente')
    expect(formatTrend(3).label).not.toContain('%')
  })

  /**
   * `null` signifie « rien à comparer », pas « stable » : on le dit, plutôt que
   * d'afficher un zéro qui se lirait comme une absence de progrès.
   */
  it('distingue « rien à comparer » de « stable »', () => {
    expect(formatTrend(null).label).toBe('pas de point de comparaison')
    expect(formatTrend(0).label).toBe('stable')
    expect(formatTrend(0.4).label).toBe('stable')
  })

  it('garde une décimale quand la mesure en a une', () => {
    expect(formatTrend(0.4, { decimals: true }).label).toBe('+ 0,4 vs période précédente')
  })

  /**
   * Sur le stress, monter est la mauvaise direction : la teinte suit le **sens**,
   * pas le signe. Sans cela, une hausse du stress s'afficherait en vert.
   */
  it('suit le sens et non le signe sur une mesure inversée', () => {
    expect(formatTrend(2).tone).toBe('text-success-strong')
    expect(formatTrend(2, { invert: true }).tone).toBe('text-warning-strong')
    expect(formatTrend(-2, { invert: true }).tone).toBe('text-success-strong')
  })
})
