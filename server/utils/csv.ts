/**
 * CU-14 — Exporter les indicateurs, au format tableur (F9).
 *
 * Trois décisions, toutes dictées par la destination réelle du fichier : un
 * tableur, ouvert par un responsable RH, sur un poste configuré en français.
 *
 * **Le point-virgule sépare les colonnes**, et la virgule reste le séparateur
 * décimal. C'est la convention qu'attend Excel en locale française ; produire
 * `4.2` avec des virgules de séparation obligerait la personne à passer par
 * l'assistant d'importation, ce qu'un export « prêt à l'emploi » ne devrait
 * jamais demander.
 *
 * **Le fichier commence par une marque d'ordre d'octets.** Sans elle, Excel lit
 * l'UTF-8 comme du Windows-1252 et rend « Journée » en « JournÃ©e ».
 *
 * **Les cellules de texte sont neutralisées.** Une cellule commençant par `=`,
 * `+`, `-` ou `@` est interprétée comme une formule à l'ouverture : c'est
 * l'injection de formule, et le vecteur est ici un nom d'équipe ou d'entreprise,
 * saisi par un humain. Le préfixe d'apostrophe force le tableur à la lire comme
 * du texte.
 */

/** Séparateur de colonnes. Voir l'en-tête : c'est ce qu'attend un tableur français. */
export const CSV_SEPARATOR = ';'

/** Marque d'ordre d'octets, sans laquelle les accents se perdent à l'ouverture. */
export const CSV_BOM = '﻿'

/** Caractères qui font d'une cellule une formule aux yeux d'un tableur. */
const FORMULA_STARTERS = ['=', '+', '-', '@', '\t', '\r']

/**
 * Met une valeur texte en forme, échappement et neutralisation compris.
 *
 * La neutralisation ne s'applique **qu'au texte** : un nombre négatif commence
 * lui aussi par un tiret, et le préfixer d'une apostrophe le transformerait en
 * chaîne de caractères dans le tableur — l'export cesserait d'être calculable.
 */
function escapeText(value: string) {
  const guarded = FORMULA_STARTERS.some(starter => value.startsWith(starter))
    ? `'${value}`
    : value

  if (guarded.includes(CSV_SEPARATOR) || guarded.includes('"') || /[\r\n]/.test(guarded)) {
    return `"${guarded.replaceAll('"', '""')}"`
  }

  return guarded
}

/** Nombre à la française : virgule décimale, au plus une décimale. */
function formatNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('fr-FR', { maximumFractionDigits: 1, useGrouping: false })
}

/**
 * Une cellule.
 *
 * `null` produit une cellule **vide** et non un zéro : c'est la même règle que
 * partout ailleurs dans le produit — une journée non déclarée, ou masquée par le
 * seuil d'anonymat, n'est pas une journée à zéro (A2 de CU-09).
 */
export function formatCell(value: string | number | null) {
  if (value === null) return ''
  if (typeof value === 'number') return formatNumber(value)

  return escapeText(value)
}

/**
 * Assemble un tableau en CSV.
 *
 * Fin de ligne CRLF, conformément à la RFC 4180 : c'est ce qu'attendent les
 * tableurs sous Windows, où ce fichier finira le plus souvent.
 */
export function toCsv(headers: string[], rows: (string | number | null)[][]) {
  const lines = [headers, ...rows].map(row => row.map(formatCell).join(CSV_SEPARATOR))

  return CSV_BOM + lines.join('\r\n') + '\r\n'
}
