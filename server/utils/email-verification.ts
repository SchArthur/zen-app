import type { H3Event } from 'h3'
import { TokenType } from '../../lib/generated/prisma/enums.js'

interface Recipient {
  id: string
  email: string
  firstName: string
}

function siteUrl(event: H3Event) {
  return useRuntimeConfig(event).public.appUrl.replace(/\/+$/, '')
}

/**
 * Lien porté par le courriel de confirmation.
 *
 * Provisoire : tant que l'écran `/confirmer-email` n'existe pas, le lien pointe
 * directement sur l'API. Cet écran devra faire un POST, qu'un antivirus de
 * messagerie ne déclenche pas — alors qu'il suit volontiers un lien en GET, ce
 * qui consommerait le jeton avant même que le destinataire ait ouvert le message.
 */
function confirmationUrl(event: H3Event, token: string) {
  return `${siteUrl(event)}/api/auth/verify-email?token=${encodeURIComponent(token)}`
}

export function loginUrl(event: H3Event) {
  return `${siteUrl(event)}/connexion`
}

/**
 * CU-02.1 — émet un lien de confirmation à durée limitée et l'envoie.
 *
 * Tout lien précédemment émis et non consommé est supprimé (alternative A2) :
 * un seul lien est valide à la fois, celui du dernier envoi.
 */
export async function issueEmailVerification(event: H3Event, user: Recipient) {
  const token = generateVerificationToken()

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: { userId: user.id, type: TokenType.EMAIL_VERIFICATION, usedAt: null },
    }),
    prisma.verificationToken.create({
      data: {
        tokenHash: hashVerificationToken(token),
        type: TokenType.EMAIL_VERIFICATION,
        expiresAt: verificationTokenExpiry(),
        userId: user.id,
      },
    }),
  ])

  await sendMail(event, {
    to: user.email,
    ...verificationEmail({
      firstName: user.firstName,
      url: confirmationUrl(event, token),
      ttlHours: EMAIL_VERIFICATION_TTL_HOURS,
    }),
  })
}

export type EmailVerificationOutcome = 'verified' | 'already_verified' | 'expired' | 'invalid'

/**
 * Traduction du résultat en réponse HTTP, partagée par les deux points d'entrée
 * de confirmation pour qu'ils ne puissent pas diverger.
 */
export function emailVerificationResponse(outcome: EmailVerificationOutcome) {
  if (outcome === 'expired') {
    // 410 Gone : le lien a existé et n'existe plus. Le code permet à l'appelant
    // de proposer un nouvel envoi (alternative A2).
    throw createError({
      statusCode: 410,
      statusMessage: 'Ce lien de confirmation a expiré. Demandez-en un nouveau.',
      data: { code: 'expired_token' },
    })
  }

  if (outcome === 'invalid') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ce lien de confirmation est invalide.',
      data: { code: 'invalid_token' },
    })
  }

  return {
    status: outcome,
    message: outcome === 'verified'
      ? 'Votre adresse est confirmée : votre compte est actif, vous pouvez vous connecter.'
      : 'Cette adresse a déjà été confirmée. Vous pouvez vous connecter.',
  }
}

/**
 * CU-02, étape 6 — active le compte si le jeton présenté est valide.
 * Le jeton est consommé : il ne peut pas servir deux fois.
 */
export async function consumeEmailVerification(token: string): Promise<EmailVerificationOutcome> {
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashVerificationToken(token) },
    include: { user: { select: { emailVerifiedAt: true } } },
  })

  if (!record || record.type !== TokenType.EMAIL_VERIFICATION) return 'invalid'

  // Vérifié avant l'état du jeton : un second clic sur le même lien, ou un lien
  // périmé alors que le compte est déjà actif, méritent un message rassurant
  // plutôt qu'une erreur.
  if (record.user.emailVerifiedAt) return 'already_verified'
  if (record.usedAt) return 'invalid'
  if (record.expiresAt <= new Date()) return 'expired'

  const now = new Date()
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } }),
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: now } }),
  ])

  return 'verified'
}
