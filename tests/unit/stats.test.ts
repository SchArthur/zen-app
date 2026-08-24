import { describe, expect, it } from 'vitest'
import { PERIODS, buildDailyStats, delta, splitPeriods, summarise } from '../../server/utils/stats'
import { dayKeysBack, previousDayKey } from '../../shared/utils/time'

/**
 * CU-11 — les agrégats du tableau de bord personnel (F7).
 *
 * Le point sensible n'est pas l'addition, c'est le **dénominateur** : une
 * moyenne d'humeur rapportée à la longueur de la période au lieu des journées
 * déclarées affiche un chiffre bas que rien à l'écran ne permet de soupçonner.
 */

const NOW = new Date('2026-08-21T12:00:00Z')

/** Les sept dernières journées, dans l'ordre chronologique. */
const WEEK = [...dayKeysBack(7, NOW)].reverse()

const session = (startedAt: string, durationSec: number) => ({ startedAt: new Date(startedAt), durationSec })
const log = (completedAt: string) => ({ completedAt: new Date(completedAt) })

describe('buildDailyStats', () => {
  it('rend une entrée par journée demandée, dans l\'ordre reçu', () => {
    const days = buildDailyStats(WEEK, [], [], [])

    expect(days.map(day => day.date)).toEqual(WEEK)
    expect(days[0]).toEqual({ date: WEEK[0], breaks: 0, breakSec: 0, exercises: 0, mood: null, stress: null })
  })

  it('range pauses et exercices dans leur journée locale', () => {
    const days = buildDailyStats(
      WEEK,
      [session('2026-08-21T08:00:00Z', 600), session('2026-08-21T13:00:00Z', 300)],
      [log('2026-08-20T09:00:00Z')],
      [],
    )

    expect(days.at(-1)).toMatchObject({ breaks: 2, breakSec: 900, exercises: 0 })
    expect(days.at(-2)).toMatchObject({ breaks: 0, exercises: 1 })
  })

  // A2 de CU-09 : une journée non déclarée est absente, pas nulle. Un zéro se
  // lirait comme une humeur au plus bas.
  it('laisse à null les journées non déclarées', () => {
    const days = buildDailyStats(WEEK, [], [], [{ date: WEEK[6]!, mood: 4, stress: 2 }])

    expect(days.at(-1)).toMatchObject({ mood: 4, stress: 2 })
    expect(days.at(-2)).toMatchObject({ mood: null, stress: null })
  })

  // Les requêtes remontent volontairement un jour plus loin que la fenêtre :
  // ce qui dépasse doit être écarté ici, sans fausser les cumuls.
  it('ignore ce qui tombe hors de la fenêtre', () => {
    const days = buildDailyStats(WEEK, [session('2026-06-01T08:00:00Z', 600)], [], [])

    expect(summarise(days).breaks).toBe(0)
  })

  it('rattache une pause de fin de soirée à la journée parisienne', () => {
    // 23 h 30 à Paris le 20, soit 21 h 30 UTC : c'est bien le 20.
    const days = buildDailyStats(WEEK, [session('2026-08-20T21:30:00Z', 300)], [], [])

    expect(days.at(-2)).toMatchObject({ breaks: 1 })
    expect(days.at(-1)).toMatchObject({ breaks: 0 })
  })
})

describe('summarise', () => {
  const days = buildDailyStats(
    WEEK,
    [session('2026-08-21T08:00:00Z', 600), session('2026-08-19T08:00:00Z', 300)],
    [log('2026-08-21T09:00:00Z'), log('2026-08-21T15:00:00Z'), log('2026-08-18T09:00:00Z')],
    [{ date: WEEK[6]!, mood: 5, stress: 1 }, { date: WEEK[4]!, mood: 3, stress: 3 }],
  )

  it('cumule pauses, durées et exercices', () => {
    expect(summarise(days)).toMatchObject({ breaks: 2, breakSec: 900, exercises: 3 })
  })

  // Le point qui compte : la moyenne porte sur les deux journées déclarées, pas
  // sur les sept de la période. Rapportée à sept, elle vaudrait 1,14.
  it('moyenne sur les seules journées déclarées', () => {
    expect(summarise(days)).toMatchObject({ moodAvg: 4, stressAvg: 2, declaredDays: 2 })
  })

  it('compte les journées avec au moins une pause', () => {
    expect(summarise(days).activeDays).toBe(2)
  })

  it('rend des moyennes nulles quand rien n\'a été déclaré', () => {
    expect(summarise(buildDailyStats(WEEK, [], [], []))).toMatchObject({
      moodAvg: null,
      stressAvg: null,
      declaredDays: 0,
    })
  })
})

describe('delta', () => {
  it('mesure l\'écart avec la période précédente', () => {
    expect(delta(12, 8)).toBe(4)
    expect(delta(8, 12)).toBe(-4)
  })

  // Sans point de comparaison il n'y a pas de tendance : afficher « + 100 % »
  // face à une période vide serait un chiffre inventé.
  it('ne conclut rien lorsqu\'un des deux termes manque', () => {
    expect(delta(4, null)).toBeNull()
    expect(delta(null, 4)).toBeNull()
  })
})

describe('splitPeriods', () => {
  it('sépare la période courante de la précédente', () => {
    const days = buildDailyStats([...dayKeysBack(14, NOW)].reverse(), [], [], [])
    const { current, previous } = splitPeriods(days, 7)

    expect(current).toHaveLength(7)
    expect(previous).toHaveLength(7)
    // La période courante finit aujourd'hui ; la précédente s'arrête la veille
    // de son premier jour, sans recouvrement ni journée sautée entre les deux.
    expect(current.at(-1)!.date).toBe(WEEK.at(-1))
    expect(current[0]!.date).toBe(WEEK[0])
    expect(previous.at(-1)!.date).toBe(previousDayKey(WEEK[0]!))
  })
})

describe('PERIODS', () => {
  it('offre exactement les deux périodes sélectionnables de F7', () => {
    expect(Object.keys(PERIODS)).toEqual(['semaine', 'mois'])
    expect(PERIODS).toMatchObject({ semaine: 7, mois: 30 })
  })
})
