import { describe, expect, it } from 'vitest'
import { dayKey, historySince } from '../../shared/utils/time'

/**
 * Le découpage en journées locales est partagé par les trois compteurs
 * quotidiens du produit — pauses (F3), exercices réalisés (F4) et déclaration
 * d'humeur (F5), unique par journée civile. Une erreur d'une heure ici ne se
 * verrait nulle part à l'écran et fausserait durablement les trois.
 */

describe('dayKey', () => {
  it('rattache un instant à sa journée locale, pas à sa journée UTC', () => {
    // 23 h 30 à Paris, mais déjà 21 h 30 en temps universel : c'est bien le 19.
    expect(dayKey(new Date('2026-08-19T21:30:00Z'))).toBe('2026-08-19')
    // 00 h 30 à Paris le lendemain, alors qu'il est encore le 19 en UTC.
    expect(dayKey(new Date('2026-08-19T22:30:00Z'))).toBe('2026-08-20')
  })

  it('suit le changement d\'heure', () => {
    // Décalage d'une heure seulement en hiver : le basculement se fait plus tard.
    expect(dayKey(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-15')
    expect(dayKey(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16')
  })
})

describe('historySince', () => {
  it('remonte un jour plus loin que la fenêtre demandée', () => {
    const since = historySince(7, new Date('2026-08-19T15:00:00Z'))

    expect(since.toISOString()).toBe('2026-08-11T15:00:00.000Z')
  })
})
