import { describe, expect, it } from 'vitest'
import { dayKey } from '../../shared/utils/time'
import { expectApiError, prismaMock, responseHeaders, signIn, testEvent } from '../helpers/nitro'

import teamView from '../../server/api/team.get'
import companyView from '../../server/api/company.get'
import companyExport from '../../server/api/company/export.get'

/**
 * CU-12, CU-13, CU-14 — les vues d'encadrement.
 *
 * **C'est le lot de tests que F8 exige nommément** : « des tests automatisés
 * vérifient qu'un manager ne peut accéder ni aux données d'un membre, ni à
 * celles d'une autre équipe ».
 *
 * Les deux moitiés de cette exigence ne se démontrent pas de la même façon.
 *
 * - *Ni aux données d'un membre* : la réponse ne contient ni identifiant, ni
 *   nom, ni valeur individuelle — vérifié ici sur la charge utile entière, et
 *   non champ par champ, pour qu'un champ ajouté demain fasse échouer le test.
 * - *Ni à celles d'une autre équipe* : il n'y a **aucun moyen de la demander**.
 *   Le périmètre est lu sur le compte du demandeur, jamais reçu. Le test
 *   transmet donc une équipe étrangère par tous les chemins possibles — chaîne
 *   de requête et corps — et vérifie que la lecture de périmètre porte quand
 *   même sur l'identifiant de la session.
 */

const TODAY = dayKey(new Date())

/** Une déclaration d'aujourd'hui, telle que la base la rend. */
function checkIn(userId: string, mood = 3, stress = 3) {
  return { userId, date: new Date(`${TODAY}T00:00:00.000Z`), mood, stress }
}

/** Un périmètre de `size` personnes, toutes déclarantes du jour. */
function declaringScope(size: number) {
  return Array.from({ length: size }, (_, index) => `usr_${index}`)
}

function serveAggregateSources(declarants: string[]) {
  prismaMock.breakSession.findMany.mockResolvedValue([])
  prismaMock.exerciseLog.findMany.mockResolvedValue([])
  prismaMock.moodCheckIn.findMany.mockResolvedValue(declarants.map(id => checkIn(id)))
  prismaMock.accessLog.create.mockResolvedValue({ id: 'log_1' })
}

/** L'équipe rendue par `readTeamScope`, lue sur le compte du demandeur. */
function serveTeam(memberIds: string[], name = 'Équipe Produit') {
  prismaMock.user.findUnique.mockResolvedValue({
    team: { id: 'team_1', name, members: memberIds.map(id => ({ id })) },
  })
}

function serveCompany(memberIds: string[], name = 'Atelier Voisin') {
  prismaMock.user.findUnique.mockResolvedValue({
    company: { id: 'cmp_1', name, users: memberIds.map(id => ({ id })) },
  })
}

const MANAGER = { id: 'usr_manager', role: 'MANAGER' as const }
const HR = { id: 'usr_hr', role: 'HR' as const }

