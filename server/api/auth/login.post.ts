import { randomBytes } from 'node:crypto'

/**
 * CU-03 — S'authentifier.
 *
 * Deuxième temps du double opt-in : une adresse non confirmée ne donne accès à
 * rien, conformément à la règle de CU-02 « aucune connexion possible avant
 * confirmation ».
 *
 * TODO (J9) : limitation de débit sur /api/auth/* via nuxt-security. Sans elle,
 * ce point d'entrée autorise le bourrage d'identifiants.
 */
export default defineEventHandler(async (event) => {
  const { email, password } = await validateBody(event, loginSchema)

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      companyId: true,
      teamId: true,
      passwordHash: true,
      emailVerifiedAt: true,
    },
  })

  // Une adresse inconnue doit coûter le même temps qu'un mot de passe erroné :
  // sans cette vérification à vide, l'écart de durée de réponse suffirait à
  // énumérer les comptes existants.
  const passwordMatches = await verifyPassword(user?.passwordHash ?? await decoyHash(), password)

  if (!user || !passwordMatches) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Adresse email ou mot de passe incorrect.',
      data: { code: 'invalid_credentials' },
    })
  }

  // Contrôle placé **après** la vérification du mot de passe : annoncer plus tôt
  // qu'un compte est en attente de confirmation révélerait son existence à qui
  // ne connaît pas le mot de passe.
  if (!user.emailVerifiedAt) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Votre adresse n\'est pas encore confirmée. Consultez le lien reçu par email.',
      data: { code: 'email_not_verified' },
    })
  }

  // Le condensat est réécrit si les paramètres de hachage ont durci depuis la
  // création du compte : c'est le seul moment où le mot de passe en clair est
  // disponible pour le recalculer.
  if (passwordNeedsReHash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    })
  }

  // `replaceUserSession` et non `setUserSession` : la seconde fusionnerait avec
  // le contenu d'une session précédente, ce qui laisserait survivre les données
  // du compte précédemment connecté sur le même navigateur.
  await replaceUserSession(event, {
    user: toSessionUser(user),
    loggedInAt: new Date().toISOString(),
  })

  return { user: toSessionUser(user) }
})

// Condensat jetable, calculé une seule fois par processus, servant uniquement à
// faire payer le coût du hachage aux tentatives portant sur une adresse inconnue.
let decoy: string | undefined
async function decoyHash() {
  decoy ??= await hashPassword(randomBytes(24).toString('hex'))
  return decoy
}
