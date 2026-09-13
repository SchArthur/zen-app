/**
 * CU-13 — Consulter les indicateurs de l'entreprise.
 *
 * Même chaîne que la vue d'équipe, au périmètre près : rôle exigé, périmètre
 * déduit du compte, seuil vérifié avant calcul, consultation journalisée.
 * Réutiliser `readAggregates` plutôt que réécrire l'agrégation est ce qui
 * garantit que le seuil d'anonymat s'applique **aussi** ici — c'est la relation
 * `«include»` de CU-13 vers CU-12.1, et une entreprise de quatre personnes n'a
 * pas plus droit à des moyennes qu'une équipe de quatre.
 *
 * La comparaison entre deux périodes, exigée par F9, est celle que
 * `readAggregates` calcule déjà : la période demandée face à la précédente.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireRole(event, 'HR')
  const { period } = validateQuery(event, statsQuerySchema)

  const scope = await readCompanyScope(user.id)

  if (!scope) {
    await recordAccess(user, ACCESS_ACTIONS.companyView, accessTarget('company', 'aucune', period))

    throw createError({
      statusCode: 403,
      statusMessage: 'Votre compte n\'est rattaché à aucune entreprise.',
      data: { code: 'no_company' },
    })
  }

  const result = await readAggregates(scope.memberIds, period, new Date())

  await recordAccess(user, ACCESS_ACTIONS.companyView, accessTarget('company', scope.id, period))

  return { company: { name: scope.name }, period, days: PERIODS[period], ...result }
})
