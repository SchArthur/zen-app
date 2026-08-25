/**
 * CU-04 — état du consentement de qui demande.
 *
 * Route **publique** : c'est elle qui dit au bandeau s'il doit s'afficher, et il
 * s'affiche d'abord pour des visiteurs. Elle ne révèle rien — elle décrit les
 * choix de l'appelant, résolus depuis sa session ou depuis son propre cookie.
 *
 * Elle ne dépose aucun cookie, jamais. Poser un identifiant à la simple lecture
 * de l'état reviendrait à déposer un traceur pour demander l'autorisation d'en
 * déposer un.
 */
export default defineEventHandler(async (event) => {
  return await consentState(await readConsentSubject(event))
})
