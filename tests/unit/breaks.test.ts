import { describe, expect, it } from 'vitest'
import {
  MAX_BREAK_DURATION_SEC,
  breakDurationSec,
  dailyBreakGoal,
  elapsedSec,
  groupSessionsByDay,
} from '../../server/utils/breaks'

/** Une pause terminée, telle que Prisma la renvoie. */
function session(startedAt: string, durationSec: number) {
  const started = new Date(startedAt)

  return {
    id: startedAt,
    startedAt: started,
    endedAt: new Date(started.getTime() + durationSec * 1000),
    durationSec,
  }
}

describe('elapsedSec', () => {
  it('compte les secondes écoulées', () => {
    expect(elapsedSec(new Date('2026-08-19T10:00:00Z'), new Date('2026-08-19T10:12:30Z'))).toBe(750)
  })

  // L'horloge du serveur peut être resynchronisée entre le démarrage et l'arrêt.
  // Une durée négative se propagerait telle quelle dans les moyennes d'équipe.
  it('ne descend jamais sous zéro', () => {
    expect(elapsedSec(new Date('2026-08-19T10:05:00Z'), new Date('2026-08-19T10:00:00Z'))).toBe(0)
  })
})

describe('breakDurationSec', () => {
  it('mesure une pause ordinaire', () => {
    expect(breakDurationSec(new Date('2026-08-19T10:00:00Z'), new Date('2026-08-19T10:15:00Z'))).toBe(900)
  })

  // A2 de CU-07 : le minuteur laissé ouvert le vendredi soir ne doit pas
  // compter le week-end entier.
  it('plafonne une pause oubliée', () => {
    expect(breakDurationSec(new Date('2026-08-19T18:00:00Z'), new Date('2026-08-22T09:00:00Z')))
      .toBe(MAX_BREAK_DURATION_SEC)
  })
})

describe('groupSessionsByDay', () => {
  const now = new Date('2026-08-19T15:00:00Z')

  it('range chaque pause dans sa journée, de la plus récente à la plus ancienne', () => {
    const days = groupSessionsByDay(
      [
        session('2026-08-19T12:00:00Z', 600),
        session('2026-08-19T09:00:00Z', 300),
        session('2026-08-17T09:00:00Z', 900),
      ],
      3,
      now,
    )

    expect(days.map(day => day.date)).toEqual(['2026-08-19', '2026-08-18', '2026-08-17'])
    expect(days[0]).toMatchObject({ count: 2, totalSec: 900 })
    expect(days[2]).toMatchObject({ count: 1, totalSec: 900 })
  })

  // La fréquence des interruptions est l'indicateur mis en avant (F3) : une
  // journée sans pause doit se lire comme telle, pas comme une journée absente.
  it('conserve les journées sans aucune pause', () => {
    const days = groupSessionsByDay([], 3, now)

    expect(days).toHaveLength(3)
    expect(days.every(day => day.count === 0 && day.totalSec === 0 && day.sessions.length === 0)).toBe(true)
  })

  it('écarte les pauses hors de la fenêtre demandée', () => {
    const days = groupSessionsByDay([session('2026-08-10T09:00:00Z', 600)], 2, now)

    expect(days.reduce((total, day) => total + day.count, 0)).toBe(0)
  })

  // Le recul se fait en jours civils : retirer 24 heures sauterait le 29 mars,
  // qui ne dure que 23 heures à Paris.
  it('traverse un changement d\'heure sans sauter de journée', () => {
    const days = groupSessionsByDay([], 3, new Date('2026-03-30T10:00:00Z'))

    expect(days.map(day => day.date)).toEqual(['2026-03-30', '2026-03-29', '2026-03-28'])
  })

  it('traverse un changement de mois', () => {
    const days = groupSessionsByDay([], 2, new Date('2026-03-01T10:00:00Z'))

    expect(days.map(day => day.date)).toEqual(['2026-03-01', '2026-02-28'])
  })
})

describe('dailyBreakGoal', () => {
  it('déduit l\'objectif des horaires et de la fréquence de rappel', () => {
    expect(dailyBreakGoal({ workStartHour: 9, workEndHour: 18, reminderIntervalMin: 90 })).toBe(6)
    expect(dailyBreakGoal({ workStartHour: 9, workEndHour: 18, reminderIntervalMin: 30 })).toBe(18)
  })

  // Une journée plus courte que l'intervalle de rappel donnerait zéro : une
  // barre de progression sur zéro pause n'affiche rien à atteindre.
  it('vise au moins une pause', () => {
    expect(dailyBreakGoal({ workStartHour: 9, workEndHour: 10, reminderIntervalMin: 120 })).toBe(1)
  })
})
