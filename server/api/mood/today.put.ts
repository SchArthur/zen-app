/**
 * CU-09 — enregistrer, ou corriger, la déclaration du jour.
 *
 * La déclaration du jour est une ressource **unique** par collaborateur et par
 * journée : sa journée est celle du serveur, son auteur celui de la session. Son
 * identifiant n'a donc pas à figurer dans l'URL, et il n'y a aucun identifiant à
 * deviner pour écrire à la place de quelqu'un d'autre — même raisonnement que
 * `PATCH /api/breaks/current`.
 *
 * PUT et non PATCH : le formulaire envoie les deux échelles ensemble, et
 * l'alternative A1 de CU-09 dit que la correction **remplace** la déclaration.
 * C'est exactement la sémantique du verbe.
 *
 * Pas de route de suppression : retirer une déclaration passée relève du droit à
 * l'effacement (CU-05), qui porte sur l'ensemble des données du compte et suit
 * sa propre procédure.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  // Le consentement est vérifié **avant** la validation du corps : un
  // consentement retiré doit produire un refus, pas une liste d'erreurs de
  // saisie qui laisserait croire que la déclaration est encore attendue.
  await assertWellbeingConsent(user.id)

  const values = await validateBody(event, moodCheckInSchema)

  return { today: await writeTodayCheckIn(user.id, values, new Date()) }
})
