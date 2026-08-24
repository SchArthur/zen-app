/**
 * Fuseau de référence de l'application.
 *
 * Le serveur découpe l'historique en journées avec ce fuseau, le navigateur
 * affiche les heures avec le même : sans valeur commune, une pause de 23 h 30
 * changerait de jour entre le rendu serveur et l'hydratation, et Vue signalerait
 * un écart de rendu.
 *
 * Fixé et non déduit de l'horloge de chacun : l'application s'adresse à des
 * entreprises françaises (voir `docs/infrastructure.md`), la journée de travail
 * est donc celle de Paris. Un déploiement hors de France ferait de ce réglage
 * une donnée d'entreprise ; c'est aujourd'hui hors périmètre.
 */
export const APP_TIME_ZONE = 'Europe/Paris'

// `formatToParts` plutôt qu'une locale qui produirait déjà « AAAA-MM-JJ » : la
// clé est assemblée explicitement, elle ne dépend pas des données de locale
// embarquées par la plateforme.
const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Journée locale d'un instant, au format `AAAA-MM-JJ`.
 *
 * C'est l'unité de regroupement de tout ce que l'application compte par jour :
 * les pauses (F3), les exercices réalisés (F4) et la déclaration d'humeur (F5),
 * qui est unique par journée civile. Une seule définition pour les trois, sans
 * quoi une pause de 23 h 30 et un exercice de 23 h 40 pourraient être rangés
 * dans deux journées différentes.
 */
export function dayKey(date: Date) {
  const parts = new Map(dayFormatter.formatToParts(date).map(part => [part.type, part.value]))

  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`
}

/**
 * Borne basse d'une requête d'historique portant sur `days` journées.
 *
 * Un jour de marge : la fenêtre est ensuite découpée en journées locales, dont
 * les bornes ne coïncident pas avec « il y a N × 24 h ». Les enregistrements en
 * trop sont écartés au regroupement, sur les clés de `dayKeysBack`.
 */
export function historySince(days: number, now: Date) {
  return new Date(now.getTime() - (days + 1) * 86_400_000)
}

/**
 * Journée civile précédant `key`.
 *
 * Arithmétique en UTC sur une date sans heure : retirer 24 heures à un instant
 * sauterait ou répéterait un jour lors des changements d'heure.
 */
export function previousDayKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))

  date.setUTCDate(date.getUTCDate() - 1)

  return date.toISOString().slice(0, 10)
}

/**
 * Les `days` dernières journées civiles, de la plus récente à la plus ancienne.
 *
 * C'est la définition de la fenêtre d'historique, partagée par les pauses et par
 * les déclarations d'humeur : « les trente derniers jours » veut dire trente
 * journées de calendrier, et non trente fois vingt-quatre heures.
 */
export function dayKeysBack(days: number, now: Date) {
  const keys: string[] = []
  let key = dayKey(now)

  for (let index = 0; index < days; index++) {
    keys.push(key)
    key = previousDayKey(key)
  }

  return keys
}
