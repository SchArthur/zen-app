import { describe, expect, it } from 'vitest'
import {
  ANONYMITY_THRESHOLD,
  aggregateDays,
  countDeclarants,
  summariseAggregate,
} from '../../server/utils/aggregates'
import { dayKeysBack } from '../../shared/utils/time'

/**
 * CU-12.1 — Vérifier le seuil d'anonymat.
 *
 * F8 en fait la fonction la plus risquée du produit : « mal conçue, elle détruit
 * la confiance dont dépendent toutes les autres ». Ces tests portent donc moins
 * sur le calcul que sur ce qui **ne doit pas** en sortir.
 */

const NOW = new Date('2026-08-24T12:00:00Z')
const WEEK = [...dayKeysBack(7, NOW)].reverse()

const session = (startedAt: string, durationSec = 600) => ({ startedAt: new Date(startedAt), durationSec })
const log = (completedAt: string) => ({ completedAt: new Date(completedAt) })

/** Une déclaration, telle que Prisma la rend : `date` à minuit UTC. */
const checkIn = (userId: string, day: string, mood: number, stress: number) => ({
  userId,
  date: new Date(`${day}T00:00:00.000Z`),
  mood,
  stress,
})

/** `count` personnes déclarant la même journée, la même chose. */
function crowd(day: string, count: number, mood = 4, stress = 2) {
  return Array.from({ length: count }, (_, index) => checkIn(`u${index}`, day, mood, stress))
}

describe('countDeclarants', () => {
  it('compte des personnes, pas des déclarations', () => {
    expect(countDeclarants([
      checkIn('alice', '2026-08-20', 4, 2),
      checkIn('alice', '2026-08-21', 3, 3),
      checkIn('bob', '2026-08-21', 5, 1),
    ])).toBe(2)
  })

  it('ne compte rien sans déclaration', () => {
    expect(countDeclarants([])).toBe(0)
  })
})

describe('aggregateDays — masquage par journée', () => {
  const today = WEEK.at(-1)!

  // Le point que F8 ne dit pas et que l'intention impose : dans une équipe de
  // six où une seule personne déclare le mardi, la « moyenne du mardi » est la
  // valeur de cette personne. Une donnée d'article 9 nominative, sous un nom
  // d'agrégat.
  it('masque la moyenne d\'une journée sous le seuil', () => {
    const days = aggregateDays(WEEK, [], [], crowd(today, ANONYMITY_THRESHOLD - 1))

    expect(days.at(-1)).toMatchObject({ mood: null, stress: null })
  })

  it('publie la moyenne dès que le seuil est atteint', () => {
    const days = aggregateDays(WEEK, [], [], crowd(today, ANONYMITY_THRESHOLD, 4, 2))

    expect(days.at(-1)).toMatchObject({ mood: 4, stress: 2 })
  })

  // Plusieurs déclarations d'une même personne ne font pas plusieurs personnes :
  // sans quoi une seule personne déclarant cinq jours de suite débloquerait la
  // journée pour elle toute seule.
  it('ne laisse pas une même personne franchir le seuil à elle seule', () => {
    const repeated = Array.from(
      { length: ANONYMITY_THRESHOLD + 2 },
      () => checkIn('alice', today, 5, 1),
    )

    expect(aggregateDays(WEEK, [], [], repeated).at(-1)).toMatchObject({ mood: null, stress: null })
  })

  it('masque journée par journée, sans effet sur les autres', () => {
    const days = aggregateDays(WEEK, [], [], [
      ...crowd(WEEK[5]!, ANONYMITY_THRESHOLD),
      ...crowd(WEEK[6]!, 1, 1, 5),
    ])

    expect(days[5]).toMatchObject({ mood: 4 })
    expect(days[6]).toMatchObject({ mood: null, stress: null })
  })

  // Une somme ne s'attribue à personne : savoir qu'il y a eu deux pauses mardi
  // ne dit pas qui les a prises, là où une moyenne d'humeur à un déclarant dit
  // tout de cette personne.
  it('ne masque pas les compteurs de pauses et d\'exercices', () => {
    const days = aggregateDays(
      WEEK,
      [session(`${WEEK.at(-1)}T08:00:00Z`), session(`${WEEK.at(-1)}T10:00:00Z`)],
      [log(`${WEEK.at(-1)}T09:00:00Z`)],
      crowd(today, 1),
    )

    expect(days.at(-1)).toMatchObject({ breaks: 2, exercises: 1, mood: null })
  })

  it('rend une entrée par journée demandée, même vide', () => {
    const days = aggregateDays(WEEK, [], [], [])

    expect(days).toHaveLength(7)
    expect(days[0]).toEqual({ date: WEEK[0], breaks: 0, exercises: 0, mood: null, stress: null })
  })

  it('ignore ce qui tombe hors de la fenêtre', () => {
    const days = aggregateDays(WEEK, [session('2026-01-05T08:00:00Z')], [], crowd('2026-01-05', 9))

    expect(days.every(day => day.breaks === 0 && day.mood === null)).toBe(true)
  })
})

describe('summariseAggregate', () => {
  const checkIns = [
    ...crowd(WEEK[4]!, 3, 5, 1),
    ...crowd(WEEK[6]!, 3, 3, 3),
  ]

  it('cumule les compteurs du périmètre', () => {
    const totals = summariseAggregate(
      [session(`${WEEK[6]}T08:00:00Z`, 600), session(`${WEEK[6]}T10:00:00Z`, 300)],
      [log(`${WEEK[6]}T09:00:00Z`)],
      [],
    )

    expect(totals).toMatchObject({ breaks: 2, breakSec: 900, exercises: 1 })
  })

  // La moyenne de période porte sur les déclarations brutes : le seuil de
  // période a déjà garanti qu'au moins cinq personnes distinctes y ont
  // contribué. La recalculer sur les journées visibles écarterait des
  // déclarations réelles et biaiserait vers les jours de forte participation.
  it('moyenne sur les déclarations brutes, journées masquées comprises', () => {
    expect(summariseAggregate([], [], checkIns)).toMatchObject({ moodAvg: 4, stressAvg: 2 })
  })

  it('compte les déclarants distincts du périmètre', () => {
    // `crowd` réutilise les mêmes identifiants d'un jour à l'autre.
    expect(summariseAggregate([], [], checkIns).declarants).toBe(3)
  })

  it('ne conclut aucune moyenne sans déclaration', () => {
    expect(summariseAggregate([], [], [])).toMatchObject({ moodAvg: null, stressAvg: null, declarants: 0 })
  })
})

describe('ANONYMITY_THRESHOLD', () => {
  // Ce n'est pas un réglage : c'est la traduction opérationnelle de
  // l'engagement de non-intrusion du cahier des charges (F8).
  it('vaut cinq, comme l\'exige F8', () => {
    expect(ANONYMITY_THRESHOLD).toBe(5)
  })
})
