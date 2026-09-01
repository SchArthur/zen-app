import { describe, expect, it } from 'vitest'
import {
  formatCheckInDay,
  formatDayInitial,
  levelLabel,
  moodLevels,
  stressLevels,
} from '../../app/utils/mood'

/**
 * CU-09 — les deux échelles du check-in, côté interface.
 *
 * F5 impose que chaque niveau soit identifiable par sa **couleur**, sa **forme**
 * et son **libellé** — les trois, pas l'un des trois. C'est une exigence
 * d'accessibilité : la couleur seule exclut les daltoniens et disparaît sur un
 * écran mal calibré. Ces tests vérifient que les trois attributs existent pour
 * chaque niveau, ce qui rend l'oubli de l'un d'eux impossible à livrer.
 */

describe('les échelles d\'humeur et de stress', () => {
  it('portent cinq niveaux, de 1 à 5', () => {
    for (const levels of [moodLevels, stressLevels]) {
      expect(levels.map(level => level.value)).toEqual([1, 2, 3, 4, 5])
    }
  })

  /** Les trois attributs de F5, vérifiés niveau par niveau. */
  it('donnent à chaque niveau une couleur, une forme et un libellé', () => {
    for (const levels of [moodLevels, stressLevels]) {
      for (const level of levels) {
        expect(level.tone, `niveau ${level.value}`).toMatch(/^bg-/)
        expect(level.weight).toBeGreaterThan(0)
        expect(level.weight).toBeLessThanOrEqual(1)
        expect(level.label.length).toBeGreaterThan(0)
      }
    }
  })

  /** La forme est portée par la hauteur : elle doit croître, sinon elle ne dit rien. */
  it('font croître la hauteur avec le niveau', () => {
    for (const levels of [moodLevels, stressLevels]) {
      const weights = levels.map(level => level.weight)

      expect([...weights].sort((a, b) => a - b)).toEqual(weights)
    }
  })

  /**
   * Le vocabulaire décrit un ressenti, jamais un jugement ni un diagnostic :
   * ZenTime n'est pas un dispositif médical, et une échelle qui parlerait de
   * « déprimé » ou d'« anxieux » porterait un diagnostic (règle éditoriale,
   * `normes-et-conformite.md` §5).
   */
  it('n\'emploient aucun mot de jugement ni de clinique', () => {
    const interdits = ['mauvais', 'bon', 'déprim', 'anxieu', 'dépress', 'malade']
    const libelles = [...moodLevels, ...stressLevels].map(level => level.label.toLowerCase())

    for (const mot of interdits) {
      expect(libelles.some(label => label.includes(mot)), mot).toBe(false)
    }
  })

  it('nomme le niveau choisi, et rien quand rien n\'est choisi', () => {
    expect(levelLabel(moodLevels, 5)).toBe('Rayonnant')
    expect(levelLabel(stressLevels, 1)).toBe('Serein')
    expect(levelLabel(moodLevels, null)).toBeNull()
    expect(levelLabel(moodLevels, 9)).toBeNull()
  })
})

describe('la mise en forme des journées de déclaration', () => {
  it('écrit la journée en toutes lettres, capitale en tête', () => {
    expect(formatCheckInDay('2026-08-19')).toBe('Mercredi 19 août')
  })

  /**
   * La date est reconstruite champ par champ : `new Date('2026-08-19')` serait
   * lu comme minuit **UTC** et reculerait d'un jour à l'ouest de Greenwich. Le
   * 1er du mois est le cas où l'erreur change de mois, donc le plus visible.
   */
  it('ne recule pas d\'un jour au premier du mois', () => {
    expect(formatCheckInDay('2026-09-01')).toBe('Mardi 1 septembre')
  })

  it('rend l\'initiale du jour pour les légendes d\'axe', () => {
    expect(formatDayInitial('2026-08-19')).toBe('M')
    expect(formatDayInitial('2026-08-21')).toBe('V')
  })
})
