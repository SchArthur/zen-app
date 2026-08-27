import { describe, expect, it } from 'vitest'
import { expectApiError, prismaMock, responseStatus, signIn, testEvent } from '../helpers/nitro'

import readCatalogue from '../../server/api/exercises/index.get'
import readExercise from '../../server/api/exercises/[slug].get'
import logExercise from '../../server/api/exercises/[slug]/log.post'

/**
 * CU-08 — le catalogue d'exercices, et CU-08.1 — déclarer une réalisation.
 *
 * Le catalogue est du **contenu éditorial** : il est le même pour tout le monde,
 * ouvert aux trois rôles, et il n'y a donc rien à cloisonner. Ce qui est
 * personnel, c'est ce qui vient s'y greffer — les réalisations et les familles
 * préférées — et c'est là que les tests regardent.
 */

const SOUFFLE = {
  id: 'exr_1',
  slug: 'souffle-4-7-8',
  title: 'Souffle 4-7-8',
  description: 'Une respiration lente pour redescendre.',
  type: 'BREATHING',
  durationMin: 4,
  steps: ['Inspirez 4 secondes', 'Retenez 7 secondes', 'Expirez 8 secondes'],
}

const PREFERENCES = {
  workStartHour: 9,
  workEndHour: 18,
  remindersEnabled: true,
  reminderIntervalMin: 90,
  favoriteTypes: ['BREATHING'],
}

function serveCatalogue(exercises = [SOUFFLE]) {
  prismaMock.exercise.findMany.mockResolvedValue(exercises)
  prismaMock.exercise.groupBy.mockResolvedValue([
    { type: 'BREATHING', _count: { _all: 5 } },
    { type: 'STRETCHING', _count: { _all: 6 } },
    { type: 'MEDITATION', _count: { _all: 4 } },
  ])
  prismaMock.exerciseLog.findMany.mockResolvedValue([])
  prismaMock.preference.upsert.mockResolvedValue(PREFERENCES)
}

describe('GET /api/exercises — le catalogue (CU-08)', () => {
  it('rend la liste, le décompte par famille et les familles préférées', async () => {
    signIn()
    serveCatalogue()

    const result = await readCatalogue(testEvent({ path: '/api/exercises' }))

    expect(result.exercises).toHaveLength(1)
    expect(result.countsByType).toEqual({ BREATHING: 5, STRETCHING: 6, MEDITATION: 4 })
    expect(result.favoriteTypes).toEqual(['BREATHING'])
    expect(result.doneToday).toBe(0)
  })

  /** F4 demande les deux filtres, facultatifs et cumulables. */
  it('applique les filtres de famille et de durée ensemble', async () => {
    signIn()
    serveCatalogue()

    await readCatalogue(testEvent({ path: '/api/exercises?type=BREATHING&maxMin=5' }))

    expect(prismaMock.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, type: 'BREATHING', durationMin: { lte: 5 } },
      }),
    )
  })

  /**
   * Les pastilles annoncent ce que donnerait un changement de famille **à durée
   * constante** : le décompte ignore donc le filtre de famille. Les calculer sur
   * la requête complète afficherait zéro partout sauf sur la famille choisie.
   */
  it('compte les familles sans tenir compte de la famille sélectionnée', async () => {
    signIn()
    serveCatalogue()

    await readCatalogue(testEvent({ path: '/api/exercises?type=BREATHING&maxMin=5' }))

    expect(prismaMock.exercise.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, durationMin: { lte: 5 } } }),
    )
  })

  it('refuse une famille inconnue', async () => {
    signIn()

    await expectApiError(readCatalogue(testEvent({ path: '/api/exercises?type=SIESTE' })), {
      statusCode: 422,
    })
  })

  /** Sans borne, `?maxMin=1e12` traverserait la validation. */
  it('refuse une durée hors bornes', async () => {
    signIn()

    await expectApiError(readCatalogue(testEvent({ path: '/api/exercises?maxMin=999' })), {
      statusCode: 422,
    })
  })

  it('exige une session', async () => {
    await expectApiError(readCatalogue(testEvent({ path: '/api/exercises' })), { statusCode: 401 })
  })
})

