import { describe, expect, it } from 'vitest'
import { dayKey } from '../../shared/utils/time'
import { expectApiError, prismaMock, signIn, testEvent } from '../helpers/nitro'

import dashboard from '../../server/api/dashboard.get'
import stats from '../../server/api/stats.get'

/**
 * CU-10 et CU-11 — le tableau de bord et les statistiques personnelles.
 *
 * Ce que ces deux routes ne renvoient **jamais** est aussi important que ce
 * qu'elles renvoient : F7 exclut nommément toute moyenne d'équipe, tout
 * classement et tout indice composite de bien-être. La seule comparaison que le
 * produit s'autorise est celle de soi-même à la période précédente, et c'est
 * vérifié ici.
 */

const PREFERENCES = {
  workStartHour: 9,
  workEndHour: 18,
  remindersEnabled: true,
  reminderIntervalMin: 90,
  favoriteTypes: ['BREATHING'],
}

const CATALOGUE = [
  { id: 'exr_1', slug: 'souffle-4-7-8', title: 'Souffle 4-7-8', description: 'Respirer.', type: 'BREATHING', durationMin: 4 },
  { id: 'exr_2', slug: 'nuque-douce', title: 'Nuque douce', description: 'S\'étirer.', type: 'STRETCHING', durationMin: 2 },
]

const TODAY = dayKey(new Date())

function serveDashboard(options: { checkIn?: { mood: number, stress: number } | null } = {}) {
  prismaMock.preference.upsert.mockResolvedValue(PREFERENCES)
  prismaMock.breakSession.findFirst.mockResolvedValue(null)
  prismaMock.breakSession.findMany.mockResolvedValue([])
  prismaMock.moodCheckIn.findUnique.mockResolvedValue(
    options.checkIn
      ? { date: new Date(`${TODAY}T00:00:00.000Z`), ...options.checkIn }
      : null,
  )
  prismaMock.moodCheckIn.findMany.mockResolvedValue([])
  prismaMock.exerciseLog.findMany.mockResolvedValue([])
  prismaMock.exercise.findMany.mockResolvedValue(CATALOGUE)
}

describe('GET /api/dashboard — « et là, maintenant ? » (CU-10, CU-11)', () => {
  it('rend l\'état du jour, la semaine d\'humeur complétée et une recommandation', async () => {
    signIn()
    serveDashboard({ checkIn: { mood: 4, stress: 2 } })

    const result = await dashboard(testEvent({ path: '/api/dashboard' }))

    expect(result.breaks.goal).toBe(6)
    expect(result.mood.today).toEqual({ date: TODAY, mood: 4, stress: 2 })
    expect(result.recommendation).toBeDefined()
    expect(result.preferences).toEqual(PREFERENCES)
  })

  /**
   * A2 de CU-09 : une journée non déclarée vaut `null`, jamais zéro. Un zéro se
   * lirait comme une humeur au plus bas, ce qui est exactement le contresens à
   * éviter. La fenêtre est complétée par le **serveur**, qui décide où commence
   * aujourd'hui — laisser le navigateur la reconstruire la ferait diverger au
   * passage de minuit.
   */
  it('complète la semaine d\'humeur sans transformer une absence en zéro', async () => {
    signIn()
    serveDashboard()

    const result = await dashboard(testEvent({ path: '/api/dashboard' }))

    expect(result.mood.week).toHaveLength(7)
    expect(result.mood.week.every(day => day.mood === null && day.stress === null)).toBe(true)
    // Ordre chronologique : la série se lit de gauche à droite.
    expect(result.mood.week.at(-1)?.date).toBe(TODAY)
  })

  /**
   * La fin de la dernière pause est cherchée sur `endedAt`, et non sur l'ordre
   * de la requête, qui trie par heure de **début** : une pause commencée plus
   * tôt peut s'être terminée plus tard.
   */
  it('retient la pause terminée la plus tard, pas la plus tard commencée', async () => {
    signIn()
    serveDashboard()

    const longue = { id: 'brk_1', startedAt: new Date('2026-08-27T09:00:00Z'), endedAt: new Date('2026-08-27T10:30:00Z'), durationSec: 5400 }
    const courte = { id: 'brk_2', startedAt: new Date('2026-08-27T10:00:00Z'), endedAt: new Date('2026-08-27T10:05:00Z'), durationSec: 300 }
    prismaMock.breakSession.findMany.mockResolvedValue([courte, longue])

    const result = await dashboard(testEvent({ path: '/api/dashboard' }))

    expect(result.breaks.lastEndedAt).toEqual(longue.endedAt)
  })

  /** F7 : ni score global, ni comparaison avec d'autres utilisateurs. */
  it('ne renvoie aucun indice global ni aucune donnée d\'autrui', async () => {
    signIn()
    serveDashboard({ checkIn: { mood: 4, stress: 2 } })

    const payload = JSON.stringify(await dashboard(testEvent({ path: '/api/dashboard' })))

    for (const interdit of ['score', 'ranking', 'classement', 'teamAvg', 'companyAvg']) {
      expect(payload).not.toContain(interdit)
    }
  })

  it('exige une session', async () => {
    await expectApiError(dashboard(testEvent({ path: '/api/dashboard' })), { statusCode: 401 })
  })
})

