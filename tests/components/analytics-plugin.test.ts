import { beforeEach, describe, expect, it, vi } from 'vitest'
import analyticsPlugin from '../../app/plugins/analytics'
import { serve } from '../helpers/vue'

/**
 * Mesure d'audience — F12 : « outil de mesure d'audience installé et
 * fonctionnel, **déclenché uniquement après consentement** ».
 *
 * Trois conditions cumulatives, et la troisième est celle qui compte. Ce test
 * vérifie exactement ce qui est **inséré dans la page**, parce que c'est la
 * seule preuve qui vaille : un script chargé puis neutralisé reviendrait à
 * déposer d'abord et demander ensuite.
 */

const head: unknown[] = []
const config = { public: { analytics: { host: '', domain: '' } } }

beforeEach(() => {
  head.length = 0
  config.public.analytics = { host: '', domain: '' }

  vi.stubGlobal('useRuntimeConfig', () => config)
  // `useHead` reçoit une fonction : c'est ce qui rend la balise réactive au
  // consentement. On l'évalue pour lire ce qui serait rendu.
  vi.stubGlobal('useHead', (input: () => unknown) => head.push(input()))
})

/** Ce que le module rendrait dans l'en-tête du document. */
async function rendu(options: { host?: string, domain?: string, analytics: boolean | null }) {
  config.public.analytics = { host: options.host ?? '', domain: options.domain ?? '' }

  serve('/api/consent', {
    policyVersion: 'v1',
    analytics: options.analytics,
    analyticsDecidedAt: null,
    wellbeing: null,
    wellbeingDecidedAt: null,
  })

  await (analyticsPlugin as unknown as () => Promise<void>)()

  return head
}

describe('la mesure d\'audience', () => {
  /**
   * Sans hôte ni domaine, rien n'est chargé — et rien n'est ouvert dans la
   * politique de sécurité de contenu : une origine tierce autorisée « au cas
   * où » est une origine tierce autorisée.
   */
  it('ne consulte même pas le consentement sans outil configuré', async () => {
    expect(await rendu({ analytics: true })).toEqual([])
  })

  it('ne charge rien tant que le consentement n\'a pas été donné', async () => {
    const rendus = await rendu({
      host: 'https://mesure.zentime.fr',
      domain: 'zentime.fr',
      analytics: null,
    })

    expect(rendus).toEqual([{}])
  })

  it('ne charge rien sur un refus', async () => {
    const rendus = await rendu({
      host: 'https://mesure.zentime.fr',
      domain: 'zentime.fr',
      analytics: false,
    })

    expect(rendus).toEqual([{}])
  })

  it('insère le script, et lui seul, une fois le consentement accordé', async () => {
    const rendus = await rendu({
      host: 'https://mesure.zentime.fr',
      domain: 'zentime.fr',
      analytics: true,
    })

    expect(rendus[0]).toEqual({
      script: [{
        // Clé nommée : sans elle, la balise rendue côté serveur n'est pas
        // reprise en main par le gestionnaire d'en-tête, et un retrait de
        // consentement la laissait en place jusqu'au rechargement suivant.
        key: 'audience',
        src: 'https://mesure.zentime.fr/js/script.js',
        defer: true,
        'data-domain': 'zentime.fr',
      }],
    })
  })
})
