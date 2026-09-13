import { dayKey, localMinutes, previousDayKey } from '../../shared/utils/time'
import type { ExerciseType } from '../../lib/generated/prisma/enums.js'

/**
 * CU-10 / CU-10.1 — Consulter ses recommandations, et évaluer les règles.
 *
 * Un moteur de règles **déterministe**, sans apprentissage automatique : à
 * entrées identiques, sortie identique. C'est ce qui le rend testable à 100 %,
 * ce qu'exige F6, et c'est aussi ce qui le rend défendable — sur des données de
 * santé déclarées, une suggestion qu'on ne sait pas expliquer est reçue comme
 * une intrusion.
 *
 * Le fichier ne parle jamais à la base : il reçoit un état complet et rend une
 * décision. Tout ce qui suit est donc vérifiable sans Postgres.
 */

export interface RecommendableExercise {
  id: string
  slug: string
  title: string
  description: string
  type: ExerciseType
  durationMin: number
}

export interface RecommendInput {
  now: Date
  preferences: {
    workStartHour: number
    workEndHour: number
    reminderIntervalMin: number
    /** Types retenus dans le profil. Vide = aucune restriction. */
    favoriteTypes: ExerciseType[]
  }
  /** Déclaration d'humeur du jour, ou `null` si elle n'a pas été faite. */
  checkIn: { mood: number, stress: number } | null
  /** Fin de la dernière pause terminée, ou `null`. */
  lastBreakEndedAt: Date | null
  /** Une pause est en cours : le temps assis ne court pas. */
  breakRunning: boolean
  /** Dernière réalisation de chaque exercice, par identifiant. */
  activity: Map<string, { lastCompletedAt: Date }>
  catalogue: RecommendableExercise[]
}

export type RuleCode =
  | 'stress_high'
  | 'long_sitting'
  | 'mood_low'
  | 'break_running'
  | 'end_of_day'
  | 'start_of_day'
  | 'default'

export interface Recommendation {
  exercise: RecommendableExercise
  /** Règle qui a décidé. Code stable, destiné aux tests et à la traçabilité. */
  rule: RuleCode
  /** Motif affiché à côté de la suggestion, en une phrase (F6). */
  reason: string
}

interface Rule {
  code: RuleCode
  /** Famille recherchée, ou `null` si la règle n'en privilégie aucune. */
  type: ExerciseType | null
  /** Durée maximale recherchée, ou `null`. */
  maxMin: number | null
  /** Motif si la règle s'applique, `null` sinon. */
  match: (input: RecommendInput) => string | null
}

