import type { User } from '#auth-utils'
import type { Role } from '../../lib/generated/prisma/enums.js'

interface StoredUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  companyId: string
  teamId: string | null
  passwordHash?: string
}

/**
 * Projection d'un utilisateur de la base vers la session.
 *
 * Point de passage **unique** : tout champ ajouté au modèle User n'entre dans le
 * cookie que s'il est nommé ici. Un `select` oublié dans une route ne peut donc
 * pas y faire fuiter un condensat de mot de passe.
 *
 * Le rôle est recopié dans la session : un changement de rôle ne prend effet
 * qu'à la reconnexion. Les vues d'encadrement, elles, revérifient le rattachement
 * en base avant de calculer quoi que ce soit (voir CU-12).
 */
export function toSessionUser(user: StoredUser): User {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    companyId: user.companyId,
    teamId: user.teamId,
  }
}
