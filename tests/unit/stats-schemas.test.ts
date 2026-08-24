import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DEFAULT_PERIOD, statsQuerySchema } from '../../server/utils/stats-schemas'

/**
 * Schéma d'entrée partagé par `/api/stats`, `/api/team`, `/api/company` et
 * l'export (CU-11, CU-12, CU-13, CU-14).
 *
 * Le dernier test de ce fichier est le plus important : il décrit la **surface
 * d'attaque** des vues d'encadrement. F8 exige des tests vérifiant qu'un manager
 * ne peut pas accéder aux données d'une autre équipe ; la garantie ne vient pas
 * d'un contrôle, elle vient du fait qu'il n'y a rien à contrôler — aucun
 * identifiant de périmètre n'entre par la requête.
 */

function errorsFor(input: unknown, field: string) {
  const result = statsQuerySchema.safeParse(input)
  if (result.success) return []
  return z.flattenError(result.error).fieldErrors[field] ?? []
}

describe('statsQuerySchema', () => {
  it('retient la semaine quand la période n\'est pas précisée', () => {
    expect(statsQuerySchema.parse({})).toEqual({ period: DEFAULT_PERIOD })
  })

  it('accepte les deux périodes sélectionnables de F7', () => {
    expect(statsQuerySchema.parse({ period: 'semaine' })).toEqual({ period: 'semaine' })
    expect(statsQuerySchema.parse({ period: 'mois' })).toEqual({ period: 'mois' })
  })

  it('refuse toute autre période', () => {
    expect(errorsFor({ period: 'annee' }, 'period')).toContain('Période inconnue.')
    expect(errorsFor({ period: '' }, 'period')).toContain('Période inconnue.')
  })

  /**
   * Le périmètre consulté est **déduit du compte**, jamais reçu : ni équipe, ni
   * entreprise, ni identifiant d'utilisateur ne traversent ce schéma. Un
   * paramètre glissé dans l'URL est écarté avant d'atteindre le gestionnaire,
   * qui n'a de toute façon aucun moyen de le lire.
   *
   * C'est ce qui rend l'accès à l'équipe d'autrui impossible plutôt
   * qu'interdit : il n'y a pas d'identifiant à deviner ni à falsifier.
   */
  it('n\'accepte aucun identifiant de périmètre', () => {
    const forged = statsQuerySchema.parse({
      period: 'mois',
      teamId: 'equipe-de-quelquun-dautre',
      companyId: 'une-autre-entreprise',
      userId: 'un-collegue',
    })

    expect(forged).toEqual({ period: 'mois' })
    expect(Object.keys(forged)).toEqual(['period'])
  })
})
