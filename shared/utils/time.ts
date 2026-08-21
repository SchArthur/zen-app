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
