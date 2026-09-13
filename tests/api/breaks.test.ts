import { describe, expect, it } from 'vitest'
import { Prisma } from '../../lib/generated/prisma/client.js'
import { expectApiError, prismaMock, signIn, testEvent } from '../helpers/nitro'

import startBreak from '../../server/api/breaks/index.post'
import stopBreak from '../../server/api/breaks/current.patch'
import readBreaks from '../../server/api/breaks/index.get'

/**
 * CU-07 — Suivre une pause.
 *
 * Les trois routes du minuteur ont un point commun qui vaut d'être vérifié :
 * **aucune ne reçoit d'identifiant**. Ni celui du collaborateur, ni celui de la
 * pause. Il n'y a donc rien à falsifier pour agir sur la pause de quelqu'un
 * d'autre, et c'est la raison pour laquelle aucune des trois ne porte de
 * contrôle d'appartenance : le périmètre est la session.
 */

const PREFERENCES = {
  workStartHour: 9,
  workEndHour: 18,
  remindersEnabled: true,
  reminderIntervalMin: 90,
  favoriteTypes: ['BREATHING'],
}

describe('POST /api/breaks — démarrer une pause', () => {
  it('crée la pause et rend un minuteur à zéro', async () => {
    signIn()
    const startedAt = new Date('2026-08-27T09:12:00Z')
    prismaMock.breakSession.create.mockResolvedValue({ id: 'brk_1', startedAt })

    const result = await startBreak(testEvent({ method: 'POST', path: '/api/breaks' }))

    expect(result).toEqual({ current: { id: 'brk_1', startedAt, elapsedSec: 0 } })
    // L'heure de début n'est pas transmise : c'est la base qui l'inscrit.
    expect(prismaMock.breakSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'usr_collab' } }),
    )
  })

  /**
   * Le second onglet. L'index partiel de la base rejette l'insertion (P2002) et
   * la route traduit ce refus en 409 — le code que l'interface reconnaît pour
   * mener au minuteur sans afficher d'erreur.
   */
  it('refuse une seconde pause ouverte, sans la présenter comme une panne', async () => {
    signIn()
    prismaMock.breakSession.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '7' }),
    )

    await expectApiError(
      startBreak(testEvent({ method: 'POST', path: '/api/breaks' })),
      { statusCode: 409, code: 'break_already_running' },
    )
  })

  /**
   * Toute autre défaillance de la base **remonte telle quelle**. La traduire en
   * 409 ferait passer une panne pour un état normal, et l'interface enverrait
   * l'utilisateur sur un minuteur qui n'a jamais démarré.
   */
  it('ne masque pas les autres erreurs de la base', async () => {
    signIn()
    prismaMock.breakSession.create.mockRejectedValue(new Error('connexion perdue'))

    await expect(startBreak(testEvent({ method: 'POST', path: '/api/breaks' })))
      .rejects.toThrow('connexion perdue')
  })

  it('exige une session', async () => {
    await expectApiError(
      startBreak(testEvent({ method: 'POST', path: '/api/breaks' })),
      { statusCode: 401 },
    )
  })
})

describe('PATCH /api/breaks/current — arrêter la pause', () => {
  it('termine la pause en cours et rend sa durée', async () => {
    signIn()
    const startedAt = new Date(Date.now() - 12 * 60 * 1000)
    prismaMock.breakSession.findFirst.mockResolvedValue({ id: 'brk_1', startedAt })
    prismaMock.breakSession.update.mockResolvedValue({
      id: 'brk_1',
      startedAt,
      endedAt: new Date(),
      durationSec: 720,
    })

    const result = await stopBreak(testEvent({ method: 'PATCH', path: '/api/breaks/current' }))

    expect(result.session.durationSec).toBe(720)
    // La pause est terminée, pas supprimée : c'est un `update`.
    expect(prismaMock.breakSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'brk_1' } }),
    )
    expect(prismaMock.breakSession.delete).not.toHaveBeenCalled()
  })

  it('refuse quand aucune pause n\'est ouverte', async () => {
    signIn()
    prismaMock.breakSession.findFirst.mockResolvedValue(null)

    await expectApiError(
      stopBreak(testEvent({ method: 'PATCH', path: '/api/breaks/current' })),
      { statusCode: 404, code: 'no_break_running' },
    )
  })

  /**
   * Une pause oubliée depuis la veille a déjà été close d'office à la lecture
   * (`readRunningBreak`). Il n'y a alors plus rien à arrêter, et la route le dit
   * plutôt que d'inventer une durée de quinze heures.
   */
  it('n\'arrête pas une pause que le plafond a déjà close', async () => {
    signIn()
    prismaMock.breakSession.findFirst.mockResolvedValue({
      id: 'brk_oublie',
      startedAt: new Date(Date.now() - 15 * 60 * 60 * 1000),
    })
    prismaMock.breakSession.update.mockResolvedValue({})

    await expectApiError(
      stopBreak(testEvent({ method: 'PATCH', path: '/api/breaks/current' })),
      { statusCode: 404, code: 'no_break_running' },
    )
  })

  it('exige une session', async () => {
    await expectApiError(
      stopBreak(testEvent({ method: 'PATCH', path: '/api/breaks/current' })),
      { statusCode: 401 },
    )
  })
})

describe('GET /api/breaks — état de l\'écran du minuteur', () => {
  it('rend le minuteur, l\'historique découpé en journées et l\'objectif', async () => {
    signIn()
    prismaMock.breakSession.findFirst.mockResolvedValue(null)
    prismaMock.breakSession.findMany.mockResolvedValue([])
    prismaMock.preference.upsert.mockResolvedValue(PREFERENCES)

    const result = await readBreaks(testEvent({ path: '/api/breaks?days=7' }))

    expect(result.current).toBeNull()
    expect(result.days).toHaveLength(7)
    // Neuf heures de travail, un rappel toutes les 90 minutes : six pauses.
    expect(result.goal).toBe(6)
    expect(result.preferences).toEqual(PREFERENCES)
  })

  /**
   * L'écoulé est calculé par le serveur pour le premier affichage : le
   * navigateur prend ensuite le relais, mais une pendule qui retarde ne doit pas
   * décider de l'heure de début.
   */
  it('calcule l\'écoulé de la pause en cours côté serveur', async () => {
    signIn()
    prismaMock.breakSession.findFirst.mockResolvedValue({
      id: 'brk_1',
      startedAt: new Date(Date.now() - 90 * 1000),
    })
    prismaMock.breakSession.findMany.mockResolvedValue([])
    prismaMock.preference.upsert.mockResolvedValue(PREFERENCES)

    const result = await readBreaks(testEvent({ path: '/api/breaks' }))

    expect(result.current?.elapsedSec).toBeGreaterThanOrEqual(89)
    expect(result.current?.elapsedSec).toBeLessThanOrEqual(91)
  })

  it('refuse une profondeur d\'historique hors bornes', async () => {
    signIn()

    const refus = await expectApiError(
      readBreaks(testEvent({ path: '/api/breaks?days=900' })),
      { statusCode: 422 },
    )

    expect(refus.data?.errors?.days).toBeDefined()
  })

  it('exige une session', async () => {
    await expectApiError(readBreaks(testEvent({ path: '/api/breaks' })), { statusCode: 401 })
  })
})
