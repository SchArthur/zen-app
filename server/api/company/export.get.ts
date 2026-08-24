/**
 * CU-14 — Exporter les indicateurs.
 *
 * Le contenu du fichier est **exactement** ce que l'écran affiche : les mêmes
 * agrégats, produits par le même appel, donc soumis au même seuil d'anonymat.
 * C'est la raison pour laquelle l'export ne recalcule rien de son côté — un
 * export qui refait ses propres requêtes finit toujours par diverger de l'écran,
 * et c'est par là qu'une donnée individuelle s'échappe.
 *
 * Un périmètre bloqué par le seuil produit un **refus**, pas un fichier vide :
 * un tableur vide se prend pour une absence d'activité, alors qu'il s'agit d'un
 * refus de calculer. La différence compte pour qui prépare un bilan social.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireRole(event, 'HR')
  const { period } = validateQuery(event, statsQuerySchema)

  const scope = await readCompanyScope(user.id)

  if (!scope) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Votre compte n\'est rattaché à aucune entreprise.',
      data: { code: 'no_company' },
    })
  }

  const result = await readAggregates(scope.memberIds, period, new Date())

  if (!result.available) {
    throw createError({
      statusCode: 409,
      statusMessage: `Moins de ${result.threshold} personnes ont déclaré sur cette période : aucun agrégat ne peut être exporté.`,
      data: { code: 'below_anonymity_threshold' },
    })
  }

  await recordAccess(user, ACCESS_ACTIONS.companyExport, accessTarget('company', scope.id, period))

  const csv = toCsv(
    ['Journée', 'Pauses prises', 'Exercices réalisés', 'Humeur moyenne', 'Stress moyen'],
    result.series.map(day => [day.date, day.breaks, day.exercises, day.mood, day.stress]),
  )

  // Le nom porte l'entreprise et la période : un export retrouvé six mois plus
  // tard dans un dossier doit pouvoir se relire sans être rouvert.
  const filename = `zentime-${slugify(scope.name)}-${period}-${new Date().toISOString().slice(0, 10)}.csv`

  setResponseHeaders(event, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    // Un export d'indicateurs de bien-être n'a rien à faire dans un cache
    // partagé, ni dans l'historique d'un mandataire.
    'cache-control': 'no-store',
  })

  return csv
})

/** Nom de fichier sûr : sans accent, sans espace, sans séparateur de chemin. */
function slugify(value: string) {
  return value
    .normalize('NFD')
    // La normalisation NFD ci-dessus détache les accents de leur lettre ; il
    // reste à retirer les marques. `\p{Diacritic}` les nomme, là où une plage
    // de points de code écrite littéralement serait invisible dans le source.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entreprise'
}
