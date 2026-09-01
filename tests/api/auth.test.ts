import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectApiError, prismaMock, sessionCalls, signIn, testEvent } from '../helpers/nitro'

import register from '../../server/api/auth/register.post'
import login from '../../server/api/auth/login.post'
import logout from '../../server/api/auth/logout.post'
import me from '../../server/api/auth/me.get'
import verifyEmail from '../../server/api/auth/verify-email.post'
import resendVerification from '../../server/api/auth/resend-verification.post'

/**
 * CU-02 et CU-03 — créer un compte, puis s'authentifier.
 *
 * Le fil conducteur de ce fichier est le **double opt-in** et ce qu'il implique :
 * un compte créé n'est pas un compte actif, et la réponse d'inscription ne doit
 * rien laisser deviner de l'existence d'une adresse. Un point d'entrée
 * d'inscription qui répond « déjà pris » est un annuaire de salariés offert à
 * qui sait taper des adresses professionnelles.
 */

const VALID_REGISTRATION = {
  email: 'sofia.nakamura@atelier-voisin.fr',
  password: 'MotDePasseSolide1',
  firstName: 'Sofia',
  lastName: 'Nakamura',
  acceptTerms: true,
}

const ACCOUNT = {
  id: 'usr_1',
  email: 'sofia.nakamura@atelier-voisin.fr',
  firstName: 'Sofia',
  lastName: 'Nakamura',
  role: 'COLLABORATOR' as const,
  companyId: 'cmp_1',
  teamId: 'team_1',
  passwordHash: 'scrypt$MotDePasseSolide1',
  emailVerifiedAt: new Date('2026-08-01T10:00:00Z'),
}

/**
 * L'envoi de courriel est remplacé pour tous les tests de ce fichier : ce qui
 * est vérifié ici est **si** un message part et à qui, pas ce que le serveur
 * SMTP en fait. Le contenu des messages est couvert par `mail-templates`.
 */
const issueEmailVerification = vi.fn()
const sendMail = vi.fn()

beforeEach(() => {
  vi.stubGlobal('issueEmailVerification', issueEmailVerification)
  vi.stubGlobal('sendMail', sendMail)
  issueEmailVerification.mockReset()
  sendMail.mockReset()
})

