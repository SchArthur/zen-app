/**
 * CU-08 — la fiche détaillée d'un exercice : le déroulé pas à pas exigé par F4.
 *
 * L'exercice est désigné par son identifiant lisible (`souffle-4-7-8`) et non
 * par sa clé technique : l'adresse d'une fiche se partage entre collègues, elle
 * doit se lire. `slug` est unique en base, c'est donc bien un identifiant.
 *
 * Aucun contrôle de rôle : le catalogue est ouvert aux trois rôles (matrice des
 * accès, CU-08). Il reste derrière l'authentification — le contenu éditorial
 * fait partie de ce que paie l'entreprise cliente.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const exercise = await readExercise(getRouterParam(event, 'slug'))

  if (!exercise) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Cet exercice n\'existe pas ou n\'est plus proposé.',
      data: { code: 'exercise_not_found' },
    })
  }

  const now = new Date()
  const activity = await readActivity(user.id, now)

  // Trois exercices de la même famille, les plus courts d'abord : la fiche doit
  // pouvoir se refermer sur une autre proposition plutôt que sur un cul-de-sac.
  const related = await prisma.exercise.findMany({
    where: { ...exerciseFilter({ type: exercise.type }), id: { not: exercise.id } },
    orderBy: [{ durationMin: 'asc' }, { title: 'asc' }],
    take: 3,
    select: { slug: true, title: true, durationMin: true, type: true },
  })

  return {
    exercise,
    activity: activity.byExercise.get(exercise.id) ?? null,
    windowDays: ACTIVITY_WINDOW_DAYS,
    related,
  }
})
