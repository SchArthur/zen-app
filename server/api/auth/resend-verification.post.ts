/**
 * CU-02, alternative A2 — le lien a expiré, ou n'est jamais arrivé.
 *
 * Un nouveau lien est émis et le précédent invalidé. Comme pour l'inscription,
 * la réponse est la même dans tous les cas : adresse inconnue, compte déjà
 * confirmé ou nouvel envoi effectif.
 *
 * TODO (J9) : limitation de débit sur /api/auth/* via nuxt-security.
 */
export default defineEventHandler(async (event) => {
  const { email } = await validateBody(event, resendVerificationSchema)

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
  })

  if (user && !user.emailVerifiedAt) {
    try {
      await issueEmailVerification(event, user)
    }
    catch (error) {
      // Exception E1 : l'échec est journalisé, la réponse reste inchangée.
      console.error('[auth/resend-verification] envoi du courriel impossible', error)
    }
  }

  return {
    status: 'pending',
    message: `Si cette adresse correspond à un compte en attente de confirmation, un nouveau lien vient d'être envoyé. Il expire dans ${EMAIL_VERIFICATION_TTL_HOURS} heures.`,
  }
})
