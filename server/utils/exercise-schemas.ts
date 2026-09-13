import { z } from 'zod'
import { ExerciseType } from '../../lib/generated/prisma/enums.js'

/**
 * CU-08 — Consulter le catalogue d'exercices.
 *
 * F4 demande un catalogue « filtrable par type — étirement, respiration,
 * méditation — et par durée ». Les deux filtres sont donc facultatifs et
 * cumulables : un filtre absent ne restreint rien, il n'a pas de valeur par
 * défaut cachée.
 *
 * Ils arrivent par la chaîne de requête, donc sous forme de texte — d'où la
 * coercition sur la durée. C'est aussi ce qui rend le catalogue filtré
 * partageable et rechargeable : l'état du filtre est dans l'URL, pas seulement
 * dans la mémoire de l'onglet.
 */

/**
 * Borne haute du filtre de durée.
 *
 * Le plus long exercice du catalogue dure huit minutes ; la borne est fixée bien
 * au-delà pour ne pas avoir à la déplacer à chaque ajout de contenu, mais elle
 * existe : sans elle, `?maxMin=1e12` traverserait la validation.
 */
export const EXERCISE_MAX_DURATION_MIN = 60

// `optional()` et non `default()` : « aucun filtre » et « filtre à la valeur
// maximale » ne sont pas la même demande, et seul le premier doit produire une
// requête sans clause `where`.
const typeSchema = z
  .enum(ExerciseType, 'Type d\'exercice inconnu.')
  .optional()

const maxMinSchema = z.coerce
  .number('Durée invalide.')
  .int('Durée invalide.')
  .min(1, `La durée doit être comprise entre 1 et ${EXERCISE_MAX_DURATION_MIN} minutes.`)
  .max(EXERCISE_MAX_DURATION_MIN, `La durée doit être comprise entre 1 et ${EXERCISE_MAX_DURATION_MIN} minutes.`)
  .optional()

export const exercisesQuerySchema = z.object({
  type: typeSchema,
  maxMin: maxMinSchema,
})

export type ExercisesQuery = z.infer<typeof exercisesQuerySchema>

/**
 * Forme d'un identifiant d'exercice dans l'URL.
 *
 * Le contrôle est volontairement strict — minuscules, chiffres et tirets — et
 * son échec est traité comme un exercice introuvable, jamais comme une donnée
 * invalide : répondre 422 sur `../../etc/passwd` et 404 sur `nuque-douce-2`
 * apprendrait à un curieux à distinguer une syntaxe refusée d'un contenu absent.
 */
export const exerciseSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64)
