/**
 * CU-08 — le catalogue d'exercices, filtré par type et par durée (F4).
 *
 * Une seule route pour un seul écran, comme `/api/profile` et `/api/breaks` : la
 * liste, le décompte de chaque famille et ce que le collaborateur a déjà fait
 * s'affichent ensemble et n'ont aucune raison de coûter trois allers-retours.
 *
 * Le catalogue est le même pour tout le monde — c'est du contenu éditorial, pas
 * une donnée personnelle. Ce qui est personnel, c'est ce qui vient s'y greffer :
 * les réalisations et les types préférés, tous deux lus pour le seul compte
 * connecté.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const query = validateQuery(event, exercisesQuerySchema)

  const now = new Date()

  const [exercises, activity, preferences] = await Promise.all([
    readCatalogue(query),
    readActivity(user.id, now),
    readPreferences(user.id),
  ])

  // Décompte par famille, filtre de durée appliqué mais filtre de type ignoré :
  // les pastilles annoncent ce que donnerait un changement de famille à durée
  // constante. Les calculer sur la requête complète afficherait zéro partout
  // sauf sur la famille déjà sélectionnée.
  const countsByType = await prisma.exercise.groupBy({
    by: ['type'],
    where: exerciseFilter({ maxMin: query.maxMin }),
    _count: { _all: true },
  })

  return {
    exercises: exercises.map(exercise => ({
      ...exercise,
      activity: activity.byExercise.get(exercise.id) ?? null,
    })),
    countsByType: Object.fromEntries(countsByType.map(row => [row.type, row._count._all])),
    doneToday: activity.todayCount,
    windowDays: ACTIVITY_WINDOW_DAYS,
    // Les types cochés dans le profil (F2). L'écran les met en avant ; il ne
    // masque pas les autres — le catalogue reste un catalogue, et une préférence
    // déclarée un jour ne doit pas enfermer.
    favoriteTypes: preferences.favoriteTypes,
  }
})
