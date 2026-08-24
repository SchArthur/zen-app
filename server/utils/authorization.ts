// `createError` est importé explicitement plutôt que par auto-import : c'est ce
// qui rend `assertRole` vérifiable par un test unitaire, hors du contexte Nitro.
import { createError } from 'h3'
import type { H3Event } from 'h3'
import type { User, UserSessionRequired } from '#auth-utils'
import type { Role } from '../../lib/generated/prisma/enums.js'

/**
 * Seules routes de l'API accessibles sans session. Toute route absente de cette
 * liste est protégée — y compris celles qui n'existent pas encore.
 *
 * Cette liste est le pendant exécutable de la colonne « Visiteur » de la matrice
 * des accès (docs/cas-utilisation.md, §6) : l'ajouter ici est une décision, pas
 * un effet de bord d'un fichier posé dans `server/api/`.
 */
export const PUBLIC_API_ROUTES = [
  '/api/auth/register',
  '/api/auth/login',
  // Idempotente : se déconnecter avec une session expirée doit réussir.
  '/api/auth/logout',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
] as const

export function isPublicApiRoute(path: string) {
  // La chaîne de requête ne fait pas partie de l'identité de la route :
  // `/api/auth/verify-email?token=…` est la même route que sans jeton.
  const route = path.split('?')[0]!.replace(/\/+$/, '') || '/'

  // Routes internes des modules Nuxt (`/api/_auth/session` notamment, que le
  // composable useUserSession interroge). Nos propres routes ne commencent
  // jamais par un tiret bas.
  if (route.startsWith('/api/_')) return true

  return PUBLIC_API_ROUTES.includes(route as typeof PUBLIC_API_ROUTES[number])
}

/**
 * Refus d'accès par rôle. Le message ne précise pas le rôle attendu : l'indiquer
 * renseignerait sur l'organisation interne de l'entreprise.
 */
export function assertRole(user: User, roles: readonly Role[]) {
  if (!roles.includes(user.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Vous n\'avez pas accès à cette ressource.',
      data: { code: 'forbidden' },
    })
  }
}

/** Exige une session ouverte. Équivalent serveur du middleware `auth`. */
export async function requireAuth(event: H3Event): Promise<UserSessionRequired> {
  return await requireUserSession(event, { message: 'Authentification requise.' })
}

/**
 * Exige que le compte de la session existe encore.
 *
 * Le cookie de session est scellé et autoportant : il reste valide jusqu'à son
 * échéance, y compris après la suppression du compte (CU-05.2). Sans ce
 * contrôle, chaque route découvre le problème à sa manière — `/api/profile`
 * renvoyait proprement 401, tandis que toute route lisant les préférences
 * échouait en 500, l'`upsert` de `readPreferences` violant la clé étrangère vers
 * un utilisateur disparu.
 *
 * Le contrôle est donc fait **une fois**, dans la barrière globale, plutôt que
 * répété dans chaque gestionnaire : c'est le même choix que pour
 * `PUBLIC_API_ROUTES` — une route ajoutée demain en hérite sans que personne
 * n'ait à y penser.
 *
 * Il coûte une lecture par requête authentifiée, sur la clé primaire. C'est
 * assumé : les routes concernées en font déjà cinq à sept, et une session qui
 * désigne un compte inexistant n'est pas une session valide.
 */
export async function assertAccountExists(event: H3Event, userId: string) {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })

  if (account) return

  await clearUserSession(event)

  throw createError({
    statusCode: 401,
    statusMessage: 'Ce compte n\'existe plus.',
    data: { code: 'account_gone' },
  })
}

/**
 * Exige une session ouverte **et** l'un des rôles indiqués.
 * Équivalent serveur du middleware `role` : `await requireRole(event, 'MANAGER')`.
 */
export async function requireRole(event: H3Event, ...roles: Role[]): Promise<UserSessionRequired> {
  const session = await requireAuth(event)
  assertRole(session.user, roles)

  return session
}
