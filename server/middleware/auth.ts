/**
 * Protection par défaut de l'API : toute route sous `/api/` exige une session,
 * sauf celles explicitement listées dans `PUBLIC_API_ROUTES`.
 *
 * Le choix du sens compte. Protéger route par route laisse la porte ouverte à
 * l'oubli : une route ajoutée sans garde serait publique sans que personne ne
 * l'ait décidé. Ici l'oubli va dans l'autre sens — une route publique oubliée
 * renvoie 401 et se remarque immédiatement, au lieu de fuiter en silence.
 *
 * Le contrôle de **rôle** n'est pas fait ici : il dépend de la route et parfois
 * de ses paramètres (un manager n'accède qu'à sa propre équipe). Il revient à
 * `requireRole`, appelé dans le gestionnaire concerné.
 */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (!path.startsWith('/api/')) return
  if (isPublicApiRoute(path)) return

  await requireAuth(event)
})
