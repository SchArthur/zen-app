import { z } from 'zod'

/**
 * CU-07 — Suivre une pause.
 *
 * Une seule entrée à filtrer : la profondeur de l'historique demandé. Elle
 * arrive par la chaîne de requête, donc sous forme de texte — d'où la coercition
 * avant les contrôles de bornes.
 */

/** Douze mois glissants, la fenêtre annoncée par F3. */
export const HISTORY_MAX_DAYS = 366

/** Une semaine : la profondeur qu'affiche l'écran du minuteur. */
export const HISTORY_DEFAULT_DAYS = 7

const daysSchema = z.coerce
  .number('Nombre de jours invalide.')
  .int('Nombre de jours invalide.')
  .min(1, `L'historique porte sur 1 à ${HISTORY_MAX_DAYS} jours.`)
  .max(HISTORY_MAX_DAYS, `L'historique porte sur 1 à ${HISTORY_MAX_DAYS} jours.`)
  .default(HISTORY_DEFAULT_DAYS)

export const breaksQuerySchema = z.object({ days: daysSchema })
