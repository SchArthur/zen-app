/**
 * CU-06 — corriger son identité.
 *
 * Seuls le prénom et le nom sont modifiables : le rôle et le rattachement à une
 * équipe sont attribués par l'entreprise, l'adresse email sert d'identifiant de
 * connexion (voir updateProfileSchema).
 */
export default defineEventHandler(async (event) => {
  const { user: sessionUser, loggedInAt } = await requireAuth(event)
  const { firstName, lastName } = await validateBody(event, updateProfileSchema)

  const user = await prisma.user.update({
    where: { id: sessionUser.id },
    data: { firstName, lastName },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      companyId: true,
      teamId: true,
    },
  })

  // La session porte le nom affiché dans la navigation. Sans cette réécriture,
  // l'ancien nom resterait à l'écran jusqu'à la prochaine connexion, alors que
  // la base, elle, a bien changé.
  //
  // `loggedInAt` est recopié tel quel : corriger son prénom n'est pas une
  // nouvelle connexion, et la session doit expirer à l'heure prévue.
  await setUserSession(event, { user: toSessionUser(user), loggedInAt })

  return { profile: { firstName: user.firstName, lastName: user.lastName } }
})
