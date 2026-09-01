import { describe, expect, it } from 'vitest'
import { CONSENT_POLICY_VERSION } from '../../server/utils/consent'
import { expectApiError, prismaMock, signIn, testEvent } from '../helpers/nitro'

import readMood from '../../server/api/mood/index.get'
import writeMood from '../../server/api/mood/today.put'
import readConsent from '../../server/api/consent.get'
import writeConsent from '../../server/api/consent.put'

/**
 * CU-09 — déclarer son humeur, et CU-04 — décider de son consentement.
 *
 * Les deux cas sont testés ensemble parce qu'ils sont **liés par une règle** :
 * l'humeur et le stress sont des données de santé au sens de l'article 9, et
 * rien ne s'écrit sans consentement en vigueur. Séparer les deux fichiers
 * laisserait ce lien sans test.
 */

/** Une décision de consentement telle que la base la rend. */
function decision(granted: boolean, overrides: { version?: string, createdAt?: Date } = {}) {
  return {
    type: 'WELLBEING_DATA',
    granted,
    version: overrides.version ?? CONSENT_POLICY_VERSION,
    createdAt: overrides.createdAt ?? new Date(),
  }
}

describe('GET /api/mood — l\'écran de déclaration (CU-09)', () => {
  it('rend la déclaration du jour, l\'historique et l\'état du consentement', async () => {
    signIn()
    const today = new Date()
    const key = today.toISOString().slice(0, 10)

    prismaMock.moodCheckIn.findUnique.mockResolvedValue({
      date: new Date(`${key}T00:00:00.000Z`),
      mood: 4,
      stress: 2,
    })
    prismaMock.moodCheckIn.findMany.mockResolvedValue([])
    prismaMock.consent.findMany.mockResolvedValue([decision(true)])

    const result = await readMood(testEvent({ path: '/api/mood?days=14' }))

    expect(result.today).toEqual({ date: key, mood: 4, stress: 2 })
    expect(result.days).toBe(14)
    expect(result.consent).toBe('granted')
  })

  /**
   * Trois états et non deux (CU-04) : « jamais demandé » appelle la question,
   * « retiré » appelle une explication. Les confondre fermerait le formulaire à
   * quelqu'un qui n'a rien refusé, sans lui laisser d'issue.
   */
  it('distingue un consentement jamais demandé d\'un consentement retiré', async () => {
    signIn()
    prismaMock.moodCheckIn.findUnique.mockResolvedValue(null)
    prismaMock.moodCheckIn.findMany.mockResolvedValue([])

    prismaMock.consent.findMany.mockResolvedValue([])
    expect((await readMood(testEvent({ path: '/api/mood' }))).consent).toBe('unknown')

    prismaMock.consent.findMany.mockResolvedValue([decision(false)])
    expect((await readMood(testEvent({ path: '/api/mood' }))).consent).toBe('withdrawn')
  })

  /** A2 de CU-09 : une journée non déclarée est absente, jamais comptée comme un zéro. */
  it('n\'invente pas de journées non déclarées', async () => {
    signIn()
    prismaMock.moodCheckIn.findUnique.mockResolvedValue(null)
    prismaMock.moodCheckIn.findMany.mockResolvedValue([])
    prismaMock.consent.findMany.mockResolvedValue([decision(true)])

    const result = await readMood(testEvent({ path: '/api/mood?days=14' }))

    expect(result.history).toEqual([])
    expect(result.today).toBeNull()
  })

  it('exige une session', async () => {
    await expectApiError(readMood(testEvent({ path: '/api/mood' })), { statusCode: 401 })
  })
})

describe('PUT /api/mood/today — enregistrer ou corriger sa déclaration', () => {
  it('enregistre les deux échelles pour la journée du serveur', async () => {
    signIn()
    prismaMock.consent.findMany.mockResolvedValue([decision(true)])
    const key = new Date().toISOString().slice(0, 10)
    prismaMock.moodCheckIn.upsert.mockResolvedValue({
      date: new Date(`${key}T00:00:00.000Z`),
      mood: 4,
      stress: 2,
    })

    const result = await writeMood(testEvent({
      method: 'PUT',
      path: '/api/mood/today',
      body: { mood: 4, stress: 2 },
    }))

    expect(result.today).toEqual({ date: key, mood: 4, stress: 2 })
    // A1 : la correction **remplace**, elle n'ajoute pas une seconde ligne.
    expect(prismaMock.moodCheckIn.upsert).toHaveBeenCalled()
    expect(prismaMock.moodCheckIn.create).not.toHaveBeenCalled()
  })

  /**
   * Le consentement est vérifié **avant** la validation du corps. L'ordre
   * compte : un consentement retiré doit produire un refus, pas une liste
   * d'erreurs de saisie qui laisserait croire que la déclaration est attendue.
   */
  it('refuse avant même de regarder la saisie quand le consentement est retiré', async () => {
    signIn()
    prismaMock.consent.findMany.mockResolvedValue([decision(false)])

    await expectApiError(
      writeMood(testEvent({ method: 'PUT', body: { mood: 99, stress: 99 } })),
      { statusCode: 403, code: 'wellbeing_consent_withdrawn' },
    )

    expect(prismaMock.moodCheckIn.upsert).not.toHaveBeenCalled()
  })

  it('refuse quand le consentement n\'a jamais été recueilli', async () => {
    signIn()
    prismaMock.consent.findMany.mockResolvedValue([])

    await expectApiError(
      writeMood(testEvent({ method: 'PUT', body: { mood: 3, stress: 3 } })),
      { statusCode: 403, code: 'wellbeing_consent_missing' },
    )
  })

  it('refuse une valeur hors de l\'échelle de 1 à 5', async () => {
    signIn()
    prismaMock.consent.findMany.mockResolvedValue([decision(true)])

    const refus = await expectApiError(
      writeMood(testEvent({ method: 'PUT', body: { mood: 6, stress: 0 } })),
      { statusCode: 422 },
    )

    expect(refus.data?.errors?.mood).toBeDefined()
    expect(refus.data?.errors?.stress).toBeDefined()
  })

  it('exige une session', async () => {
    await expectApiError(
      writeMood(testEvent({ method: 'PUT', body: { mood: 3, stress: 3 } })),
      { statusCode: 401 },
    )
  })
})

