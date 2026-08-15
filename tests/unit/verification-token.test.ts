import { describe, expect, it } from 'vitest'
import {
  EMAIL_VERIFICATION_TTL_HOURS,
  generateVerificationToken,
  hashVerificationToken,
  verificationTokenExpiry,
} from '../../server/utils/verification-token'

describe('generateVerificationToken', () => {
  it('produit un jeton différent à chaque appel', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateVerificationToken))

    expect(tokens.size).toBe(100)
  })

  it('reste transportable dans une URL', () => {
    const token = generateVerificationToken()

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(token)).toBe(token)
  })

  it('porte 256 bits d\'entropie', () => {
    expect(Buffer.from(generateVerificationToken(), 'base64url')).toHaveLength(32)
  })
})

describe('hashVerificationToken', () => {
  it('est déterministe', () => {
    const token = generateVerificationToken()

    expect(hashVerificationToken(token)).toBe(hashVerificationToken(token))
  })

  it('ne laisse pas retrouver le jeton stocké', () => {
    const token = generateVerificationToken()
    const hash = hashVerificationToken(token)

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
  })

  it('distingue deux jetons voisins', () => {
    expect(hashVerificationToken('jeton-a')).not.toBe(hashVerificationToken('jeton-b'))
  })
})

describe('verificationTokenExpiry', () => {
  it('place l\'échéance à la durée annoncée', () => {
    const from = new Date('2026-08-15T10:00:00.000Z')

    expect(verificationTokenExpiry(from).toISOString())
      .toBe(new Date(from.getTime() + EMAIL_VERIFICATION_TTL_HOURS * 3600_000).toISOString())
  })

  it('produit une échéance future', () => {
    expect(verificationTokenExpiry().getTime()).toBeGreaterThan(Date.now())
  })
})
