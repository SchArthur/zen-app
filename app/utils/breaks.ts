import { APP_TIME_ZONE } from '../../shared/utils/time'

/**
 * Mise en forme des durées et des dates de pause.
 *
 * Regroupées ici parce que l'écran du minuteur et celui de l'historique
 * affichent les mêmes valeurs : une pause de douze minutes doit se lire
 * « 12 min » des deux côtés, sinon on croit lire deux mesures différentes.
 */

// Le fuseau est imposé et non laissé à l'horloge du navigateur : le serveur
// range les pauses par journée avec le même, et une heure formatée autrement au
// rendu puis à l'hydratation ferait diverger la page.
const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** Heure de début d'une pause : « 14:32 ». */
export function formatTime(iso: string) {
  return timeFormatter.format(new Date(iso))
}

/**
 * Durée d'une pause terminée : « 45 s », « 12 min », « 1 h 05 ».
 *
 * Les secondes ne sont affichées qu'en dessous de la minute : au-delà, elles
 * suggèrent une précision qui n'intéresse personne — ce que le produit valorise
 * est la fréquence des interruptions, pas leur durée au chronomètre.
 */
export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} s`

  const minutes = Math.round(seconds / 60)

  if (minutes < 60) return `${minutes} min`

  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

/** Minuteur en cours : « 04:12 », et « 1:04:12 » au-delà de l'heure. */
export function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60) % 60
  const body = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const hours = Math.floor(seconds / 3600)

  return hours ? `${hours}:${body}` : body
}

/**
 * Libellé d'une journée d'historique : « Mercredi 19 août ».
 *
 * La clé arrive au format `AAAA-MM-JJ` et la date est reconstruite champ par
 * champ : `new Date('2026-08-19')` serait lu comme minuit **UTC** et reculerait
 * d'un jour à l'affichage dans les fuseaux à l'ouest de Greenwich.
 */
export function formatDayLabel(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  const label = dayFormatter.format(new Date(year!, month! - 1, day!))

  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Journée repérée par son rang dans l'historique : « Aujourd'hui », « Hier »,
 * puis la date.
 *
 * Le rang, et non une comparaison de dates : c'est le serveur qui a décidé où
 * commence aujourd'hui, en découpant l'historique. Le recalculer ici ferait
 * diverger les deux au passage de minuit.
 */
export function formatRelativeDay(index: number, key: string) {
  if (index === 0) return 'Aujourd\'hui'
  if (index === 1) return 'Hier'

  return formatDayLabel(key)
}
