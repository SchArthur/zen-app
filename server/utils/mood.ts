import { dayKey, dayKeysBack, historySince } from '../../shared/utils/time'
import type { MoodCheckInInput } from './mood-schemas'

/**
 * CU-09 — Déclarer son humeur et son stress.
 *
 * Tout ce qui touche à la **journée** de la déclaration est ici. C'est le point
 * délicat du cas : `MoodCheckIn.date` est de type `date`, sans heure, et la
 * journée de référence est celle de l'application — Europe/Paris — et non celle
 * du serveur, qui tourne en UTC (`docs/modele-de-donnees.md`, §9).
 */

/**
 * Estampille de journée civile, telle qu'elle est stockée.
 *
 * Une colonne `date` n'a pas d'heure, mais elle transite en JavaScript par un
 * `Date`, qui en a une. La convention est celle du jeu de démonstration comme du
 * modèle : minuit **UTC** de la journée locale. Deux instants de la même journée
 * parisienne produisent donc la même estampille, et c'est ce qui fait tenir la
 * contrainte d'unicité `(userId, date)` — donc la règle « une déclaration par
 * jour » (RG9).
 *
 * Écrire `new Date()` tel quel casserait les deux : entre minuit et 2 h du matin
 * à Paris en été, la journée UTC est encore celle de la veille, et la
 * déclaration du jour viendrait écraser celle d'hier.
 */
export function moodDay(now: Date) {
  return new Date(`${dayKey(now)}T00:00:00.000Z`)
}

/** Champs exposés hors du serveur. L'identifiant technique reste en base. */
const checkInSelect = {
  date: true,
  mood: true,
  stress: true,
} as const

interface CheckInRow {
  date: Date
  mood: number
  stress: number
}

/** Une déclaration, telle que la lit l'interface : la journée en clair. */
function toCheckIn(row: CheckInRow) {
  return {
    // `date` est déjà minuit UTC de la journée locale : la clé se lit
    // directement sur la partie ISO, sans repasser par le fuseau — l'y
    // reconvertir décalerait d'un jour vers l'ouest.
    date: row.date.toISOString().slice(0, 10),
    mood: row.mood,
    stress: row.stress,
  }
}

/** Déclaration du jour, ou `null` si elle n'a pas encore été faite. */
export async function readTodayCheckIn(userId: string, now: Date) {
  const row = await prisma.moodCheckIn.findUnique({
    where: { userId_date: { userId, date: moodDay(now) } },
    select: checkInSelect,
  })

  return row ? toCheckIn(row) : null
}

/**
 * Enregistre — ou corrige — la déclaration du jour.
 *
 * `upsert` et non `create` : l'alternative A1 de CU-09 autorise la correction
 * jusqu'à minuit, et précise qu'elle **remplace** la valeur. Aucun historique
 * des corrections n'est conservé, c'est une décision de conception : garder les
 * versions successives d'un ressenti reviendrait à observer quelqu'un en train
 * de changer d'avis sur son propre état.
 */
export async function writeTodayCheckIn(userId: string, values: MoodCheckInInput, now: Date) {
  const date = moodDay(now)

  const row = await prisma.moodCheckIn.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...values },
    update: values,
    select: checkInSelect,
  })

  return toCheckIn(row)
}

/**
 * Déclarations des `days` derniers jours, de la plus ancienne à la plus récente.
 *
 * Les journées sans déclaration sont **absentes**, et non présentes à zéro :
 * c'est l'alternative A2 de CU-09 — ne pas déclarer n'est pas un manquement, la
 * journée est simplement absente des statistiques. Un zéro se lirait comme une
 * humeur au plus bas, ce qui est exactement le contresens à éviter.
 *
 * Ordre chronologique : la série se lit de gauche à droite comme un calendrier.
 */
export async function readCheckInHistory(userId: string, days: number, now: Date) {
  const rows = await prisma.moodCheckIn.findMany({
    // La requête remonte un jour plus loin que la fenêtre demandée ; les
    // journées en trop sont écartées juste après, sur les clés de la fenêtre.
    // Une comparaison de dates seule ne suffit pas : « les quatorze derniers
    // jours » désigne quatorze journées de calendrier, pas 14 × 24 heures.
    where: { userId, date: { gte: moodDay(historySince(days, now)) } },
    orderBy: { date: 'asc' },
    select: checkInSelect,
  })

  const window = new Set(dayKeysBack(days, now))

  return rows.map(toCheckIn).filter(checkIn => window.has(checkIn.date))
}