/** Durée d'immobilité, telle qu'elle se dit : « 45 min », « 3 h 10 ». */
function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`

  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

export interface SittingState {
  minutes: number
  /**
   * D'où court le compteur : de la dernière pause, ou du début de la journée
   * déclarée quand il n'y en a pas encore eu aujourd'hui.
   *
   * Le moteur de règles n'en a pas l'usage — seule la durée l'intéresse — mais
   * l'écran, si : écrire « depuis votre dernière pause » sous un compteur qui
   * part du début de la journée est faux, et c'est le genre de faux que
   * personne ne relève parce qu'il est presque toujours vrai.
   */
  basis: 'break' | 'workday'
}

/**
 * Temps passé assis sans interruption.
 *
 * Compté depuis la fin de la dernière pause, ou depuis le début de la journée
 * déclarée si aucune pause n'a encore été prise — c'est le temps assis qui est
 * mesuré, pas le temps écoulé depuis l'ouverture de l'écran. Même base de calcul
 * que le rappel de pause (`useBreakReminder`), pour que le tableau de bord et le
 * minuteur ne racontent pas deux histoires différentes.
 *
 * Renvoie `null` quand la question n'a pas de sens : pendant une pause, et avant
 * le début de la journée de travail déclarée.
 */
export function sittingState(input: RecommendInput): SittingState | null {
  if (input.breakRunning) return null

  const sinceWorkStart = localMinutes(input.now) - input.preferences.workStartHour * 60

  if (sinceWorkStart <= 0) return null

  // Jamais négatif, pour la même raison qu'`elapsedSec` : l'horloge du serveur
  // peut être resynchronisée, et une donnée de démonstration peut être datée
  // dans l'avenir. Un temps assis négatif ne se corrige pas plus loin — il
  // s'affiche tel quel et alimente les moyennes.
  const sinceLastBreak = input.lastBreakEndedAt
    ? Math.max(0, Math.floor((input.now.getTime() - input.lastBreakEndedAt.getTime()) / 60_000))
    : Number.POSITIVE_INFINITY

  return sinceLastBreak < sinceWorkStart
    ? { minutes: sinceLastBreak, basis: 'break' }
    : { minutes: sinceWorkStart, basis: 'workday' }
}

/** La durée seule : ce dont les règles ont besoin. */
export function sittingMinutes(input: RecommendInput) {
  return sittingState(input)?.minutes ?? null
}

/**
 * Les sept règles, **dans l'ordre de priorité**. La première qui s'applique
 * décide ; les suivantes ne sont pas évaluées.
 *
 * L'ordre est celui de l'urgence ressentie, pas celui de la facilité de calcul :
 * un stress déclaré élevé passe avant l'heure qu'il est, et l'immobilité
 * prolongée passe avant une humeur basse — la première a une réponse immédiate,
 * la seconde non.
 *
 * **Le motif ne nomme jamais la famille d'exercice.** Il énonce ce que le moteur
 * a observé, et rien d'autre. C'est ce qui le garde vrai lorsque la sélection se
 * rabat sur une autre famille faute de candidat, et c'est aussi ce que
 * l'utilisateur a besoin de savoir : laquelle de ses données a été utilisée.
 */
export const RULES: Rule[] = [
  {
    code: 'stress_high',
    type: 'BREATHING',
    maxMin: 5,
    match: ({ checkIn }) =>
      checkIn && checkIn.stress >= 4
        ? 'Vous avez déclaré un niveau de stress élevé aujourd\'hui.'
        : null,
  },
  {
    code: 'long_sitting',
    type: 'STRETCHING',
    maxMin: null,
    match: (input) => {
      const sitting = sittingMinutes(input)

      if (sitting === null) return null

      // Deux fois l'intervalle de rappel : le premier rappel a déjà eu lieu et
      // n'a pas été suivi d'effet. Le seuil se déduit du réglage de la personne
      // plutôt que d'être fixé, comme l'objectif quotidien de pauses.
      if (sitting < 2 * input.preferences.reminderIntervalMin) return null

      return `Vous êtes assis sans interruption depuis ${formatMinutes(sitting)}.`
    },
  },
  {
    code: 'mood_low',
    type: 'MEDITATION',
    maxMin: null,
    match: ({ checkIn }) =>
      checkIn && checkIn.mood <= 2
        ? 'Vous avez déclaré une humeur basse aujourd\'hui.'
        : null,
  },
  {
    code: 'break_running',
    type: null,
    maxMin: 5,
    match: ({ breakRunning }) =>
      breakRunning
        ? 'Votre pause est en cours : c\'est le moment le plus simple pour en profiter.'
        : null,
  },
  {
    code: 'end_of_day',
    type: 'MEDITATION',
    maxMin: null,
    match: ({ now, preferences }) => {
      const minutes = localMinutes(now)

      return minutes >= (preferences.workEndHour - 1) * 60 && minutes < preferences.workEndHour * 60
        ? 'Votre journée de travail se termine.'
        : null
    },
  },
  {
    code: 'start_of_day',
    type: 'STRETCHING',
    maxMin: 3,
    match: ({ now, preferences }) => {
      const minutes = localMinutes(now)

      return minutes >= preferences.workStartHour * 60 && minutes < (preferences.workStartHour + 1) * 60
        ? 'Votre journée commence.'
        : null
    },
  },
  {
    // Filet de sécurité : elle s'applique toujours, et garantit qu'il y a
    // toujours quelque chose à proposer plutôt qu'un écran vide.
    code: 'default',
    type: null,
    maxMin: null,
    match: () => 'Rien de particulier à signaler aujourd\'hui.',
  },
]

/**
 * Familles autorisées par le profil, ou `null` si tout est permis.
 *
 * F6 est explicite : « aucun exercice proposé parmi les types écartés dans le
 * profil ». Le filtre est donc **dur** ici, là où le catalogue, lui, reste
 * entier — on choisit librement ce qu'on va chercher, mais on ne se fait pas
 * proposer ce qu'on a écarté.
 *
 * Une liste vide vaut « aucune préférence exprimée » et non « rien n'est
 * autorisé » : l'interpréter autrement priverait de recommandation tout compte
 * n'ayant jamais ouvert ses réglages.
 */
function allowedTypes(favoriteTypes: ExerciseType[]) {
  return favoriteTypes.length ? new Set(favoriteTypes) : null
}

/**
 * L'exercice a-t-il déjà été fait aujourd'hui ou hier ?
 *
 * Traduction littérale de « jamais deux fois le même exercice deux jours de
 * suite » (F6). La comparaison porte sur des journées civiles et non sur
 * quarante-huit heures : un exercice fait hier à 9 h reste écarté aujourd'hui
 * à 18 h, ce qui est bien ce que la phrase veut dire.
 */
export function doneWithinTwoDays(lastCompletedAt: Date | undefined, now: Date) {
  if (!lastCompletedAt) return false

  const today = dayKey(now)

  return dayKey(lastCompletedAt) === today || dayKey(lastCompletedAt) === previousDayKey(today)
}

/** Exercices proposables : famille autorisée, et pas déjà faits ces deux jours. */
export function candidatePool(input: RecommendInput) {
  const allowed = allowedTypes(input.preferences.favoriteTypes)

  return input.catalogue.filter(exercise =>
    (allowed === null || allowed.has(exercise.type))
    && !doneWithinTwoDays(input.activity.get(exercise.id)?.lastCompletedAt, input.now),
  )
}

/**
 * Choisit un exercice dans le vivier, pour une règle donnée.
 *
 * Trois cercles concentriques, du plus précis au plus large : la famille **et**
 * la durée voulues, puis la famille seule, puis n'importe quel exercice
 * autorisé. Le repli existe parce que le profil peut avoir écarté la famille que
 * la règle privilégie — proposer un étirement à qui n'a coché que la méditation
 * serait ignorer une préférence explicite, et ne rien proposer serait pire.
 */
function pick(pool: RecommendableExercise[], rule: Rule, activity: RecommendInput['activity']) {
  const sameFamily = rule.type ? pool.filter(exercise => exercise.type === rule.type) : pool
  const exact = rule.maxMin
    ? sameFamily.filter(exercise => exercise.durationMin <= rule.maxMin!)
    : sameFamily

  const candidates = exact.length ? exact : sameFamily.length ? sameFamily : pool

  // Le moins récemment fait d'abord, jamais fait comptant comme le plus ancien.
  // C'est ce qui fait tourner les suggestions sans tirage au sort : le moteur
  // reste déterministe, et l'usage lui-même produit la variété.
  return [...candidates].sort((a, b) => {
    const lastA = activity.get(a.id)?.lastCompletedAt?.getTime() ?? 0
    const lastB = activity.get(b.id)?.lastCompletedAt?.getTime() ?? 0

    return lastA - lastB || a.durationMin - b.durationMin || a.title.localeCompare(b.title, 'fr')
  })[0]!
}

/**
 * La recommandation du moment, ou `null` s'il n'y a rien à proposer.
 *
 * `null` se produit quand le profil restreint les familles **et** que tous les
 * exercices restants ont été faits ces deux derniers jours. C'est rare et c'est
 * une bonne nouvelle : l'interface le dit ainsi plutôt que de contredire une des
 * deux règles de F6 pour remplir la carte à tout prix.
 */
export function recommend(input: RecommendInput): Recommendation | null {
  const pool = candidatePool(input)

  // Le vivier ne dépend d'aucune règle : s'il est vide, aucune règle n'y
  // trouvera d'exercice, et il est inutile de les parcourir.
  if (!pool.length) return null

  for (const rule of RULES) {
    const reason = rule.match(input)

    if (reason === null) continue

    return { exercise: pick(pool, rule, input.activity), rule: rule.code, reason }
  }

  // La dernière règle s'applique toujours : ce retour n'existe que pour le
  // vérificateur de types.
  return null
}
