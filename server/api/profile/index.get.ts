/**
 * CU-06 — état complet de l'écran de profil : identité, rattachement, préférences.
 *
 * Une seule route pour un seul écran : l'identité et les préférences sont deux
 * ressources distinctes en écriture, mais elles s'affichent ensemble et n'ont
 * aucune raison de coûter deux allers-retours.
 *
 * Le compte est relu en base plutôt que recopié depuis le cookie de session :
 * l'entreprise, l'équipe et le rôle peuvent avoir changé depuis la connexion,
 * et c'est précisément l'écran où l'utilisateur vient vérifier ce qui est
 * enregistré sur lui.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      company: { select: { name: true } },
      team: { select: { name: true } },
    },
  })

  // Même traitement que /api/auth/me : le cookie reste valide jusqu'à son
  // échéance, y compris après une suppression de compte (CU-05.2).
  if (!account) {
    await clearUserSession(event)
    throw createError({
      statusCode: 401,
      statusMessage: 'Ce compte n\'existe plus.',
      data: { code: 'account_gone' },
    })
  }

  return {
    profile: {
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      role: account.role,
      company: account.company.name,
      team: account.team?.name ?? null,
    },
    preferences: await readPreferences(user.id),
  }
})
