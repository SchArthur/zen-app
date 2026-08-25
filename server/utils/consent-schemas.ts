import { z } from 'zod'

/**
 * CU-04 — corps de `PUT /api/consent`.
 *
 * Une finalité par clé, jamais un consentement global : un « j'accepte tout »
 * ne serait pas **spécifique** au sens de l'article 4.11, donc pas valide. Les
 * deux clés sont facultatives et au moins une est exigée — le bandeau ne décide
 * que de la mesure d'audience, l'écran « mes données » des deux.
 *
 * Le booléen est obligatoire là où il est présent : il n'existe pas de valeur
 * intermédiaire entre accepter et refuser, et une clé envoyée à `null` serait
 * une manière détournée d'effacer une décision plutôt que d'en prendre une.
 */
const decisionSchema = z.boolean('Indiquez si vous acceptez ou refusez.')

export const consentDecisionSchema = z
  .object({
    analytics: decisionSchema.optional(),
    wellbeing: decisionSchema.optional(),
  })
  .refine(
    value => value.analytics !== undefined || value.wellbeing !== undefined,
    { message: 'Aucune décision transmise.', path: ['analytics'] },
  )

export type ConsentDecisionInput = z.infer<typeof consentDecisionSchema>
