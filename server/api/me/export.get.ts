/**
 * CU-05.1 — Exporter ses données (articles 15 et 20).
 *
 * Aucun paramètre : l'export porte sur le compte de la session, et sur lui
 * seul. Il n'y a donc pas d'identifiant à deviner pour obtenir l'export de
 * quelqu'un d'autre — même raisonnement que `PUT /api/mood/today`.
 *
 * L'export n'est **pas** journalisé dans `AccessLog`. Ce journal a une finalité
 * précise, inscrite au registre : tracer la consultation des données de bien-être
 * **d'autrui**. Y verser l'exercice d'un droit par son titulaire mélangerait
 * deux traitements, et reviendrait à consigner qui s'intéresse à ses propres
 * données.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const now = new Date()
  const payload = await buildPersonalDataExport(user.id, now)

  setResponseHeaders(event, {
    'content-type': 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="${personalDataExportFilename(now)}"`,
    // Le fichier contient des déclarations de ressenti : il n'a rien à faire
    // dans un cache partagé, ni dans celui d'un mandataire.
    'cache-control': 'no-store',
  })

  // Indenté : le fichier est destiné à être ouvert par une personne autant qu'à
  // être relu par un programme, et « aisément réutilisable » (article 20) se
  // perd dans une ligne unique de quarante mille caractères.
  return JSON.stringify(payload, null, 2)
})
