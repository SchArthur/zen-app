import { z, type ZodType } from 'zod'
import type { H3Event } from 'h3'

/**
 * Filtrage des entrées : rien n'atteint la base sans être passé par un schéma.
 * En cas d'échec, la réponse liste les messages **par champ**, ce qu'attend
 * l'exception E2 de CU-02 (« indication du critère manquant »).
 */
export async function validateBody<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  const result = schema.safeParse(await readBody(event))

  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Données invalides',
      data: { errors: z.flattenError(result.error).fieldErrors },
    })
  }

  return result.data
}

/** Même contrat que validateBody, appliqué aux paramètres d'URL. */
export function validateQuery<T>(event: H3Event, schema: ZodType<T>): T {
  const result = schema.safeParse(getQuery(event))

  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Données invalides',
      data: { errors: z.flattenError(result.error).fieldErrors },
    })
  }

  return result.data
}
