import { describe, expect, it } from 'vitest'
import { expectApiError, prismaMock, sessionCalls, signIn, testEvent } from '../helpers/nitro'

import readProfile from '../../server/api/profile/index.get'
import updateProfile from '../../server/api/profile/index.patch'
import writePreferences from '../../server/api/profile/preferences.put'

/**
 * CU-06 — Gérer son profil et ses préférences.
 *
 * Les trois routes partagent un principe : **ce que l'entreprise attribue n'est
 * pas modifiable par l'intéressé**. Le rôle, l'équipe et l'adresse de connexion
 * s'affichent, ils ne s'écrivent pas. Les tests portent donc autant sur ce que
 * les routes refusent d'écrire que sur ce qu'elles écrivent.
 */

const PREFERENCES = {
  workStartHour: 9,
  workEndHour: 18,
  remindersEnabled: true,
  reminderIntervalMin: 90,
  favoriteTypes: ['BREATHING'],
}

const VALID_PREFERENCES = {
  workStartHour: 9,
  workEndHour: 18,
  remindersEnabled: true,
  reminderIntervalMin: 60,
  favoriteTypes: ['BREATHING', 'STRETCHING'],
}

describe('GET /api/profile — l\'écran de profil', () => {
  it('rend identité, rattachement et préférences en un seul appel', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'sofia.nakamura@atelier-voisin.fr',
      firstName: 'Sofia',
      lastName: 'Nakamura',
      role: 'COLLABORATOR',
      company: { name: 'Atelier Voisin' },
      team: { name: 'Équipe Produit' },
    })
    prismaMock.preference.upsert.mockResolvedValue(PREFERENCES)

    const result = await readProfile(testEvent({ path: '/api/profile' }))

    expect(result.profile.company).toBe('Atelier Voisin')
    expect(result.profile.team).toBe('Équipe Produit')
    expect(result.preferences).toEqual(PREFERENCES)
  })

  /** Le rattachement est relu en base : c'est l'écran où l'on vient vérifier. */
  it('relit le compte plutôt que de recopier le cookie', async () => {
    signIn({ id: 'usr_1', role: 'COLLABORATOR' })
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'sofia.nakamura@atelier-voisin.fr',
      firstName: 'Sofia',
      lastName: 'Nakamura',
      role: 'MANAGER',
      company: { name: 'Atelier Voisin' },
      team: null,
    })
    prismaMock.preference.upsert.mockResolvedValue(PREFERENCES)

    const result = await readProfile(testEvent({ path: '/api/profile' }))

    expect(result.profile.role).toBe('MANAGER')
    expect(result.profile.team).toBeNull()
  })

  it('déconnecte un compte qui n\'existe plus', async () => {
    signIn()
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expectApiError(readProfile(testEvent({ path: '/api/profile' })), {
      statusCode: 401,
      code: 'account_gone',
    })

    expect(sessionCalls.clear).toHaveBeenCalled()
  })

  it('exige une session', async () => {
    await expectApiError(readProfile(testEvent({ path: '/api/profile' })), { statusCode: 401 })
  })
})

describe('PATCH /api/profile — corriger son identité', () => {
  it('enregistre le prénom et le nom, et réaligne la session', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.user.update.mockResolvedValue({
      id: 'usr_1',
      email: 'sofia.nakamura@atelier-voisin.fr',
      firstName: 'Sofia',
      lastName: 'Nakamura-Roy',
      role: 'COLLABORATOR',
      companyId: 'cmp_1',
      teamId: 'team_1',
    })

    const result = await updateProfile(testEvent({
      method: 'PATCH',
      path: '/api/profile',
      body: { firstName: 'Sofia', lastName: 'Nakamura-Roy' },
    }))

    expect(result.profile).toEqual({ firstName: 'Sofia', lastName: 'Nakamura-Roy' })

    /**
     * `setUserSession` et non `replaceUserSession` : corriger son prénom n'est
     * pas une nouvelle connexion, `loggedInAt` est recopié tel quel et la
     * session expire à l'heure prévue.
     */
    expect(sessionCalls.set).toHaveBeenCalledWith(
      expect.objectContaining({ loggedInAt: '2026-08-27T08:00:00.000Z' }),
    )
    expect(sessionCalls.replace).not.toHaveBeenCalled()
  })

  /**
   * Le rôle et le rattachement sont attribués par l'entreprise, l'adresse sert
   * d'identifiant de connexion : rien de tout cela n'entre par cette route,
   * même transmis explicitement.
   */
  it('ignore le rôle, l\'équipe et l\'adresse transmis dans le corps', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.user.update.mockResolvedValue({
      id: 'usr_1',
      email: 'sofia.nakamura@atelier-voisin.fr',
      firstName: 'Sofia',
      lastName: 'Nakamura',
      role: 'COLLABORATOR',
      companyId: 'cmp_1',
      teamId: 'team_1',
    })

    await updateProfile(testEvent({
      method: 'PATCH',
      body: {
        firstName: 'Sofia',
        lastName: 'Nakamura',
        role: 'HR',
        teamId: 'team_2',
        email: 'sofia@ailleurs.fr',
      },
    }))

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { firstName: 'Sofia', lastName: 'Nakamura' } }),
    )
  })

  it('refuse un nom vide', async () => {
    signIn()

    const refus = await expectApiError(
      updateProfile(testEvent({ method: 'PATCH', body: { firstName: '   ', lastName: 'Nakamura' } })),
      { statusCode: 422 },
    )

    expect(refus.data?.errors?.firstName).toBeDefined()
  })

  it('exige une session', async () => {
    await expectApiError(
      updateProfile(testEvent({ method: 'PATCH', body: { firstName: 'Sofia', lastName: 'Nakamura' } })),
      { statusCode: 401 },
    )
  })
})