describe('GET /api/team — le climat de son équipe (CU-12)', () => {
  it('rend des agrégats quand le seuil est atteint, et journalise la consultation', async () => {
    signIn(MANAGER)
    const members = declaringScope(6)
    serveTeam(members)
    serveAggregateSources(members)

    const result = await teamView(testEvent({ path: '/api/team?period=semaine' }))

    expect(result.available).toBe(true)
    expect(result.team).toEqual({ name: 'Équipe Produit' })
    expect(result.period).toBe('semaine')
    expect(result.days).toBe(7)

    // CU-12.2 — la consultation laisse une trace, avec le périmètre consulté.
    expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'team.view',
          target: 'team:team_1/semaine',
          actorRef: 'usr_manager',
          actorRole: 'MANAGER',
        }),
      }),
    )
  })

  /**
   * F8, première moitié : aucune donnée d'un membre. La charge utile entière est
   * sérialisée et confrontée aux identifiants du périmètre — un champ ajouté
   * demain qui en laisserait passer un ferait échouer ce test sans qu'il ait à
   * être mis à jour.
   */
  it('ne laisse sortir aucun identifiant ni aucune valeur individuelle', async () => {
    signIn(MANAGER)
    const members = declaringScope(6)
    serveTeam(members)
    serveAggregateSources(members)

    const result = await teamView(testEvent({ path: '/api/team' }))
    const payload = JSON.stringify(result)

    for (const id of members) expect(payload).not.toContain(id)

    expect(payload).not.toContain('usr_manager')
    expect(payload).not.toContain('userId')
  })

  /**
   * F8, seconde moitié : aucune autre équipe. Le manager fait tout ce qu'il peut
   * pour en désigner une — elle n'entre nulle part, et la lecture de périmètre
   * porte sur l'identifiant de sa session.
   */
  it('ignore toute équipe désignée dans la requête : le périmètre vient du compte', async () => {
    signIn(MANAGER)
    const members = declaringScope(6)
    serveTeam(members)
    serveAggregateSources(members)

    await teamView(testEvent({
      path: '/api/team?period=semaine&teamId=team_2&userId=usr_0',
      body: { teamId: 'team_2' },
      method: 'GET',
    }))

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'usr_manager' } }),
    )
  })

  /**
   * Exception E1 de CU-12 : le refus est journalisé lui aussi. Un journal qui
   * n'enregistre que les succès ne dit rien des tentatives, qui sont pourtant ce
   * qu'on cherche à pouvoir constater.
   */
  it('refuse un manager sans équipe — et journalise le refus', async () => {
    signIn(MANAGER)
    prismaMock.user.findUnique.mockResolvedValue({ team: null })
    prismaMock.accessLog.create.mockResolvedValue({ id: 'log_1' })

    await expectApiError(teamView(testEvent({ path: '/api/team' })), {
      statusCode: 403,
      code: 'no_team',
    })

    expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'team.denied', target: 'team:aucune/semaine' }),
      }),
    )
  })

  it('ne calcule rien sous le seuil de cinq déclarants', async () => {
    signIn(MANAGER)
    const members = declaringScope(4)
    serveTeam(members)
    serveAggregateSources(members)

    const result = await teamView(testEvent({ path: '/api/team' }))

    expect(result.available).toBe(false)
    expect(result.threshold).toBe(5)
    expect(result).not.toHaveProperty('series')
    expect(result).not.toHaveProperty('totals')
  })

  it('refuse un collaborateur', async () => {
    signIn()

    await expectApiError(teamView(testEvent({ path: '/api/team' })), {
      statusCode: 403,
      code: 'forbidden',
    })
  })

  /** La vue d'équipe n'est pas un sous-ensemble de la vue entreprise : le RH n'y entre pas. */
  it('refuse un responsable RH', async () => {
    signIn(HR)

    await expectApiError(teamView(testEvent({ path: '/api/team' })), {
      statusCode: 403,
      code: 'forbidden',
    })
  })

  it('exige une session', async () => {
    await expectApiError(teamView(testEvent({ path: '/api/team' })), { statusCode: 401 })
  })

  it('refuse une période inconnue', async () => {
    signIn(MANAGER)

    await expectApiError(teamView(testEvent({ path: '/api/team?period=trimestre' })), {
      statusCode: 422,
    })
  })
})

