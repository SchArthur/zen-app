import { z } from 'zod'

/**
 * CU-09 — Déclarer son humeur et son stress.
 *
 * Deux entiers, et rien d'autre. Le champ libre `note` du schéma initial a été
 * retiré à l'ouverture du lot 4 : F5 ne le demande pas, et un texte libre posé
 * sur une déclaration de ressenti fait entrer des données d'article 9 dans la
 * table même qu'agrègent les vues d'encadrement (écart E1 de
 * `docs/normes-et-conformite.md`, tranché le 21/08/2026).
 *
 * Le formulaire n'a donc rien à filtrer côté texte — ce qui, sur une donnée de
 * santé déclarée, est la meilleure garantie qu'on puisse offrir.
 */

/** Bornes des deux échelles, telles que F5 les fixe : cinq niveaux. */
export const MOOD_SCALE_MIN = 1
export const MOOD_SCALE_MAX = 5

// Message identique pour les deux bornes et pour le type : un client qui envoie
// 0, 6 ou « bien » commet la même erreur — une valeur hors échelle. Le
// distinguer n'aiderait personne et décrirait notre validation à qui la sonde.
function scaleSchema(label: string) {
  const message = `${label} : choisissez un niveau de ${MOOD_SCALE_MIN} à ${MOOD_SCALE_MAX}.`

  return z
    .int(message)
    .min(MOOD_SCALE_MIN, message)
    .max(MOOD_SCALE_MAX, message)
}

/**
 * Les deux échelles sont obligatoires ensemble.
 *
 * F5 parle d'une déclaration, pas de deux : accepter une humeur sans stress
 * ferait entrer en base des journées à moitié renseignées, que les moyennes
 * d'équipe devraient ensuite apprendre à distinguer des journées complètes.
 */
export const moodCheckInSchema = z.object({
  mood: scaleSchema('Humeur'),
  stress: scaleSchema('Stress'),
})

export type MoodCheckInInput = z.infer<typeof moodCheckInSchema>

/** Deux semaines : la profondeur affichée sous le formulaire. */
export const MOOD_HISTORY_DEFAULT_DAYS = 14

/** Douze mois glissants, la même fenêtre que l'historique des pauses. */
export const MOOD_HISTORY_MAX_DAYS = 366

const daysSchema = z.coerce
  .number('Nombre de jours invalide.')
  .int('Nombre de jours invalide.')
  .min(1, `L'historique porte sur 1 à ${MOOD_HISTORY_MAX_DAYS} jours.`)
  .max(MOOD_HISTORY_MAX_DAYS, `L'historique porte sur 1 à ${MOOD_HISTORY_MAX_DAYS} jours.`)
  .default(MOOD_HISTORY_DEFAULT_DAYS)

export const moodQuerySchema = z.object({ days: daysSchema })
