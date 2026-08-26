import { describe, expect, it } from 'vitest'
import { PUBLIC_API_ROUTES, assertRole, isPublicApiRoute } from '../../server/utils/authorization'

const user = {
  id: 'usr_1',
  email: 'sofia.nakamura@zentime.demo',
  firstName: 'Sofia',
  lastName: 'Nakamura',
  role: 'MANAGER' as const,
  companyId: 'cmp_1',
  teamId: 'team_1',
}

describe('isPublicApiRoute', () => {
  it('laisse passer chaque route publique déclarée', () => {
    for (const route of PUBLIC_API_ROUTES) {
      expect(isPublicApiRoute(route), route).toBe(true)
    }
  })

  it('ignore la chaîne de requête', () => {
    expect(isPublicApiRoute('/api/auth/verify-email?token=abc123')).toBe(true)
  })

  it('ignore une barre oblique finale', () => {
    expect(isPublicApiRoute('/api/auth/login/')).toBe(true)
  })

  it('protège les routes authentifiées', () => {
    expect(isPublicApiRoute('/api/auth/me')).toBe(false)
  })

  // C'est l'intérêt du sens choisi : une route inventée est protégée d'office.
  it('protège une route qui n\'existe pas encore', () => {
    expect(isPublicApiRoute('/api/breaks')).toBe(false)
    expect(isPublicApiRoute('/api/teams/team_1/climate')).toBe(false)
  })

  it('ne se laisse pas contourner par un préfixe trompeur', () => {
    expect(isPublicApiRoute('/api/auth/login-as-admin')).toBe(false)
    expect(isPublicApiRoute('/api/auth/logout/../me')).toBe(false)
  })

  it('laisse passer les routes internes des modules Nuxt', () => {
    expect(isPublicApiRoute('/api/_auth/session')).toBe(true)
  })

  /**
   * CU-15 — la notification de paiement. Son appelant est le prestataire, qui
   * n'a évidemment pas de session : il s'authentifie par une signature du corps
   * exact de la requête. « Publique » au sens de cette liste ne veut donc pas
   * dire « ouverte ».
   *
   * Le reste du tunnel de paiement, lui, exige une session comme tout le
   * monde — et le vérifier ici garde la liste courte : c'est la seule route de
   * paiement qui avait une raison d'y entrer.
   */
  it('n\'ouvre du tunnel de paiement que la notification signée', () => {
    expect(isPublicApiRoute('/api/billing/webhook')).toBe(true)

    for (const route of ['/api/billing/checkout', '/api/billing/subscription', '/api/billing/confirm', '/api/billing/portal']) {
      expect(isPublicApiRoute(route), route).toBe(false)
    }
  })
})

describe('assertRole', () => {
  it('laisse passer le rôle attendu', () => {
    expect(() => assertRole(user, ['MANAGER'])).not.toThrow()
  })

  it('laisse passer l\'un des rôles attendus', () => {
    expect(() => assertRole(user, ['MANAGER', 'HR'])).not.toThrow()
  })

  it('refuse un rôle non prévu', () => {
    expect(() => assertRole(user, ['HR'])).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  // La matrice des accès n'accorde la vue d'équipe qu'au manager : un
  // collaborateur promu par erreur dans l'interface reste bloqué côté serveur.
  it('refuse un collaborateur sur une ressource d\'encadrement', () => {
    expect(() => assertRole({ ...user, role: 'COLLABORATOR' }, ['MANAGER', 'HR'])).toThrow()
  })

  it('ne divulgue pas le rôle attendu dans le message', () => {
    try {
      assertRole({ ...user, role: 'COLLABORATOR' }, ['HR'])
      expect.unreachable('assertRole aurait dû lever une erreur')
    }
    catch (error) {
      expect((error as Error).message).not.toContain('HR')
    }
  })
})