describe('GET /api/company — les indicateurs de l\'entreprise (CU-13)', () => {
  it('rend des agrégats et journalise la consultation', async () => {
    signIn(HR)
    const members = declaringScope(8)
    serveCompany(members)
    serveAggregateSources(members)

    const result = await companyView(testEvent({ path: '/api/company?period=mois' }))

    expect(result.available).toBe(true)
    expect(result.company).toEqual({ name: 'Atelier Voisin' })
    expect(result.days).toBe(30)
    expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'company.view', target: 'company:cmp_1/mois' }),
      }),
    )
  })

  /**
   * Le seuil est **partagé** avec la vue d'équipe : une entreprise de quatre
   * personnes n'a pas plus droit à des moyennes qu'une équipe de quatre. C'est
   * la relation `«include»` de CU-13 vers CU-12.1, vérifiée ici sur la route.
   */
  it('applique le même seuil qu\'à l\'équipe', async () => {
    signIn(HR)
    const members = declaringScope(4)
    serveCompany(members)
    serveAggregateSources(members)

    const result = await companyView(testEvent({ path: '/api/company' }))

    expect(result.available).toBe(false)
  })

  it('refuse un manager', async () => {
    signIn(MANAGER)

    await expectApiError(companyView(testEvent({ path: '/api/company' })), {
      statusCode: 403,
      code: 'forbidden',
    })
  })

  it('refuse un collaborateur', async () => {
    signIn()

    await expectApiError(companyView(testEvent({ path: '/api/company' })), {
      statusCode: 403,
      code: 'forbidden',
    })
  })

  it('refuse un responsable RH sans entreprise, et journalise le refus', async () => {
    signIn(HR)
    prismaMock.user.findUnique.mockResolvedValue({ company: null })
    prismaMock.accessLog.create.mockResolvedValue({ id: 'log_1' })

    await expectApiError(companyView(testEvent({ path: '/api/company' })), {
      statusCode: 403,
      code: 'no_company',
    })

    expect(prismaMock.accessLog.create).toHaveBeenCalled()
  })

  it('exige une session', async () => {
    await expectApiError(companyView(testEvent({ path: '/api/company' })), { statusCode: 401 })
  })
})

describe('GET /api/company/export — l\'export des indicateurs (CU-14)', () => {
  it('rend un fichier CSV nommé, non mis en cache, et journalise l\'export', async () => {
    signIn(HR)
    const members = declaringScope(8)
    serveCompany(members)
    serveAggregateSources(members)

    const event = testEvent({ path: '/api/company/export?period=semaine' })
    const csv = await companyExport(event)
    const headers = responseHeaders(event)

    expect(csv).toContain('Journée')
    expect(csv).toContain('Humeur moyenne')
    expect(headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(headers['cache-control']).toBe('no-store')
    // Le nom porte l'entreprise et la période : un fichier retrouvé six mois
    // plus tard doit se relire sans être rouvert.
    expect(headers['content-disposition']).toContain('zentime-atelier-voisin-semaine-')

    expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'company.export' }) }),
    )
  })

  /**
   * Un tableur vide se prend pour une absence d'activité, alors qu'il s'agit
   * d'un refus de calculer. La différence compte pour qui prépare un bilan
   * social — d'où un refus explicite, et non un fichier sans lignes.
   */
  it('refuse d\'exporter sous le seuil plutôt que de rendre un fichier vide', async () => {
    signIn(HR)
    const members = declaringScope(4)
    serveCompany(members)
    serveAggregateSources(members)

    await expectApiError(companyExport(testEvent({ path: '/api/company/export' })), {
      statusCode: 409,
      code: 'below_anonymity_threshold',
    })

    // Refus **avant** la trace de succès : rien n'a été exporté.
    expect(prismaMock.accessLog.create).not.toHaveBeenCalled()
  })

  it('refuse un manager', async () => {
    signIn(MANAGER)

    await expectApiError(companyExport(testEvent({ path: '/api/company/export' })), {
      statusCode: 403,
      code: 'forbidden',
    })
  })

  it('refuse un collaborateur', async () => {
    signIn()

    await expectApiError(companyExport(testEvent({ path: '/api/company/export' })), {
      statusCode: 403,
      code: 'forbidden',
    })
  })

  it('exige une session', async () => {
    await expectApiError(companyExport(testEvent({ path: '/api/company/export' })), {
      statusCode: 401,
    })
  })
})