describe('POST /api/auth/register — créer un compte (CU-02)', () => {
  it('crée un compte inactif, son consentement aux conditions, et émet un lien', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'cmp_1' })
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'usr_1', email: VALID_REGISTRATION.email, firstName: 'Sofia' })
    prismaMock.consent.create.mockResolvedValue({ id: 'cst_1' })

    const result = await register(testEvent({ method: 'POST', path: '/api/auth/register', body: VALID_REGISTRATION }))

    expect(result.status).toBe('pending')

    // Le compte naît sans `emailVerifiedAt` : c'est ce qui le rend inactif.
    const created = prismaMock.user.create.mock.calls[0]![0]
    expect(created.data).not.toHaveProperty('emailVerifiedAt')
    // Le rôle n'est jamais choisi par l'inscrit.
    expect(created.data).not.toHaveProperty('role')

    // Le compte et la preuve d'acceptation s'écrivent ensemble ou pas du tout.
    expect(prismaMock.$transaction).toHaveBeenCalled()
    expect(prismaMock.consent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TERMS', granted: true, version: 'v1' }),
      }),
    )

    expect(issueEmailVerification).toHaveBeenCalled()
  })

  /**
   * Alternative A1 — l'adresse est déjà celle d'un compte actif. La réponse est
   * **mot pour mot** celle du cas nominal ; c'est le titulaire qui est prévenu.
   * Sans cette égalité, la route énumérerait les comptes de l'entreprise.
   */
  it('répond exactement comme au cas nominal pour une adresse déjà inscrite', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'cmp_1' })
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'usr_1',
      email: VALID_REGISTRATION.email,
      firstName: 'Sofia',
      emailVerifiedAt: new Date(),
    })

    const existing = await register(testEvent({ method: 'POST', body: VALID_REGISTRATION }))

    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'usr_2', email: VALID_REGISTRATION.email, firstName: 'Sofia' })
    prismaMock.consent.create.mockResolvedValue({ id: 'cst_1' })

    const fresh = await register(testEvent({ method: 'POST', body: VALID_REGISTRATION }))

    expect(existing).toEqual(fresh)
    // Aucun compte créé, et c'est le titulaire qui reçoit l'avertissement.
    expect(sendMail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ to: VALID_REGISTRATION.email }),
    )
  })

  /** Inscription reprise sur un compte jamais confirmé : nouveau lien, rien d'écrasé. */
  it('réémet un lien pour un compte jamais confirmé, sans toucher au mot de passe', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'cmp_1' })
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'usr_1',
      email: VALID_REGISTRATION.email,
      firstName: 'Sofia',
      emailVerifiedAt: null,
    })

    await register(testEvent({ method: 'POST', body: VALID_REGISTRATION }))

    expect(issueEmailVerification).toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  /**
   * Le refus porte sur le **domaine**, jamais sur une adresse. Il ne révèle donc
   * aucun compte — et il dit quoi faire ensuite, sans quoi le visiteur est dans
   * un cul-de-sac dont il ne peut pas sortir seul.
   */
  it('refuse un domaine sans entreprise cliente, en indiquant la marche à suivre', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null)

    const refus = await expectApiError(
      register(testEvent({ method: 'POST', body: { ...VALID_REGISTRATION, email: 'kenji@inconnu.fr' } })),
      { statusCode: 422 },
    )

    expect(refus.data?.errors?.email?.[0]).toContain('bonjour@zentime.fr')
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('refuse une inscription sans acceptation des conditions', async () => {
    const refus = await expectApiError(
      register(testEvent({ method: 'POST', body: { ...VALID_REGISTRATION, acceptTerms: false } })),
      { statusCode: 422 },
    )

    expect(refus.data?.errors?.acceptTerms).toBeDefined()
    expect(prismaMock.company.findUnique).not.toHaveBeenCalled()
  })

  /** E2 de CU-02 : chaque critère non respecté est signalé nommément. */
  it('signale chaque critère de mot de passe non respecté', async () => {
    const refus = await expectApiError(
      register(testEvent({ method: 'POST', body: { ...VALID_REGISTRATION, password: 'court' } })),
      { statusCode: 422 },
    )

    expect(refus.data?.errors?.password).toEqual(
      expect.arrayContaining([expect.stringContaining('12 caractères')]),
    )
  })

  /**
   * Exception E1 — le service de messagerie est en panne. Le compte reste
   * inactif et la réponse ne change pas : une erreur visible ici indiquerait
   * qu'un envoi a été tenté, donc qu'un compte est concerné.
   */
  it('ne trahit pas une panne de messagerie', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: 'cmp_1' })
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'usr_1', email: VALID_REGISTRATION.email, firstName: 'Sofia' })
    prismaMock.consent.create.mockResolvedValue({ id: 'cst_1' })
    issueEmailVerification.mockRejectedValue(new Error('SMTP injoignable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await register(testEvent({ method: 'POST', body: VALID_REGISTRATION }))

    expect(result.status).toBe('pending')
  })
})

