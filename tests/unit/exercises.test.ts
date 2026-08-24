import { describe, expect, it } from 'vitest'
import { exerciseFilter, isRepeatDeclaration, summariseActivity } from '../../server/utils/exercises'

/** Une réalisation, telle que Prisma la renvoie. */
function log(exerciseId: string, completedAt: string) {
  return { exerciseId, completedAt: new Date(completedAt) }
}

describe('summariseActivity', () => {
  // Le catalogue lit les réalisations du plus récent au plus ancien : le premier
  // enregistrement rencontré pour un exercice est donc sa dernière réalisation.
  const now = new Date('2026-08-21T09:00:00Z')

  it('compte les réalisations par exercice', () => {
    const { byExercise } = summariseActivity(
      [
        log('nuque', '2026-08-20T14:00:00Z'),
        log('nuque', '2026-08-18T10:00:00Z'),
        log('souffle', '2026-08-17T11:00:00Z'),
      ],
      now,
    )

    expect(byExercise.get('nuque')?.count).toBe(2)
    expect(byExercise.get('souffle')?.count).toBe(1)
    expect(byExercise.get('meditation')).toBeUndefined()
  })

  it('retient la réalisation la plus récente', () => {
    const { byExercise } = summariseActivity(
      [log('nuque', '2026-08-20T14:00:00Z'), log('nuque', '2026-08-18T10:00:00Z')],
      now,
    )

    expect(byExercise.get('nuque')?.lastCompletedAt.toISOString()).toBe('2026-08-20T14:00:00.000Z')
  })

  it('distingue ce qui a été fait aujourd\'hui', () => {
    const { byExercise, todayCount } = summariseActivity(
      [log('nuque', '2026-08-21T07:30:00Z'), log('souffle', '2026-08-20T14:00:00Z')],
      now,
    )

    expect(byExercise.get('nuque')?.doneToday).toBe(true)
    expect(byExercise.get('souffle')?.doneToday).toBe(false)
    expect(todayCount).toBe(1)
  })

  // La journée est celle de Paris, pas celle du serveur : à 1 h du matin à Paris
  // en été, la journée UTC a deux heures de retard sur celle de l'utilisateur.
  it('rattache la réalisation à la journée locale', () => {
    const parisMidnightPassed = new Date('2026-08-20T23:30:00Z') // 21 août, 1 h 30 à Paris

    const { byExercise, todayCount } = summariseActivity(
      [
        log('tardif', '2026-08-20T22:30:00Z'), // 21 août, 0 h 30 à Paris
        log('veille', '2026-08-20T20:00:00Z'), // 20 août, 22 h à Paris
      ],
      parisMidnightPassed,
    )

    expect(byExercise.get('tardif')?.doneToday).toBe(true)
    expect(byExercise.get('veille')?.doneToday).toBe(false)
    expect(todayCount).toBe(1)
  })

  it('marque « fait aujourd\'hui » dès qu\'une des réalisations l\'est', () => {
    const { byExercise } = summariseActivity(
      [log('nuque', '2026-08-21T08:00:00Z'), log('nuque', '2026-08-14T08:00:00Z')],
      now,
    )

    expect(byExercise.get('nuque')).toMatchObject({ count: 2, doneToday: true })
  })

  it('ne compte rien quand rien n\'a été fait', () => {
    const { byExercise, todayCount } = summariseActivity([], now)

    expect(byExercise.size).toBe(0)
    expect(todayCount).toBe(0)
  })
})

describe('isRepeatDeclaration', () => {
  const now = new Date('2026-08-21T09:00:00Z')

  it('laisse passer une première déclaration', () => {
    expect(isRepeatDeclaration(null, 5, now)).toBe(false)
  })

  // Le double clic est le cas nominal du bouton « Je l'ai fait » : deux appels
  // pour un seul exercice réellement fait.
  it('absorbe deux clics rapprochés', () => {
    expect(isRepeatDeclaration(new Date('2026-08-21T08:59:58Z'), 5, now)).toBe(true)
  })

  // La fenêtre est la durée annoncée de l'exercice : on ne peut pas avoir fait
  // deux fois un exercice de cinq minutes en moins de cinq minutes.
  it('mesure la fenêtre sur la durée de l\'exercice', () => {
    const fourMinutesAgo = new Date('2026-08-21T08:56:00Z')

    expect(isRepeatDeclaration(fourMinutesAgo, 5, now)).toBe(true)
    expect(isRepeatDeclaration(fourMinutesAgo, 2, now)).toBe(false)
  })

  it('rouvre exactement au bout de la durée annoncée', () => {
    expect(isRepeatDeclaration(new Date('2026-08-21T08:55:00Z'), 5, now)).toBe(false)
  })

  it('laisse passer une réalisation du même exercice le lendemain', () => {
    expect(isRepeatDeclaration(new Date('2026-08-20T09:00:00Z'), 8, now)).toBe(false)
  })
})

describe('exerciseFilter', () => {
  // Un exercice retiré du catalogue n'est jamais renvoyé, quel que soit le
  // filtre demandé : c'est la seule clause qui ne dépend pas de la requête.
  it('écarte toujours les exercices retirés', () => {
    expect(exerciseFilter({})).toEqual({ isActive: true })
  })

  it('n\'ajoute une clause que pour les filtres réellement demandés', () => {
    expect(exerciseFilter({ type: 'BREATHING' })).toEqual({ isActive: true, type: 'BREATHING' })
    expect(exerciseFilter({ maxMin: 3 })).toEqual({ isActive: true, durationMin: { lte: 3 } })
  })

  it('cumule les deux filtres', () => {
    expect(exerciseFilter({ type: 'MEDITATION', maxMin: 4 })).toEqual({
      isActive: true,
      type: 'MEDITATION',
      durationMin: { lte: 4 },
    })
  })
})
