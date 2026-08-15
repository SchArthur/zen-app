import { z } from 'zod'

// CU-02, règle E2 : chaque critère non respecté doit être signalé nommément.
// Les messages sont donc portés par le schéma, pas par le gestionnaire de route.
export const passwordSchema = z
  .string('Mot de passe requis.')
  .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
  .max(128, 'Le mot de passe ne doit pas dépasser 128 caractères.')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule.')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule.')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre.')

// Normalisation avant validation : une adresse saisie « Alice@Nova.fr » avec une
// espace de copier-coller doit être acceptée, et stockée en minuscules — sans quoi
// l'unicité de User.email et la recherche du domaine deviennent sensibles à la casse.
export const emailSchema = z
  .string('Adresse email requise.')
  .trim()
  .toLowerCase()
  .max(180, 'Adresse email trop longue.')
  .pipe(z.email('Adresse email invalide.'))

const nameSchema = (label: string) =>
  z
    .string(`${label} requis.`)
    .trim()
    .min(1, `${label} requis.`)
    .max(80, `${label} trop long (80 caractères maximum).`)

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema('Prénom'),
  lastName: nameSchema('Nom'),
  // Trace du consentement aux CGU : refuser l'inscription sans acceptation
  // explicite, et enregistrer cette acceptation dans la table Consent.
  acceptTerms: z.literal(true, 'Les conditions d\'utilisation doivent être acceptées.'),
})

export const resendVerificationSchema = z.object({
  email: emailSchema,
})

export const verificationTokenSchema = z.object({
  token: z.string('Jeton de confirmation manquant.').min(1, 'Jeton de confirmation manquant.'),
})

/** Domaine d'une adresse déjà validée par emailSchema. */
export function emailDomain(email: string) {
  return email.slice(email.lastIndexOf('@') + 1)
}
