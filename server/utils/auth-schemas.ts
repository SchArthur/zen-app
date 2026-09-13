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

// Exporté : la modification du profil (CU-06) porte sur les mêmes champs et doit
// appliquer les mêmes règles. Deux définitions finiraient par diverger, et un
// prénom accepté à l'inscription serait refusé à la première correction.
export const nameSchema = (label: string) =>
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

// Aucune règle de robustesse à la connexion : elles s'appliquent au choix d'un
// mot de passe, pas à sa saisie. Les exiger ici refuserait un mot de passe
// légitime créé sous des règles antérieures, et renseignerait au passage un
// attaquant sur la forme du mot de passe recherché.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string('Mot de passe requis.').min(1, 'Mot de passe requis.'),
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