describe('GET /api/stats — « comment j\'évolue ? » (CU-11)', () => {
  it('rend la série de la période et sa comparaison avec la précédente', async () => {
    signIn()
    prismaMock.breakSession.findMany.mockResolvedValue([])
    prismaMock.exerciseLog.findMany.mockResolvedValue([])
    prismaMock.moodCheckIn.findMany.mockResolvedValue([])

    const result = await stats(testEvent({ path: '/api/stats?period=semaine' }))

    expect(result.period).toBe('semaine')
    expect(result.days).toBe(7)
    expect(result.series).toHaveLength(7)
    expect(result.previous).toBeDefined()
  })

  it('accepte la période « mois » et rend trente journées', async () => {
    signIn()
    prismaMock.breakSession.findMany.mockResolvedValue([])
    prismaMock.exerciseLog.findMany.mockResolvedValue([])
    prismaMock.moodCheckIn.findMany.mockResolvedValue([])

    const result = await stats(testEvent({ path: '/api/stats?period=mois' }))

    expect(result.series).toHaveLength(30)
  })

  /**
   * La requête remonte **deux fois** la période, en une fois : la moitié récente
   * donne les indicateurs, l'ancienne le point de comparaison. Deux requêtes
   * séparées liraient les mêmes lignes deux fois.
   */
  it('ne lit l\'historique qu\'une fois pour les deux périodes', async () => {
    signIn()
    prismaMock.breakSession.findMany.mockResolvedValue([])
    prismaMock.exerciseLog.findMany.mockResolvedValue([])
    prismaMock.moodCheckIn.findMany.mockResolvedValue([])

    await stats(testEvent({ path: '/api/stats?period=semaine' }))

    expect(prismaMock.breakSession.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.exerciseLog.findMany).toHaveBeenCalledTimes(1)
  })

  /**
   * Une tendance à `null` signifie « rien à comparer », et l'écran doit le dire
   * plutôt que d'afficher un zéro qui se lirait comme une absence de progrès.
   */
  it('rend des tendances nulles sur l\'humeur quand rien n\'a été déclaré', async () => {
    signIn()
    prismaMock.breakSession.findMany.mockResolvedValue([])
    prismaMock.exerciseLog.findMany.mockResolvedValue([])
    prismaMock.moodCheckIn.findMany.mockResolvedValue([])

    const result = await stats(testEvent({ path: '/api/stats' }))

    expect(result.trends.mood).toBeNull()
    expect(result.trends.stress).toBeNull()
  })

  it('refuse une période inconnue', async () => {
    signIn()

    await expectApiError(stats(testEvent({ path: '/api/stats?period=annee' })), { statusCode: 422 })
  })

  it('exige une session', async () => {
    await expectApiError(stats(testEvent({ path: '/api/stats' })), { statusCode: 401 })
  })
})
