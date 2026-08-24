import { describe, expect, it } from 'vitest'
import {
  RULES,
  candidatePool,
  doneWithinTwoDays,
  recommend,
  sittingMinutes,
  sittingState,
} from '../../server/utils/recommend'
import type { RecommendInput, RecommendableExercise, RuleCode } from '../../server/utils/recommend'
import type { ExerciseType } from '../../lib/generated/prisma/enums.js'

/**
 * CU-10.1 — Évaluer les règles de recommandation.
 *
 * F6 exige que les règles soient « couvertes à 100 % par des tests unitaires ».
 * La couverture n'est pas laissée à l'appréciation d'un rapport d'outil : le
 * tableau `SCENARIOS` ci-dessous porte un cas par règle, et un test vérifie
 * qu'il couvre exactement les codes déclarés dans `RULES`. Ajouter une règle
 * sans son scénario fait échouer la suite.
 */

function exercise(id: string, type: ExerciseType, durationMin: number): RecommendableExercise {
  return { id, slug: id, title: id, description: `Description de ${id}`, type, durationMin }
}

const CATALOGUE = [
  exercise('etirement-court', 'STRETCHING', 2),
  exercise('etirement-moyen', 'STRETCHING', 4),
  exercise('etirement-long', 'STRETCHING', 6),
  exercise('souffle-court', 'BREATHING', 2),
  exercise('souffle-moyen', 'BREATHING', 4),
  exercise('souffle-long', 'BREATHING', 8),
  exercise('meditation-courte', 'MEDITATION', 3),
  exercise('meditation-moyenne', 'MEDITATION', 5),
  exercise('meditation-longue', 'MEDITATION', 7),
]

/** 21 août 2026, 14 h à Paris — en pleine journée, loin de tous les seuils. */
const NOON = new Date('2026-08-21T12:00:00Z')

const minutesAgo = (from: Date, minutes: number) => new Date(from.getTime() - minutes * 60_000)

/**
 * État de référence : journée 9 h – 18 h, rappel toutes les 90 min, pause
 * terminée il y a dix minutes, aucune déclaration, aucun exercice fait.
 * Aucune règle ne s'y applique hormis la dernière.
 */
function input(overrides: Partial<RecommendInput> = {}): RecommendInput {
  const now = overrides.now ?? NOON

  return {
    now,
    preferences: {
      workStartHour: 9,
      workEndHour: 18,
      reminderIntervalMin: 90,
      favoriteTypes: [],
    },
    checkIn: null,
    lastBreakEndedAt: minutesAgo(now, 10),
    breakRunning: false,
    activity: new Map(),
    catalogue: CATALOGUE,
    ...overrides,
  }
}

/** Un scénario minimal par règle, dans l'ordre de priorité de `RULES`. */
const SCENARIOS: { code: RuleCode, input: RecommendInput }[] = [
  { code: 'stress_high', input: input({ checkIn: { mood: 3, stress: 4 } }) },
  { code: 'long_sitting', input: input({ lastBreakEndedAt: minutesAgo(NOON, 200) }) },
  { code: 'mood_low', input: input({ checkIn: { mood: 2, stress: 2 } }) },
  { code: 'break_running', input: input({ breakRunning: true }) },
  // 17 h 30 à Paris : dans la dernière heure d'une journée qui finit à 18 h.
  { code: 'end_of_day', input: input({ now: new Date('2026-08-21T15:30:00Z') }) },
  // 9 h 30 à Paris : dans la première heure.
  { code: 'start_of_day', input: input({ now: new Date('2026-08-21T07:30:00Z') }) },
  { code: 'default', input: input() },
]

