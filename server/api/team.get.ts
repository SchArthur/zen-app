/**
 * CU-12 — Consulter le climat de son équipe.
 *
 * L'ordre des opérations est celui du scénario nominal, et il n'est pas
 * interchangeable :
 *
 * 1. le rôle est exigé ;
 * 2. le périmètre est **déduit** du compte, jamais reçu (voir `readTeamScope`) ;
 * 3. le seuil d'anonymat est vérifié **avant** tout calcul (`readAggregates`) ;
 * 4. la consultation est journalisée avant que la réponse ne parte ;
 * 5. seuls des agrégats sont renvoyés.
 *
 * Ce que cette route ne renvoie jamais, quelle que soit la période demandée :
 * un identifiant, un nom, une valeur individuelle, un classement. La réponse ne
 * contient que des sommes, des moyennes et un effectif.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireRole(event, 'MANAGER')
  const { period } = validateQuery(event, statsQuerySchema)

  const scope = await readTeamScope(user.id)

  // Exception E1 : « équipe non rattachée au manager : accès refusé **et refus
  // journalisé** ». Un journal qui n'enregistre que les succès ne dit rien des
  // tentatives, qui sont pourtant ce qu'on cherche à pouvoir constater.
  if (!scope) {
    await recordAccess(user, ACCESS_ACTIONS.teamDenied, accessTarget('team', 'aucune', period))

    throw createError({
      statusCode: 403,
      statusMessage: 'Vous n\'êtes rattaché à aucune équipe.',
      data: { code: 'no_team' },
    })
  }

  const result = await readAggregates(scope.memberIds, period, new Date())

  await recordAccess(user, ACCESS_ACTIONS.teamView, accessTarget('team', scope.id, period))

  return { team: { name: scope.name }, period, days: PERIODS[period], ...result }
})
