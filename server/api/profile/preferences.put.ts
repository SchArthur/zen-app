/**
 * CU-06 — enregistrer ses préférences.
 *
 * PUT et non PATCH : le formulaire envoie le jeu complet de réglages. Accepter
 * des modifications partielles obligerait à distinguer « type d'exercice retiré »
 * de « champ non transmis », alors que l'écran connaît toujours l'état entier.
 *
 * Aucun contrôle de rôle : les préférences sont personnelles, les trois rôles y
 * ont accès pour eux-mêmes (matrice des accès, CU-06).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const values = await validateBody(event, updatePreferencesSchema)

  return { preferences: await writePreferences(user.id, values) }
})
