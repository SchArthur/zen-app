import { describe, expect, it } from 'vitest'
import { PUBLIC_API_ROUTES } from '../../server/utils/authorization'
import { expectApiError, prismaMock, sessionCalls, signIn, testEvent } from '../helpers/nitro'

import barrier from '../../server/middleware/auth'

/**
 * La barrière de l'API — le refus par défaut.
 *
 * C'est la pièce la plus rentable du produit à tester : elle décide pour
 * **toutes** les routes, y compris celles qui n'existent pas encore. Une
 * régression ici n'ouvre pas une porte, elle en ouvre trente-deux.
 *
 * Les tests suivent les trois contrôles, dans l'ordre où la barrière les fait —
 * et cet ordre est lui-même testé : un compte supprimé doit s'entendre dire
 * qu'il n'existe plus, pas qu'il lui manque un abonnement.
 */

/** Un compte qui existe encore en base. */
function accountExists() {
  prismaMock.user.findUnique.mockResolvedValue({ id: 'usr_collab' })
}

describe('barrière /api/ — authentification', () => {
  it('laisse passer ce qui n\'est pas une route d\'API', async () => {
    await expect(barrier(testEvent({ path: '/tableau-de-bord' }))).resolves.toBeUndefined()

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('laisse passer chaque route publique déclarée, sans session', async () => {
    for (const route of PUBLIC_API_ROUTES) {
      await expect(barrier(testEvent({ path: route })), route).resolves.toBeUndefined()
    }
  })

  /**
   * Le sens du contrôle est ce qui compte : une route ajoutée demain sans garde
   * est **protégée** d'office. L'oubli va vers le refus, pas vers la fuite.
   */
  it('protège une route qui n\'existe pas encore', async () => {
    await expectApiError(barrier(testEvent({ path: '/api/teams/team_1/climate' })), {
      statusCode: 401,
    })
  })

  it('ne se laisse pas contourner par un préfixe trompeur', async () => {
    for (const route of ['/api/auth/login-as-admin', '/api/auth/logout/../me']) {
      await expectApiError(barrier(testEvent({ path: route })), { statusCode: 401 })
    }
  })

  it('laisse passer avec une session et un compte existant', async () => {
    signIn()
    accountExists()

    await expect(barrier(testEvent({ path: '/api/dashboard' }))).resolves.toBeUndefined()
  })

  /**
   * Le cookie de session est scellé et autoportant : il reste valide après la
   * suppression du compte (CU-05.2). Le contrôle est fait **une fois**, ici,
   * plutôt que répété dans chaque gestionnaire — une route ajoutée demain en
   * hérite sans que personne n'ait à y penser.
   */
  it('refuse une session qui désigne un compte supprimé, et vide le cookie', async () => {
    signIn()
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expectApiError(barrier(testEvent({ path: '/api/dashboard' })), {
      statusCode: 401,
      code: 'account_gone',
    })

    expect(sessionCalls.clear).toHaveBeenCalled()
  })
})

describe('barrière /api/ — formule d\'abonnement', () => {
  /**
   * La garde de plan est posée ici et non dans les gestionnaires, pour la raison
   * inverse de celle du contrôle de rôle : elle ne dépend que de la route. Une
   * route facturée ajoutée demain sans sa vérification serait offerte — un
   * défaut dont aucun utilisateur ne se plaindra jamais.
   */
  it('refuse la vue consolidée à une entreprise sans abonnement', async () => {
    signIn({ role: 'HR' })
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'usr_collab' })
      .mockResolvedValueOnce({ company: { subscription: null } })

    await expectApiError(barrier(testEvent({ path: '/api/company' })), {
      statusCode: 402,
      code: 'plan_required',
    })
  })

  it('laisse passer un abonnement Premium actif', async () => {
    signIn({ role: 'HR' })
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'usr_collab' })
      .mockResolvedValueOnce({ company: { subscription: { plan: 'PREMIUM', status: 'ACTIVE' } } })

    await expect(barrier(testEvent({ path: '/api/company/export' }))).resolves.toBeUndefined()
  })

  /**
   * `PAST_DUE` n'ouvre pas les droits : le prestataire y range les abonnements
   * dont un prélèvement a **déjà échoué**. Laisser les droits ouverts pendant
   * les relances recréerait, en plus petit, l'écart qu'on vient de fermer.
   */
  it('ne rouvre pas les droits sur un prélèvement en échec', async () => {
    signIn({ role: 'HR' })
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'usr_collab' })
      .mockResolvedValueOnce({ company: { subscription: { plan: 'PREMIUM', status: 'PAST_DUE' } } })

    await expectApiError(barrier(testEvent({ path: '/api/company' })), { statusCode: 402 })
  })

  /**
   * Le message dépend de qui le reçoit. La garde étant **avant** le contrôle de
   * rôle, un collaborateur qui sonde une route facturée apprendrait sinon à
   * quelle formule son entreprise a souscrit. Seul le responsable RH — le seul
   * qui puisse y remédier — reçoit le détail.
   */
  it('ne nomme la formule attendue qu\'à qui peut y souscrire', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ company: { subscription: null } })

    signIn({ role: 'HR' })
    const pourLeRh = await expectApiError(barrier(testEvent({ path: '/api/company' })), {
      statusCode: 402,
    })

    signIn({ role: 'COLLABORATOR' })
    const pourLeCollaborateur = await expectApiError(barrier(testEvent({ path: '/api/company' })), {
      statusCode: 402,
    })

    expect(pourLeRh.statusMessage).toContain('Premium')
    expect(pourLeCollaborateur.statusMessage).not.toContain('Premium')
    expect(pourLeCollaborateur.data).not.toHaveProperty('requiredPlan')
  })

  /**
   * L'ordre voulu : un compte supprimé s'entend dire qu'il n'existe plus, pas
   * qu'il lui manque un abonnement.
   */
  it('vérifie l\'existence du compte avant la formule', async () => {
    signIn({ role: 'HR' })
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expectApiError(barrier(testEvent({ path: '/api/company' })), {
      statusCode: 401,
      code: 'account_gone',
    })
  })

  /**
   * Le préfixe est comparé segment par segment : `/api/company` couvre
   * `/api/company/export` mais pas une hypothétique `/api/companies`.
   */
  it('ne facture pas une route dont le nom commence par le même mot', async () => {
    signIn()
    accountExists()

    await expect(barrier(testEvent({ path: '/api/companies' }))).resolves.toBeUndefined()
  })

  it('n\'exige aucune formule sur les routes du cœur bien-être', async () => {
    signIn()
    accountExists()

    for (const route of ['/api/breaks', '/api/exercises', '/api/mood', '/api/stats', '/api/team']) {
      await expect(barrier(testEvent({ path: route })), route).resolves.toBeUndefined()
    }
  })
})