describe('RULES', () => {
  it('a un scénario de test pour chaque règle, et dans le même ordre', () => {
    expect(SCENARIOS.map(scenario => scenario.code)).toEqual(RULES.map(rule => rule.code))
  })

  it('compte au moins les six règles exigées par F6', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(6)
  })

  it.each(SCENARIOS)('déclenche la règle $code', ({ code, input: scenario }) => {
    expect(recommend(scenario)?.rule).toBe(code)
  })

  // Le motif énonce ce que le moteur a observé, jamais ce qu'il propose : la
  // sélection peut se rabattre sur une autre famille si le profil a écarté celle
  // que la règle privilégie, et le motif doit rester vrai dans ce cas.
  it.each(SCENARIOS)('énonce un motif qui ne nomme aucune famille ($code)', ({ input: scenario }) => {
    const reason = recommend(scenario)!.reason

    expect(reason).toMatch(/\.$/)
    expect(reason.toLowerCase()).not.toMatch(/respiration|étirement|méditation/)
  })
})

describe('recommend — priorité entre règles', () => {
  it('fait passer un stress élevé avant une immobilité prolongée', () => {
    const result = recommend(input({
      checkIn: { mood: 3, stress: 5 },
      lastBreakEndedAt: minutesAgo(NOON, 300),
    }))

    expect(result?.rule).toBe('stress_high')
  })

  it('fait passer une immobilité prolongée avant une humeur basse', () => {
    const result = recommend(input({
      checkIn: { mood: 1, stress: 2 },
      lastBreakEndedAt: minutesAgo(NOON, 200),
    }))

    expect(result?.rule).toBe('long_sitting')
  })

  it('rend toujours la même décision pour le même état', () => {
    const state = input({ checkIn: { mood: 3, stress: 4 } })

    expect(recommend(state)).toEqual(recommend(state))
  })
})

describe('recommend — choix de l\'exercice', () => {
  it('respecte la famille et la durée voulues par la règle', () => {
    const result = recommend(input({ checkIn: { mood: 3, stress: 4 } }))

    expect(result?.exercise.type).toBe('BREATHING')
    expect(result?.exercise.durationMin).toBeLessThanOrEqual(5)
  })

  // F6 : « aucun exercice proposé parmi les types écartés dans le profil ».
  // Le filtre du profil l'emporte donc sur la famille voulue par la règle.
  it('ne propose jamais une famille écartée dans le profil', () => {
    const result = recommend(input({
      checkIn: { mood: 3, stress: 5 },
      preferences: {
        workStartHour: 9,
        workEndHour: 18,
        reminderIntervalMin: 90,
        favoriteTypes: ['MEDITATION'],
      },
    }))

    expect(result?.rule).toBe('stress_high')
    expect(result?.exercise.type).toBe('MEDITATION')
  })

  it('ne restreint rien quand aucune préférence n\'a été exprimée', () => {
    expect(candidatePool(input())).toHaveLength(CATALOGUE.length)
  })

  // Sans tirage au sort : c'est l'usage qui fait tourner les suggestions.
  it('propose en priorité l\'exercice le moins récemment fait', () => {
    const activity = new Map([
      ['souffle-court', { lastCompletedAt: new Date('2026-08-10T09:00:00Z') }],
      ['souffle-moyen', { lastCompletedAt: new Date('2026-08-05T09:00:00Z') }],
    ])

    const result = recommend(input({ checkIn: { mood: 3, stress: 4 }, activity }))

    expect(result?.exercise.id).toBe('souffle-moyen')
  })

  it('se rabat sur la famille voulue quand aucune durée ne convient', () => {
    const result = recommend(input({
      checkIn: { mood: 3, stress: 4 },
      catalogue: [exercise('souffle-long', 'BREATHING', 8), exercise('etirement-court', 'STRETCHING', 2)],
    }))

    expect(result?.exercise.id).toBe('souffle-long')
  })

  // Le profil et la fraîcheur sont deux règles dures de F6 : plutôt que d'en
  // contredire une pour remplir la carte, le moteur ne propose rien.
  it('ne propose rien quand tout a été fait ces deux derniers jours', () => {
    const activity = new Map(CATALOGUE.map(item => [item.id, { lastCompletedAt: NOON }]))

    expect(recommend(input({ activity }))).toBeNull()
  })
})

