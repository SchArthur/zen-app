import type { H3Event } from 'h3'
import { ConsentType } from '../../../lib/generated/prisma/enums.js'

/**
 * CU-02 — Créer un compte, premier temps du double opt-in.
 *
 * Le compte est créé **inactif** (`emailVerifiedAt` à null) et le reste tant que
 * le lien envoyé par courriel n'a pas été suivi. La réponse est volontairement
 * identique que l'adresse soit libre, déjà inscrite ou déjà confirmée : sans
 * cela, ce point d'entrée deviendrait un moyen d'énumérer les comptes existants.
 *
 * TODO (J9) : limitation de débit sur /api/auth/* via nuxt-security, sans quoi
 * ce point d'entrée peut servir à inonder une boîte de réception.
 */
export default defineEventHandler(async (event) => {
  const { email, password, firstName, lastName } = await validateBody(event, registerSchema)

  // Le hachage est calculé avant toute distinction de cas : il coûte quelques
  // centaines de millisecondes, et ne les faire payer qu'aux adresses inconnues
  // trahirait l'existence d'un compte par le seul temps de réponse.
  const passwordHash = await hashPassword(password)

  const company = await prisma.company.findUnique({
    where: { emailDomain: emailDomain(email) },
    select: { id: true },
  })

  // Refus explicite : il porte sur le domaine, jamais sur une adresse précise.
  // Il ne révèle donc aucun compte, et évite qu'une faute de frappe dans le
  // domaine se solde par un courriel qui n'arrivera jamais.
  if (!company) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Données invalides',
      data: {
        errors: {
          email: ['Cette adresse n\'appartient à aucune entreprise cliente de ZenTime.'],
        },
      },
    })
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
  })

  if (!existing) {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        companyId: company.id,
        // Le rôle reste COLLABORATOR : manager et RH sont attribués par
        // l'entreprise, jamais choisis par l'inscrit.
        consents: { create: { type: ConsentType.TERMS, granted: true } },
      },
      select: { id: true, email: true, firstName: true },
    })

    await notify(event, () => issueEmailVerification(event, user))
  }
  else if (existing.emailVerifiedAt) {
    // Alternative A1 — le compte existe et il est actif. Le visiteur reçoit la
    // réponse du cas nominal ; c'est le titulaire qui est informé de la tentative.
    await notify(event, () =>
      sendMail(event, {
        to: existing.email,
        ...existingAccountEmail({ firstName: existing.firstName, loginUrl: loginUrl(event) }),
      }))
  }
  else {
    // Inscription reprise sur un compte jamais confirmé : nouveau lien, et le
    // précédent est invalidé. Le mot de passe fourni n'écrase pas l'ancien tant
    // que l'adresse n'est pas prouvée.
    await notify(event, () => issueEmailVerification(event, existing))
  }

  return {
    status: 'pending',
    message: `Si cette adresse peut être inscrite, un lien de confirmation vient d'être envoyé. Il expire dans ${EMAIL_VERIFICATION_TTL_HOURS} heures.`,
  }
})

/**
 * Exception E1 — service de messagerie indisponible. Le compte reste inactif,
 * l'échec est journalisé et l'utilisateur peut demander un nouvel envoi. La
 * réponse ne change pas : une erreur visible ici indiquerait qu'un envoi a
 * effectivement été tenté, donc qu'un compte est concerné.
 */
async function notify(event: H3Event, task: () => Promise<void>) {
  try {
    await task()
  }
  catch (error) {
    console.error('[auth/register] envoi du courriel impossible', error)
  }
}
