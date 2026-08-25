/**
 * CU-05.2 — Supprimer son compte (article 17).
 *
 * En autonomie, sans passer par un tiers : c'est l'exigence de F10, et c'est
 * aussi ce qui rend crédible la promesse faite à l'inscription. Un droit à
 * l'effacement qui suppose d'écrire à une adresse et d'attendre n'est pas
 * démontrable en soutenance.
 *
 * L'effacement est **immédiat et définitif** — pas de corbeille, pas de délai de
 * grâce. Une suppression différée serait une conservation de plus à déclarer, à
 * justifier et à purger ; l'article 17 n'en demande pas tant.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { password } = await validateBody(event, deleteAccountSchema)

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  })

  if (!account) {
    await clearUserSession(event)
    throw createError({
      statusCode: 401,
      statusMessage: 'Ce compte n\'existe plus.',
      data: { code: 'account_gone' },
    })
  }

  if (!await verifyPassword(account.passwordHash, password)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Mot de passe incorrect.',
      data: { code: 'invalid_password' },
    })
  }

  await erasePersonalData(user.id)

  // La session est scellée et autoportante : sans cet appel, le cookie resterait
  // valide jusqu'à son échéance et l'application afficherait encore un compte
  // connecté. `assertAccountExists` finirait par le rattraper — mais après une
  // requête inutile et un message d'erreur, là où il faut un adieu propre.
  await clearUserSession(event)

  return { status: 'deleted' }
})
