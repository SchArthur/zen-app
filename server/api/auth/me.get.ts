/**
 * Session courante. Sert de point de contrôle à l'interface et de garde-fou
 * pour les tests d'accès refusé.
 *
 * Le compte est relu en base plutôt que recopié depuis le cookie : celui-ci
 * reste valide jusqu'à son échéance, y compris après une suppression de compte
 * (CU-05.2). Sans cette relecture, un compte supprimé resterait connecté.
 */
export default defineEventHandler(async (event) => {
  const { user: sessionUser, loggedInAt } = await requireUserSession(event, {
    message: 'Authentification requise.',
  })

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
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

  if (!user) {
    await clearUserSession(event)
    throw createError({
      statusCode: 401,
      statusMessage: 'Ce compte n\'existe plus.',
      data: { code: 'account_gone' },
    })
  }

  return { user: toSessionUser(user), loggedInAt }
})
