import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatDayLabel,
  formatDuration,
  formatRelativeDay,
  formatTime,
} from '../../app/utils/breaks'

/**
 * CU-07 — la mise en forme des durées et des dates de pause.
 *
 * L'écran du minuteur et celui de l'historique affichent les mêmes valeurs : une
 * pause de douze minutes doit se lire « 12 min » des deux côtés, sinon on croit
 * lire deux mesures différentes. Ces fonctions sont la seule définition ; les
 * tester ici, c'est les tester pour les deux écrans.
 */

describe('formatDuration — une pause terminée', () => {
  /**
   * Les secondes ne s'affichent qu'en dessous de la minute. Au-delà, elles
   * suggèrent une précision qui n'intéresse personne : ce que le produit
   * valorise est la fréquence des interruptions, pas leur durée au chronomètre.
   */
  it('n\'affiche les secondes qu\'en dessous de la minute', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(59)).toBe('59 s')
    expect(formatDuration(60)).toBe('1 min')
    expect(formatDuration(725)).toBe('12 min')
  })

  it('passe à l\'heure au-delà de soixante minutes, minutes sur deux chiffres', () => {
    expect(formatDuration(3600)).toBe('1 h 00')
    expect(formatDuration(3900)).toBe('1 h 05')
    expect(formatDuration(7500)).toBe('2 h 05')
  })

  it('tient le cas d\'une pause à zéro seconde', () => {
    expect(formatDuration(0)).toBe('0 s')
  })
})

describe('formatClock — le minuteur en cours', () => {
  it('compte en minutes et secondes, sur deux chiffres', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(9)).toBe('00:09')
    expect(formatClock(252)).toBe('04:12')
  })

  it('ajoute les heures au-delà de soixante minutes', () => {
    expect(formatClock(3852)).toBe('1:04:12')
  })
})

describe('formatTime et formatDayLabel — les repères de l\'historique', () => {
  /**
   * Le fuseau est imposé et non laissé à l'horloge du navigateur : le serveur
   * range les pauses par journée avec le même, et une heure formatée autrement
   * au rendu puis à l'hydratation ferait diverger la page.
   */
  it('affiche l\'heure dans le fuseau de l\'application', () => {
    // 12 h 32 UTC en août à Paris, c'est-à-dire 14 h 32 locales.
    expect(formatTime('2026-08-19T12:32:00.000Z')).toBe('14:32')
  })

  it('écrit la journée en toutes lettres, capitale en tête', () => {
    expect(formatDayLabel('2026-08-19')).toBe('Mercredi 19 août')
  })

  /**
   * Le rang, et non une comparaison de dates : c'est le serveur qui a décidé où
   * commence aujourd'hui en découpant l'historique. Le recalculer ici ferait
   * diverger les deux au passage de minuit.
   */
  it('repère les deux premières journées par leur rang', () => {
    expect(formatRelativeDay(0, '2026-08-19')).toBe('Aujourd\'hui')
    expect(formatRelativeDay(1, '2026-08-18')).toBe('Hier')
    expect(formatRelativeDay(2, '2026-08-17')).toBe('Lundi 17 août')
  })
})