describe('GET /api/consent — l\'état du consentement (CU-04)', () => {
  /**
   * Route publique : c'est elle qui dit au bandeau s'il doit s'afficher, et il
   * s'affiche d'abord pour des visiteurs. Elle ne dépose **aucun** cookie —
   * poser un identifiant à la simple lecture reviendrait à déposer un traceur
   * pour demander l'autorisation d'en déposer un.
   */
  it('répond à un visiteur sans session et sans rien déposer', async () => {
    const event = testEvent({ path: '/api/consent' })

    const result = await readConsent(event)

    expect(result.analytics).toBeNull()
    expect(result.wellbeing).toBeNull()
    expect(result.policyVersion).toBe(CONSENT_POLICY_VERSION)
    expect(event.node.res.getHeader('set-cookie')).toBeUndefined()
  })

  /**
   * Une décision prise sur une version antérieure des textes ne vaut plus : la
   * personne a consenti à autre chose. Elle revient donc à `null` — la question
   * est reposée, elle n'est pas tranchée à sa place.
   */
  it('ne retient pas une décision prise sur une version antérieure des textes', async () => {
    signIn()
    prismaMock.consent.findMany.mockResolvedValue([
      { type: 'ANALYTICS', granted: true, version: 'v0', createdAt: new Date() },
    ])

    const result = await readConsent(testEvent({ path: '/api/consent' }))

    expect(result.analytics).toBeNull()
  })

  it('rend la décision d\'un compte connecté', async () => {
    signIn()
    prismaMock.consent.findMany.mockResolvedValue([
      { type: 'ANALYTICS', granted: false, version: CONSENT_POLICY_VERSION, createdAt: new Date() },
    ])

    const result = await readConsent(testEvent({ path: '/api/consent' }))

    expect(result.analytics).toBe(false)
  })
})

describe('PUT /api/consent — enregistrer une décision (CU-04)', () => {
  /**
   * C'est ici, et pas avant, que le visiteur reçoit une identité : au moment où
   * il prend une décision qu'il faut pouvoir lui rattacher.
   */
  it('dépose un identifiant de visiteur au moment de la décision, et pas avant', async () => {
    prismaMock.consent.findMany.mockResolvedValue([])
    prismaMock.consent.create.mockResolvedValue({ id: 'cst_1' })

    const event = testEvent({ method: 'PUT', path: '/api/consent', body: { analytics: true } })
    await writeConsent(event)

    const cookie = String(event.node.res.getHeader('set-cookie'))
    expect(cookie).toContain('zentime_consent=')
    // Le choix est lu par le serveur, jamais par un script de page.
    expect(cookie).toContain('HttpOnly')
  })

  /**
   * Le journal doit rester la liste des **décisions**, pas celle des clics :
   * réaffirmer un choix déjà en vigueur n'écrit rien.
   */
  it('n\'écrit rien quand la décision ne change pas', async () => {
    signIn()
    prismaMock.consent.findMany.mockResolvedValue([
      { type: 'ANALYTICS', granted: true, version: CONSENT_POLICY_VERSION, createdAt: new Date() },
    ])

    await writeConsent(testEvent({ method: 'PUT', body: { analytics: true } }))

    expect(prismaMock.consent.create).not.toHaveBeenCalled()
  })

  it('écrit une ligne quand la personne change d\'avis', async () => {
    signIn()
    prismaMock.consent.findMany.mockResolvedValue([
      { type: 'ANALYTICS', granted: true, version: CONSENT_POLICY_VERSION, createdAt: new Date() },
    ])
    prismaMock.consent.create.mockResolvedValue({ id: 'cst_2' })

    await writeConsent(testEvent({ method: 'PUT', body: { analytics: false } }))

    expect(prismaMock.consent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ANALYTICS', granted: false, userId: 'usr_collab' }),
      }),
    )
  })

  /**
   * Le consentement au traitement des données de bien-être suppose un compte :
   * il n'y a pas de données de bien-être sans titulaire.
   */
  it('refuse une décision de bien-être prise sans compte', async () => {
    prismaMock.consent.findMany.mockResolvedValue([])

    await expectApiError(
      writeConsent(testEvent({ method: 'PUT', body: { wellbeing: true } })),
      { statusCode: 401, code: 'authentication_required' },
    )

    expect(prismaMock.consent.create).not.toHaveBeenCalled()
  })

  it('refuse un corps qui n\'est pas une décision', async () => {
    await expectApiError(
      writeConsent(testEvent({ method: 'PUT', body: { analytics: 'oui' } })),
      { statusCode: 422 },
    )
  })
})