describe('doneWithinTwoDays', () => {
  it('laisse passer un exercice jamais fait', () => {
    expect(doneWithinTwoDays(undefined, NOON)).toBe(false)
  })

  it('écarte un exercice fait aujourd\'hui', () => {
    expect(doneWithinTwoDays(new Date('2026-08-21T06:00:00Z'), NOON)).toBe(true)
  })

  // La règle porte sur des journées civiles et non sur 48 heures : un exercice
  // fait hier à 9 h reste écarté aujourd'hui à 18 h.
  it('écarte un exercice fait hier, quelle que soit l\'heure', () => {
    expect(doneWithinTwoDays(new Date('2026-08-20T07:00:00Z'), NOON)).toBe(true)
    expect(doneWithinTwoDays(new Date('2026-08-20T20:00:00Z'), NOON)).toBe(true)
  })

  it('laisse repasser un exercice fait avant-hier', () => {
    expect(doneWithinTwoDays(new Date('2026-08-19T20:00:00Z'), NOON)).toBe(false)
  })
})

describe('sittingMinutes', () => {
  it('compte depuis la fin de la dernière pause', () => {
    expect(sittingMinutes(input({ lastBreakEndedAt: minutesAgo(NOON, 45) }))).toBe(45)
  })

  // Sans pause prise, la référence est le début de la journée déclarée : ce qui
  // est mesuré est le temps assis, pas le temps depuis l'ouverture de l'écran.
  it('compte depuis le début de la journée quand aucune pause n\'a été prise', () => {
    expect(sittingMinutes(input({ lastBreakEndedAt: null }))).toBe(300)
  })

  it('ne remonte jamais avant le début de la journée déclarée', () => {
    // Pause terminée hier soir : le compteur repart de 9 h, pas de 19 h.
    expect(sittingMinutes(input({ lastBreakEndedAt: new Date('2026-08-20T17:00:00Z') }))).toBe(300)
  })

  it('ne compte rien pendant une pause', () => {
    expect(sittingMinutes(input({ breakRunning: true }))).toBeNull()
  })

  it('ne compte rien avant le début de la journée déclarée', () => {
    // 7 h à Paris, pour une journée qui commence à 9 h.
    expect(sittingMinutes(input({ now: new Date('2026-08-21T05:00:00Z') }))).toBeNull()
  })

  // Une pause datée dans l'avenir donnait un temps assis négatif, affiché tel
  // quel : « -494 min ». L'horloge du serveur peut être resynchronisée, et un
  // jeu de démonstration peut mal se dater.
  it('ne descend jamais sous zéro', () => {
    const future = new Date(NOON.getTime() + 90 * 60_000)

    expect(sittingMinutes(input({ lastBreakEndedAt: future }))).toBe(0)
  })
})

describe('sittingState', () => {
  it('dit que le compteur part de la dernière pause', () => {
    expect(sittingState(input({ lastBreakEndedAt: minutesAgo(NOON, 45) })))
      .toEqual({ minutes: 45, basis: 'break' })
  })

  // « Depuis votre dernière pause » est faux quand il n'y en a pas eu
  // aujourd'hui : c'est le genre de faux que personne ne relève, parce qu'il est
  // presque toujours vrai.
  it('dit que le compteur part de la journée quand aucune pause n\'a été prise', () => {
    expect(sittingState(input({ lastBreakEndedAt: null })))
      .toEqual({ minutes: 300, basis: 'workday' })
  })
})

describe('règle long_sitting — le seuil suit le réglage de la personne', () => {
  const sitting = (minutes: number, reminderIntervalMin: number) =>
    recommend(input({
      lastBreakEndedAt: minutesAgo(NOON, minutes),
      preferences: { workStartHour: 9, workEndHour: 18, reminderIntervalMin, favoriteTypes: [] },
    }))

  it('se déclenche à deux fois l\'intervalle de rappel', () => {
    expect(sitting(200, 60)?.rule).toBe('long_sitting')
    expect(sitting(200, 120)?.rule).toBe('default')
  })

  it('énonce la durée d\'immobilité dans son motif', () => {
    expect(sitting(200, 90)?.reason).toContain('3 h 20')
    expect(sitting(100, 45)?.reason).toContain('1 h 40')
  })
})
