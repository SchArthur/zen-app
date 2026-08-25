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
 * La limitation de débit qui protège ce point d'entrée de l'inondation de boîtes
 * de réception n'est pas ici : elle est posée en une fois sur `/api/auth/**`
 * dans `nuxt.config.ts`, avec le seuil et ses raisons.
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
    // Le compte et son consentement aux conditions s'écrivent ensemble ou pas du
    // tout : un compte sans trace d'acceptation serait un compte dont on ne peut
    // pas prouver qu'il a accepté, et l'acceptation est ce qui a permis sa
    // création. Deux écritures et non une composition imbriquée, parce que la
    // seconde a besoin de l'identifiant produit par la première.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          companyId: company.id,
          // Le rôle reste COLLABORATOR : manager et RH sont attribués par
          // l'entreprise, jamais choisis par l'inscrit.
        },
        select: { id: true, email: true, firstName: true },
      })

      await tx.consent.create({
        data: {
          type: ConsentType.TERMS,
          granted: true,
          // Version écrite explicitement, jamais laissée à la valeur par défaut
          // du schéma — écart D5 du modèle de données. Sans elle, le jour où les
          // conditions changent, tous les consentements, anciens comme
          // nouveaux, se déclareraient « v1 » : la preuve de l'article 7.1
          // deviendrait inexploitable sans que rien ne le signale.
          version: CONSENT_POLICY_VERSION,
          userId: created.id,
          // Copie hors clé étrangère, qui survit à la suppression du compte.
          subjectRef: created.id,
        },
        select: { id: true },
      })

      return created
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
