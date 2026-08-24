import { describe, expect, it } from 'vitest'
import { moodDay } from '../../server/utils/mood'

/**
 * `MoodCheckIn.date` est une colonne `date`, sans heure, et la journée de
 * référence est celle de l'application — Europe/Paris — et non celle du serveur,
 * qui tourne en UTC. C'est cette estampille qui porte la contrainte d'unicité
 * `(userId, date)`, donc la règle « une déclaration par jour » (RG9) : une erreur
 * d'estampille ne se verrait pas à l'écran et ferait écraser la déclaration de
 * la veille.
 */
describe('moodDay', () => {
  it('estampille la journée à minuit UTC', () => {
    expect(moodDay(new Date('2026-08-21T09:32:11Z')).toISOString()).toBe('2026-08-21T00:00:00.000Z')
  })

  it('range deux instants de la même journée parisienne sous la même estampille', () => {
    const morning = moodDay(new Date('2026-08-21T06:00:00Z')) // 8 h à Paris
    const evening = moodDay(new Date('2026-08-21T20:00:00Z')) // 22 h à Paris

    expect(morning.getTime()).toBe(evening.getTime())
  })

  // Le cas qui casse tout si la journée est prise en UTC : passé minuit à Paris,
  // la journée UTC est encore celle de la veille, et la déclaration du jour
  // viendrait remplacer celle d'hier.
  it('bascule à minuit heure de Paris, pas à minuit UTC', () => {
    expect(moodDay(new Date('2026-08-20T21:59:00Z')).toISOString()).toBe('2026-08-20T00:00:00.000Z')
    expect(moodDay(new Date('2026-08-20T22:01:00Z')).toISOString()).toBe('2026-08-21T00:00:00.000Z')
  })

  it('suit le changement d\'heure', () => {
    // En hiver, une heure de décalage : le basculement se fait plus tard.
    expect(moodDay(new Date('2026-01-15T22:59:00Z')).toISOString()).toBe('2026-01-15T00:00:00.000Z')
    expect(moodDay(new Date('2026-01-15T23:01:00Z')).toISOString()).toBe('2026-01-16T00:00:00.000Z')
  })
})
