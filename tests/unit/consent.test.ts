import { describe, expect, it } from 'vitest'
import { ConsentType } from '../../lib/generated/prisma/enums.js'
import {
  CONSENT_POLICY_VERSION,
  CONSENT_VALIDITY_DAYS,
  isDecisionCurrent,
  wellbeingConsentState,
} from '../../server/utils/consent'

const NOW = new Date('2026-08-25T10:00:00.000Z')

function decision(overrides: Partial<{ granted: boolean, version: string, createdAt: Date }> = {}) {
  return {
    granted: true,
    version: CONSENT_POLICY_VERSION,
    createdAt: NOW,
    ...overrides,
  }
}

/** Une décision datée de `days` jours avant `NOW`. */
function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000)
}

describe('isDecisionCurrent', () => {
  it('retient une décision prise à l\'instant', () => {
    expect(isDecisionCurrent(decision(), ConsentType.ANALYTICS, NOW)).toBe(true)
  })

  // Le journal recopie la version des textes acceptés. Une politique réécrite
  // rend caduc ce à quoi les gens avaient dit oui, quelle que soit sa fraîcheur.
  it('écarte une décision prise sur une version antérieure des textes', () => {
    expect(isDecisionCurrent(decision({ version: 'v0' }), ConsentType.ANALYTICS, NOW)).toBe(false)
    expect(isDecisionCurrent(decision({ version: 'v0' }), ConsentType.WELLBEING_DATA, NOW)).toBe(false)
  })

  describe('mesure d\'audience — six mois de validité (doctrine CNIL)', () => {
    it('retient un choix de la veille de l\'échéance', () => {
      const value = decision({ createdAt: daysAgo(CONSENT_VALIDITY_DAYS - 1) })
      expect(isDecisionCurrent(value, ConsentType.ANALYTICS, NOW)).toBe(true)
    })

    it('écarte un choix arrivé à échéance', () => {
      const value = decision({ createdAt: daysAgo(CONSENT_VALIDITY_DAYS) })
      expect(isDecisionCurrent(value, ConsentType.ANALYTICS, NOW)).toBe(false)
    })

    // La péremption vaut dans les deux sens : un refus définitif ne serait plus
    // une décision révisable, et la question doit être reposée.
    it('écarte aussi un refus arrivé à échéance', () => {
      const value = decision({ granted: false, createdAt: daysAgo(CONSENT_VALIDITY_DAYS + 30) })
      expect(isDecisionCurrent(value, ConsentType.ANALYTICS, NOW)).toBe(false)
    })
  })

  // La péremption est une règle de traceur. Appliquée à la base légale d'un
  // traitement, elle fermerait le formulaire de déclaration à quelqu'un qui n'a
  // jamais rien retiré.
  it('ne fait pas périmer le consentement au suivi du bien-être', () => {
    const value = decision({ createdAt: daysAgo(CONSENT_VALIDITY_DAYS * 4) })
    expect(isDecisionCurrent(value, ConsentType.WELLBEING_DATA, NOW)).toBe(true)
  })
})

describe('wellbeingConsentState', () => {
  it('rend « inconnu » quand la question n\'a jamais été posée', () => {
    expect(wellbeingConsentState(null)).toBe('unknown')
  })

  it('rend « accordé » sur une décision positive à jour', () => {
    expect(wellbeingConsentState(decision())).toBe('granted')
  })

  it('rend « retiré » sur une décision négative', () => {
    expect(wellbeingConsentState(decision({ granted: false }))).toBe('withdrawn')
  })

  // Une décision positive prise sur d'autres textes ne vaut plus, mais elle ne
  // se retourne pas en refus : la question est reposée, pas tranchée à la place
  // de la personne.
  it('repose la question après un changement de version, sans conclure au refus', () => {
    expect(wellbeingConsentState(decision({ version: 'v0' }))).toBe('unknown')
  })

  // Le retrait, lui, reste opposable quelle que soit la version : c'est la
  // moitié de la règle qui protège la personne.
  it('garde un retrait opposable même sur une version antérieure', () => {
    expect(wellbeingConsentState(decision({ granted: false, version: 'v0' }))).toBe('withdrawn')
  })
})