describe('PUT /api/profile/preferences — enregistrer ses réglages', () => {
  it('enregistre le jeu complet de réglages', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.preference.upsert.mockResolvedValue(VALID_PREFERENCES)

    const result = await writePreferences(testEvent({
      method: 'PUT',
      path: '/api/profile/preferences',
      body: VALID_PREFERENCES,
    }))

    expect(result.preferences).toEqual(VALID_PREFERENCES)
    expect(prismaMock.preference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'usr_1' } }),
    )
  })

  /** Le dédoublonnage est fait au filtrage : le moteur de recommandation compterait sinon deux fois. */
  it('dédoublonne les types d\'exercices favoris', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.preference.upsert.mockResolvedValue(VALID_PREFERENCES)

    await writePreferences(testEvent({
      method: 'PUT',
      body: { ...VALID_PREFERENCES, favoriteTypes: ['BREATHING', 'BREATHING', 'STRETCHING'] },
    }))

    expect(prismaMock.preference.upsert.mock.calls[0]![0].update.favoriteTypes)
      .toEqual(['BREATHING', 'STRETCHING'])
  })

  /** La règle de CU-07 : le rappel se règle de 30 à 120 minutes, pas au-delà. */
  it('refuse une fréquence de rappel hors bornes', async () => {
    signIn()

    const refus = await expectApiError(
      writePreferences(testEvent({ method: 'PUT', body: { ...VALID_PREFERENCES, reminderIntervalMin: 5 } })),
      { statusCode: 422 },
    )

    expect(refus.data?.errors?.reminderIntervalMin).toBeDefined()
  })

  /** Le message est rattaché au champ à corriger, pas au formulaire entier. */
  it('refuse une journée qui finit avant de commencer, sur le bon champ', async () => {
    signIn()

    const refus = await expectApiError(
      writePreferences(testEvent({
        method: 'PUT',
        body: { ...VALID_PREFERENCES, workStartHour: 18, workEndHour: 9 },
      })),
      { statusCode: 422 },
    )

    expect(refus.data?.errors?.workEndHour).toBeDefined()
  })

  it('refuse un type d\'exercice inconnu', async () => {
    signIn()

    await expectApiError(
      writePreferences(testEvent({ method: 'PUT', body: { ...VALID_PREFERENCES, favoriteTypes: ['SIESTE'] } })),
      { statusCode: 422 },
    )
  })

  /** Les préférences sont personnelles : les trois rôles y ont accès pour eux-mêmes. */
  it('est ouverte aux trois rôles', async () => {
    prismaMock.preference.upsert.mockResolvedValue(VALID_PREFERENCES)

    for (const role of ['COLLABORATOR', 'MANAGER', 'HR'] as const) {
      signIn({ role })

      await expect(writePreferences(testEvent({ method: 'PUT', body: VALID_PREFERENCES })))
        .resolves.toBeDefined()
    }
  })

  it('exige une session', async () => {
    await expectApiError(
      writePreferences(testEvent({ method: 'PUT', body: VALID_PREFERENCES })),
      { statusCode: 401 },
    )
  })
})