describe('POST /api/auth/login — s\'authentifier (CU-03)', () => {
  it('ouvre une session et rend le profil, sans le condensat du mot de passe', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ACCOUNT)

    const result = await login(testEvent({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: ACCOUNT.email, password: 'MotDePasseSolide1' },
    }))

    expect(result.user.email).toBe(ACCOUNT.email)
    expect(result.user).not.toHaveProperty('passwordHash')

    /**
     * `replaceUserSession` et non `setUserSession` : la seconde fusionnerait
     * avec la session précédente et laisserait survivre les données du compte
     * connecté avant sur le même navigateur.
     */
    expect(sessionCalls.replace).toHaveBeenCalled()
    expect(sessionCalls.set).not.toHaveBeenCalled()
  })

  it('refuse un mot de passe erroné', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ACCOUNT)

    await expectApiError(
      login(testEvent({ method: 'POST', body: { email: ACCOUNT.email, password: 'MauvaisMotDePasse1' } })),
      { statusCode: 401, code: 'invalid_credentials' },
    )
  })

  /**
   * Une adresse inconnue et un mot de passe erroné doivent être **indiscernables**
   * : même code, même message. C'est la contrepartie du condensat jetable calculé
   * à vide dans le gestionnaire.
   */
  it('répond la même chose pour une adresse inconnue', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ACCOUNT)
    const surMauvaisMotDePasse = await expectApiError(
      login(testEvent({ method: 'POST', body: { email: ACCOUNT.email, password: 'MauvaisMotDePasse1' } })),
      { statusCode: 401 },
    )

    prismaMock.user.findUnique.mockResolvedValue(null)
    const surAdresseInconnue = await expectApiError(
      login(testEvent({ method: 'POST', body: { email: 'personne@atelier-voisin.fr', password: 'MotDePasseSolide1' } })),
      { statusCode: 401 },
    )

    expect(surAdresseInconnue.statusMessage).toBe(surMauvaisMotDePasse.statusMessage)
    expect(surAdresseInconnue.data?.code).toBe(surMauvaisMotDePasse.data?.code)
  })

  /**
   * Le contrôle de confirmation vient **après** celui du mot de passe : annoncer
   * plus tôt qu'un compte attend sa confirmation révélerait son existence à qui
   * ne connaît pas le mot de passe.
   */
  it('refuse un compte non confirmé, mais seulement une fois le mot de passe vérifié', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...ACCOUNT, emailVerifiedAt: null })

    await expectApiError(
      login(testEvent({ method: 'POST', body: { email: ACCOUNT.email, password: 'MotDePasseSolide1' } })),
      { statusCode: 403, code: 'email_not_verified' },
    )

    await expectApiError(
      login(testEvent({ method: 'POST', body: { email: ACCOUNT.email, password: 'MauvaisMotDePasse1' } })),
      { statusCode: 401, code: 'invalid_credentials' },
    )

    expect(sessionCalls.replace).not.toHaveBeenCalled()
  })

  /** Le seul moment où le mot de passe en clair est disponible pour le recalculer. */
  it('réécrit un condensat obsolète à la connexion', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...ACCOUNT, passwordHash: 'legacy$MotDePasseSolide1' })
    prismaMock.user.update.mockResolvedValue({})

    await login(testEvent({
      method: 'POST',
      body: { email: ACCOUNT.email, password: 'MotDePasseSolide1' },
    }))

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { passwordHash: 'scrypt$MotDePasseSolide1' } }),
    )
  })

  it('accepte une adresse saisie avec des majuscules et des espaces', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ACCOUNT)

    await login(testEvent({
      method: 'POST',
      body: { email: '  Sofia.Nakamura@Atelier-Voisin.fr ', password: 'MotDePasseSolide1' },
    }))

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'sofia.nakamura@atelier-voisin.fr' } }),
    )
  })

  it('refuse un corps incomplet', async () => {
    await expectApiError(login(testEvent({ method: 'POST', body: { email: ACCOUNT.email } })), {
      statusCode: 422,
    })
  })
})

describe('POST /api/auth/logout — se déconnecter', () => {
  it('vide la session', async () => {
    signIn()

    expect(await logout(testEvent({ method: 'POST' }))).toEqual({ status: 'ok' })
    expect(sessionCalls.clear).toHaveBeenCalled()
  })

  /** Volontairement idempotente : son seul effet attendu est qu'il n'y ait plus de session. */
  it('réussit aussi sans session ouverte', async () => {
    expect(await logout(testEvent({ method: 'POST' }))).toEqual({ status: 'ok' })
  })
})

