import { describe, expect, it } from 'vitest'
import { formatPeriodEnd, subscriptionDisplays } from '../../app/utils/billing'
import { SubscriptionStatus } from '../../lib/generated/prisma/enums.js'

describe('subscriptionDisplays', () => {
  /**
   * Le vocabulaire du prestataire ne sort jamais de l'application. Ce test
   * échoue si un statut est ajouté au schéma sans sa phrase : l'écran afficherait
   * alors une case vide là où il doit dire ce qu'il y a à faire.
   */
  it('a une phrase pour chaque statut du schéma', () => {
    for (const status of Object.values(SubscriptionStatus)) {
      const display = subscriptionDisplays[status]

      expect(display, status).toBeDefined()
      expect(display.label.length, status).toBeGreaterThan(0)
      expect(display.detail.length, status).toBeGreaterThan(0)
    }
  })

  it('n\'emploie que les tons connus du bandeau de message', () => {
    for (const status of Object.values(SubscriptionStatus)) {
      expect(['info', 'success', 'warning', 'danger'], status)
        .toContain(subscriptionDisplays[status].tone)
    }
  })

  it('ne réserve le ton positif qu\'au seul statut qui ouvre des droits', () => {
    const positive = Object.values(SubscriptionStatus)
      .filter(status => subscriptionDisplays[status].tone === 'success')

    expect(positive).toEqual(['ACTIVE'])
  })
})

describe('formatPeriodEnd', () => {
  it('écrit la date en toutes lettres', () => {
    expect(formatPeriodEnd('2026-09-12T00:00:00.000Z')).toBe('12 septembre 2026')
    expect(formatPeriodEnd(new Date('2026-09-12T00:00:00.000Z'))).toBe('12 septembre 2026')
  })

  /**
   * `periodEndOf` rend `null` quand le prestataire ne donne pas d'échéance :
   * c'est un cas prévu, pas un accident. L'écran doit alors taire l'information
   * plutôt qu'afficher « Invalid Date » au milieu d'une phrase.
   */
  it('ne rend rien plutôt qu\'une date illisible', () => {
    expect(formatPeriodEnd(null)).toBe('')
    expect(formatPeriodEnd(undefined)).toBe('')
    expect(formatPeriodEnd('')).toBe('')
    expect(formatPeriodEnd('pas une date')).toBe('')
  })
})
