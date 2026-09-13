import { APP_TIME_ZONE } from '#shared/utils/time'

/**
 * CU-09 — les deux échelles du check-in quotidien.
 *
 * F5 impose que chaque niveau soit identifiable par sa **couleur**, sa **forme**
 * et son **libellé** — les trois, pas l'un des trois. C'est la raison d'être de
 * ce fichier : les trois attributs d'un niveau sont décrits au même endroit, ce
 * qui rend visible l'oubli de l'un d'eux.
 *
 * La forme est portée par la hauteur de la barre (`weight`) : elle croît avec le
 * niveau, elle reste lisible en noir et blanc, et elle survit à un daltonisme
 * comme à un écran mal calibré. Le libellé, lui, est toujours affiché — jamais
 * réservé à une infobulle, qui n'existe pas au doigt.
 */

export interface ScaleLevel {
  value: number
  label: string
  /** Aplat de couleur du niveau. */
  tone: string
  /** Hauteur relative de la barre, de 0 à 1 : la forme du niveau. */
  weight: number
}

/**
 * Humeur, de 1 à 5. Les libellés décrivent un ressenti, jamais un jugement :
 * « Difficile » et non « Mauvais », « Léger » et non « Bon ».
 *
 * Le vocabulaire évite aussi toute connotation clinique — ZenTime n'est pas un
 * dispositif médical, et une échelle qui parlerait de « déprimé » ou d'« anxieux »
 * porterait un diagnostic (règle éditoriale, `normes-et-conformite.md` §5).
 */
export const moodLevels: ScaleLevel[] = [
  { value: 1, label: 'Difficile', tone: 'bg-mood-1', weight: 0.34 },
  { value: 2, label: 'Fatigué', tone: 'bg-mood-2', weight: 0.5 },
  { value: 3, label: 'Neutre', tone: 'bg-mood-3', weight: 0.66 },
  { value: 4, label: 'Léger', tone: 'bg-mood-4', weight: 0.83 },
  { value: 5, label: 'Rayonnant', tone: 'bg-mood-5', weight: 1 },
]

/**
 * Stress, de 1 à 5. L'échelle est inversée par rapport à l'humeur : 1 est le bon
 * côté. Les couleurs suivent le sens et non le chiffre — le vert reste « tout va
 * bien » des deux côtés, faute de quoi un même vert dirait une chose sur une
 * échelle et son contraire sur l'autre.
 */
export const stressLevels: ScaleLevel[] = [
  { value: 1, label: 'Serein', tone: 'bg-stress-1', weight: 0.34 },
  { value: 2, label: 'Tranquille', tone: 'bg-stress-2', weight: 0.5 },
  { value: 3, label: 'Sous pression', tone: 'bg-stress-3', weight: 0.66 },
  { value: 4, label: 'Tendu', tone: 'bg-stress-4', weight: 0.83 },
  { value: 5, label: 'Débordé', tone: 'bg-stress-5', weight: 1 },
]

/** Libellé d'un niveau, pour les résumés textuels et les `aria-label`. */
export function levelLabel(levels: ScaleLevel[], value: number | null) {
  return levels.find(level => level.value === value)?.label ?? null
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const shortDayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  weekday: 'narrow',
})

/**
 * Reconstruit la date d'une journée `AAAA-MM-JJ`.
 *
 * Champ par champ : `new Date('2026-08-19')` serait lu comme minuit **UTC** et
 * reculerait d'un jour à l'affichage dans les fuseaux à l'ouest de Greenwich.
 */
function fromDayKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)

  return new Date(year!, month! - 1, day!)
}

/** Journée d'une déclaration : « Mercredi 19 août ». */
export function formatCheckInDay(key: string) {
  const label = dayFormatter.format(fromDayKey(key))

  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Initiale du jour de la semaine, pour les légendes d'axe : « L », « M »… */
export function formatDayInitial(key: string) {
  return shortDayFormatter.format(fromDayKey(key)).toUpperCase()
}
