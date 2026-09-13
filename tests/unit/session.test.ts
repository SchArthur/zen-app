import { describe, expect, it } from 'vitest'
import { toSessionUser } from '../../server/utils/session'

const stored = {
  id: 'usr_1',
  email: 'sofia.nakamura@zentime.demo',
  firstName: 'Sofia',
  lastName: 'Nakamura',
  role: 'MANAGER' as const,
  companyId: 'cmp_1',
  teamId: 'team_1',
  passwordHash: '$scrypt$n=16384,r=8,p=1$abcdef$0123456789',
  emailVerifiedAt: new Date(),
}

describe('toSessionUser', () => {
  it('ne retient que les champs destinés au cookie', () => {
    expect(toSessionUser(stored)).toEqual({
      id: 'usr_1',
      email: 'sofia.nakamura@zentime.demo',
      firstName: 'Sofia',
      lastName: 'Nakamura',
      role: 'MANAGER',
      companyId: 'cmp_1',
      teamId: 'team_1',
    })
  })

  it('ne laisse jamais passer le condensat du mot de passe', () => {
    expect(JSON.stringify(toSessionUser(stored))).not.toContain('scrypt')
  })

  it('écarte tout champ ajouté au modèle sans décision explicite', () => {
    const withExtras = { ...stored, moodAverage: 4.2, phoneNumber: '0600000000' }

    expect(Object.keys(toSessionUser(withExtras))).not.toContain('moodAverage')
    expect(Object.keys(toSessionUser(withExtras))).not.toContain('phoneNumber')
  })

  it('conserve l\'absence d\'équipe', () => {
    expect(toSessionUser({ ...stored, teamId: null }).teamId).toBeNull()
  })
})
