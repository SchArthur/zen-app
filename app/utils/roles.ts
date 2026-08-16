import type { Role } from '../../lib/generated/prisma/enums.js'

/**
 * Libellés d'affichage des rôles.
 *
 * Partagés entre la navigation et les pages : deux copies auraient fini par
 * diverger, et l'écart se serait vu à l'écran.
 */
export const roleLabels: Record<Role, string> = {
  COLLABORATOR: 'Collaborateur',
  MANAGER: 'Manager',
  HR: 'Responsable RH',
}
