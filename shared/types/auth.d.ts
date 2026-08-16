import type { Role } from '../../lib/generated/prisma/enums.js'

/**
 * Contenu de la session, scellé dans un cookie httpOnly par nuxt-auth-utils.
 *
 * Volontairement réduit à ce qui sert à afficher l'interface et à orienter les
 * contrôles d'accès : ni condensat de mot de passe, ni donnée de bien-être. Le
 * cookie est signé et chiffré, mais il voyage à chaque requête — tout ce qui y
 * figure est une donnée de plus exposée en cas de vol de poste.
 */
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    firstName: string
    lastName: string
    role: Role
    companyId: string
    teamId: string | null
  }

  interface UserSession {
    loggedInAt: string
  }
}

export {}
