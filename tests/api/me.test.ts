import { describe, expect, it } from 'vitest'
import { expectApiError, prismaMock, responseHeaders, sessionCalls, signIn, testEvent } from '../helpers/nitro'

import exportMyData from '../../server/api/me/export.get'
import deleteMyAccount from '../../server/api/me/index.delete'

/**
 * CU-05 — Exercer ses droits sur ses données (articles 15, 17 et 20).
 *
 * Les deux routes ont un point commun décisif : **aucun paramètre**. L'export
 * porte sur le compte de la session, la suppression aussi. Il n'y a donc pas
 * d'identifiant à deviner pour obtenir — ou effacer — les données de quelqu'un
 * d'autre, et c'est ce qui dispense ces routes d'un contrôle d'appartenance.
 */

const ACCOUNT = {
  id: 'usr_1',
  email: 'sofia.nakamura@atelier-voisin.fr',
  firstName: 'Sofia',
  lastName: 'Nakamura',
  role: 'COLLABORATOR',
  createdAt: new Date('2026-01-05T09:00:00Z'),
  updatedAt: new Date('2026-08-01T09:00:00Z'),
  emailVerifiedAt: new Date('2026-01-05T09:30:00Z'),
  company: { name: 'Atelier Voisin' },
  team: { name: 'Équipe Produit' },
  preference: {
    workStartHour: 9,
    workEndHour: 18,
    remindersEnabled: true,
    reminderIntervalMin: 90,
    favoriteTypes: ['BREATHING'],
    updatedAt: new Date('2026-08-01T09:00:00Z'),
  },
}

function serveExportSources() {
  prismaMock.user.findUnique.mockResolvedValue(ACCOUNT)
  prismaMock.breakSession.findMany.mockResolvedValue([
    { startedAt: new Date('2026-08-20T09:00:00Z'), endedAt: new Date('2026-08-20T09:10:00Z'), durationSec: 600 },
  ])
  prismaMock.exerciseLog.findMany.mockResolvedValue([
    { completedAt: new Date('2026-08-20T10:00:00Z'), exercise: { slug: 'souffle-4-7-8', title: 'Souffle 4-7-8', type: 'BREATHING' } },
  ])
  prismaMock.moodCheckIn.findMany.mockResolvedValue([
    { date: new Date('2026-08-20T00:00:00Z'), mood: 4, stress: 2, createdAt: new Date('2026-08-20T08:00:00Z') },
  ])
  prismaMock.consent.findMany.mockResolvedValue([
    { type: 'TERMS', granted: true, version: 'v1', createdAt: new Date('2026-01-05T09:00:00Z') },
  ])
  prismaMock.accessLog.findMany.mockResolvedValue([])
}

describe('GET /api/me/export — exporter ses données (CU-05.1)', () => {
  it('rend un fichier JSON complet, lisible et non mis en cache', async () => {
    signIn({ id: 'usr_1' })
    serveExportSources()

    const event = testEvent({ path: '/api/me/export' })
    const body = await exportMyData(event)
    const headers = responseHeaders(event)
    const payload = JSON.parse(body)

    expect(headers['content-type']).toBe('application/json; charset=utf-8')
    expect(headers['cache-control']).toBe('no-store')
    expect(headers['content-disposition']).toContain('zentime-mes-donnees-')

    // Les six familles de données annoncées à `/mes-donnees`.
    expect(Object.keys(payload)).toEqual(expect.arrayContaining([
      'meta', 'compte', 'preferences', 'pauses', 'exercices', 'humeur', 'consentements',
    ]))

    // Article 20 : « aisément réutilisable » se perd dans une ligne unique.
    expect(body).toContain('\n')

    // Les libellés sont dénormalisés : un export où il faudrait résoudre
    // `cmf3x…` pour savoir de quel exercice on parle ne serait pas réutilisable.
    expect(payload.exercices[0].exercice).toBe('Souffle 4-7-8')
    expect(payload.compte.entreprise).toBe('Atelier Voisin')
  })

  /**
   * Les consultations exportées sont celles faites **par** la personne, jamais
   * celles qui la concerneraient : l'inverse ferait de cet export un moyen de
   * savoir qui regarde son équipe.
   */
  it('n\'exporte que les consultations faites par la personne', async () => {
    signIn({ id: 'usr_1' })
    serveExportSources()

    await exportMyData(testEvent({ path: '/api/me/export' }))

    expect(prismaMock.accessLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actorRef: 'usr_1' } }),
    )
  })

  it('refuse si le compte a disparu entre la barrière et la lecture', async () => {
    signIn()
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expectApiError(exportMyData(testEvent({ path: '/api/me/export' })), {
      statusCode: 401,
      code: 'account_gone',
    })
  })

  it('exige une session', async () => {
    await expectApiError(exportMyData(testEvent({ path: '/api/me/export' })), { statusCode: 401 })
  })
})

describe('DELETE /api/me — supprimer son compte (CU-05.2)', () => {
  it('efface le compte et referme la session', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.user.findUnique.mockResolvedValue({ passwordHash: 'scrypt$MotDePasseSolide1' })
    prismaMock.user.delete.mockResolvedValue({ id: 'usr_1' })

    const result = await deleteMyAccount(testEvent({
      method: 'DELETE',
      path: '/api/me',
      body: { password: 'MotDePasseSolide1' },
    }))

    expect(result).toEqual({ status: 'deleted' })
    // Une seule instruction : les cascades du schéma font le reste.
    expect(prismaMock.user.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'usr_1' } }),
    )

    /**
     * Sans cet appel, le cookie scellé resterait valide jusqu'à son échéance et
     * l'application afficherait encore un compte connecté.
     */
    expect(sessionCalls.clear).toHaveBeenCalled()
  })

  /**
   * Le mot de passe n'est pas une formalité : une session ouverte sur un poste
   * non verrouillé suffirait sans lui à effacer douze mois de déclarations, sans
   * retour possible. Le même geste protège d'une requête déclenchée depuis un
   * autre site — le cookie partirait, le mot de passe non.
   */
  it('refuse la suppression sans le bon mot de passe, et n\'efface rien', async () => {
    signIn({ id: 'usr_1' })
    prismaMock.user.findUnique.mockResolvedValue({ passwordHash: 'scrypt$MotDePasseSolide1' })

    await expectApiError(
      deleteMyAccount(testEvent({ method: 'DELETE', body: { password: 'AutreMotDePasse1' } })),
      { statusCode: 403, code: 'invalid_password' },
    )

    expect(prismaMock.user.delete).not.toHaveBeenCalled()
    expect(sessionCalls.clear).not.toHaveBeenCalled()
  })

  it('refuse une requête sans mot de passe', async () => {
    signIn()

    const refus = await expectApiError(
      deleteMyAccount(testEvent({ method: 'DELETE', body: {} })),
      { statusCode: 422 },
    )

    expect(refus.data?.errors?.password).toBeDefined()
  })

  it('déconnecte un compte déjà supprimé', async () => {
    signIn()
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expectApiError(
      deleteMyAccount(testEvent({ method: 'DELETE', body: { password: 'MotDePasseSolide1' } })),
      { statusCode: 401, code: 'account_gone' },
    )
  })

  it('exige une session', async () => {
    await expectApiError(
      deleteMyAccount(testEvent({ method: 'DELETE', body: { password: 'MotDePasseSolide1' } })),
      { statusCode: 401 },
    )
  })
})
