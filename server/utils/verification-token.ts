import { createHash, randomBytes } from 'node:crypto'

/** Durée de validité d'un lien de confirmation d'adresse, en heures. */
export const EMAIL_VERIFICATION_TTL_HOURS = 24

/**
 * Jeton envoyé dans le lien : 256 bits tirés d'un générateur cryptographique,
 * encodés en base64url pour rester intacts dans une URL.
 */
export function generateVerificationToken() {
  return randomBytes(32).toString('base64url')
}

/**
 * Seul le condensat est stocké : une fuite de la table VerificationToken ne
 * permettrait alors d'activer aucun compte. SHA-256 suffit ici — contrairement à
 * un mot de passe, le jeton est aléatoire et non devinable par force brute.
 */
export function hashVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function verificationTokenExpiry(from: Date = new Date()) {
  return new Date(from.getTime() + EMAIL_VERIFICATION_TTL_HOURS * 3600_000)
}
