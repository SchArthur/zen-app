/**
 * CU-08.1 — déclarer un exercice réalisé.
 *
 * Aucune donnée en entrée : l'exercice est dans l'URL, l'auteur dans la session,
 * l'heure est celle du serveur. Laisser le navigateur transmettre l'horodatage
 * rendrait la réalisation déclarative, alors qu'elle alimente les agrégats
 * d'équipe — même principe que le démarrage d'une pause.
 *
 * La réalisation est un événement, jamais un état : on ne « dé-déclare » pas un
 * exercice fait. Il n'y a donc ni DELETE ni PATCH sur cette ressource.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const exercise = await readExercise(getRouterParam(event, 'slug'))

  // Un exercice retiré du catalogue ne peut plus être déclaré : la contrainte
  // `Restrict` sur ExerciseLog garantit qu'il ne disparaîtra pas sous les
  // réalisations déjà enregistrées (RG12), pas qu'on puisse en ajouter.
  if (!exercise) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Cet exercice n\'existe pas ou n\'est plus proposé.',
      data: { code: 'exercise_not_found' },
    })
  }

  const now = new Date()

  const latest = await prisma.exerciseLog.findFirst({
    where: { userId: user.id, exerciseId: exercise.id },
    orderBy: { completedAt: 'desc' },
    select: { id: true, completedAt: true },
  })

  // Double clic, retour arrière, second onglet : la même réalisation arrive deux
  // fois. Elle n'est comptée qu'une, et la réponse reste un succès — l'utilisateur
  // n'a rien fait de mal, il n'a aucune raison de voir une erreur.
  if (isRepeatDeclaration(latest?.completedAt ?? null, exercise.durationMin, now)) {
    setResponseStatus(event, 200)

    return { log: latest, repeated: true }
  }

  const log = await prisma.exerciseLog.create({
    data: { userId: user.id, exerciseId: exercise.id },
    select: { id: true, completedAt: true },
  })

  setResponseStatus(event, 201)

  return { log, repeated: false }
})