describe('GET /api/auth/me — la session courante', () => {
  it('relit le compte en base plutôt que de recopier le cookie', async () => {
    signIn({ id: 'usr_1', firstName: 'Ancien' })
    prismaMock.user.findUnique.mockResolvedValue({ ...ACCOUNT, firstName: 'Sofia' })

    const result = await me(testEvent({ path: '/api/auth/me' }))

    expect(result.user.firstName).toBe('Sofia')
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'usr_1' } }),
    )
  })

  /**
   * CU-05.2 — le cookie est scellé et autoportant : il reste valide après la
   * suppression du compte. Sans cette relecture, un compte supprimé resterait
   * connecté jusqu'à l'échéance de sa session.
   */
  it('déconnecte un compte qui n\'existe plus', async () => {
    signIn()
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expectApiError(me(testEvent({ path: '/api/auth/me' })), {
      statusCode: 401,
      code: 'account_gone',
    })

    expect(sessionCalls.clear).toHaveBeenCalled()
  })

  it('exige une session', async () => {
    await expectApiError(me(testEvent({ path: '/api/auth/me' })), { statusCode: 401 })
  })
})

describe('POST /api/auth/verify-email — confirmer son adresse (CU-02.1)', () => {
  const token = 'a'.repeat(48)

  it('active le compte et consomme le jeton', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'usr_1',
      type: 'EMAIL_VERIFICATION',
      usedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
      user: { emailVerifiedAt: null },
    })

    const result = await verifyEmail(testEvent({ method: 'POST', body: { token } }))

    expect(result.status).toBe('verified')
    expect(prismaMock.$transaction).toHaveBeenCalled()
  })

  /** Second clic sur le même lien : message rassurant, pas une erreur. */
  it('accueille sans erreur une adresse déjà confirmée', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'usr_1',
      type: 'EMAIL_VERIFICATION',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() - 3_600_000),
      user: { emailVerifiedAt: new Date() },
    })

    const result = await verifyEmail(testEvent({ method: 'POST', body: { token } }))

    expect(result.status).toBe('already_verified')
  })

  /** 410 et non 400 : le lien a existé, l'écran peut proposer un nouvel envoi. */
  it('distingue un lien expiré d\'un lien invalide', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'usr_1',
      type: 'EMAIL_VERIFICATION',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: { emailVerifiedAt: null },
    })

    await expectApiError(verifyEmail(testEvent({ method: 'POST', body: { token } })), {
      statusCode: 410,
      code: 'expired_token',
    })

    prismaMock.verificationToken.findUnique.mockResolvedValue(null)

    await expectApiError(verifyEmail(testEvent({ method: 'POST', body: { token } })), {
      statusCode: 400,
      code: 'invalid_token',
    })
  })

  it('refuse une requête sans jeton', async () => {
    await expectApiError(verifyEmail(testEvent({ method: 'POST', body: {} })), { statusCode: 422 })
  })
})

describe('POST /api/auth/resend-verification — redemander un lien (A2)', () => {
  it('réémet un lien pour un compte en attente', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'usr_1',
      email: ACCOUNT.email,
      firstName: 'Sofia',
      emailVerifiedAt: null,
    })

    const result = await resendVerification(testEvent({ method: 'POST', body: { email: ACCOUNT.email } }))

    expect(result.status).toBe('pending')
    expect(issueEmailVerification).toHaveBeenCalled()
  })

  /** Même réponse dans les trois cas : adresse inconnue, compte actif, envoi effectif. */
  it('répond la même chose pour une adresse inconnue ou un compte déjà confirmé', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const inconnue = await resendVerification(testEvent({ method: 'POST', body: { email: 'personne@atelier-voisin.fr' } }))

    prismaMock.user.findUnique.mockResolvedValue({ ...ACCOUNT, emailVerifiedAt: new Date() })
    const dejaActif = await resendVerification(testEvent({ method: 'POST', body: { email: ACCOUNT.email } }))

    expect(inconnue).toEqual(dejaActif)
    expect(issueEmailVerification).not.toHaveBeenCalled()
  })
})