describe('GET /api/exercises/[slug] — la fiche détaillée', () => {
  it('rend le déroulé pas à pas et trois exercices de la même famille', async () => {
    signIn()
    prismaMock.exercise.findFirst.mockResolvedValue(SOUFFLE)
    prismaMock.exerciseLog.findMany.mockResolvedValue([])
    prismaMock.exercise.findMany.mockResolvedValue([
      { slug: 'souffle-carre', title: 'Souffle carré', durationMin: 3, type: 'BREATHING' },
    ])

    const result = await readExercise(testEvent({
      path: '/api/exercises/souffle-4-7-8',
      params: { slug: 'souffle-4-7-8' },
    }))

    expect(result.exercise.steps).toHaveLength(3)
    expect(result.related).toHaveLength(1)
    // La fiche ne doit pas se refermer sur elle-même.
    expect(prismaMock.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'exr_1' } }),
        take: 3,
      }),
    )
  })

  it('rend 404 pour un exercice inexistant', async () => {
    signIn()
    prismaMock.exercise.findFirst.mockResolvedValue(null)

    await expectApiError(
      readExercise(testEvent({ path: '/api/exercises/nuque-douce-2', params: { slug: 'nuque-douce-2' } })),
      { statusCode: 404, code: 'exercise_not_found' },
    )
  })

  /**
   * Un identifiant mal formé produit **la même réponse** qu'un exercice absent.
   * Répondre 422 sur l'un et 404 sur l'autre apprendrait à un curieux à
   * distinguer une syntaxe refusée d'un contenu absent.
   */
  it('traite un identifiant mal formé comme un exercice introuvable', async () => {
    signIn()

    const refus = await expectApiError(
      readExercise(testEvent({ path: '/api/exercises/x', params: { slug: '../../etc/passwd' } })),
      { statusCode: 404, code: 'exercise_not_found' },
    )

    expect(refus.statusCode).toBe(404)
    // La base n'a même pas été interrogée.
    expect(prismaMock.exercise.findFirst).not.toHaveBeenCalled()
  })

  it('exige une session', async () => {
    await expectApiError(
      readExercise(testEvent({ path: '/api/exercises/souffle-4-7-8', params: { slug: 'souffle-4-7-8' } })),
      { statusCode: 401 },
    )
  })
})

describe('POST /api/exercises/[slug]/log — déclarer une réalisation (CU-08.1)', () => {
  it('enregistre la réalisation et répond 201', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.exercise.findFirst.mockResolvedValue(SOUFFLE)
    prismaMock.exerciseLog.findFirst.mockResolvedValue(null)
    prismaMock.exerciseLog.create.mockResolvedValue({ id: 'log_1', completedAt: new Date() })

    const event = testEvent({
      method: 'POST',
      path: '/api/exercises/souffle-4-7-8/log',
      params: { slug: 'souffle-4-7-8' },
    })
    const result = await logExercise(event)

    expect(result.repeated).toBe(false)
    expect(responseStatus(event)).toBe(201)
    // L'heure est celle du serveur : rien n'entre par la requête.
    expect(prismaMock.exerciseLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'usr_1', exerciseId: 'exr_1' } }),
    )
  })

  /**
   * Double clic, retour arrière, second onglet : la même réalisation arrive deux
   * fois. Elle n'est comptée qu'une, et la réponse reste un succès — la personne
   * n'a rien fait de mal, elle n'a aucune raison de voir une erreur.
   */
  it('ne compte pas deux fois une déclaration répétée, et ne la présente pas comme un échec', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.exercise.findFirst.mockResolvedValue(SOUFFLE)
    prismaMock.exerciseLog.findFirst.mockResolvedValue({
      id: 'log_1',
      completedAt: new Date(Date.now() - 30_000),
    })

    const event = testEvent({
      method: 'POST',
      path: '/api/exercises/souffle-4-7-8/log',
      params: { slug: 'souffle-4-7-8' },
    })
    const result = await logExercise(event)

    expect(result.repeated).toBe(true)
    expect(responseStatus(event)).toBe(200)
    expect(prismaMock.exerciseLog.create).not.toHaveBeenCalled()
  })

  /** La fenêtre de déduplication est la durée de l'exercice, pas une constante. */
  it('compte une nouvelle réalisation passé la durée de l\'exercice', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.exercise.findFirst.mockResolvedValue(SOUFFLE)
    prismaMock.exerciseLog.findFirst.mockResolvedValue({
      id: 'log_1',
      completedAt: new Date(Date.now() - 5 * 60_000),
    })
    prismaMock.exerciseLog.create.mockResolvedValue({ id: 'log_2', completedAt: new Date() })

    const result = await logExercise(testEvent({
      method: 'POST',
      params: { slug: 'souffle-4-7-8' },
    }))

    expect(result.repeated).toBe(false)
  })

  /** Un exercice retiré du catalogue ne peut plus être déclaré (RG12). */
  it('refuse de déclarer un exercice retiré du catalogue', async () => {
    signIn()
    prismaMock.exercise.findFirst.mockResolvedValue(null)

    await expectApiError(
      logExercise(testEvent({ method: 'POST', params: { slug: 'exercice-retire' } })),
      { statusCode: 404, code: 'exercise_not_found' },
    )
  })

  it('exige une session', async () => {
    await expectApiError(
      logExercise(testEvent({ method: 'POST', params: { slug: 'souffle-4-7-8' } })),
      { statusCode: 401 },
    )
  })
})
