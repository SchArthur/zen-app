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
 *
 * Le contrôle de **formule d'abonnement**, lui, est fait ici, et pour la raison
 * inverse : il ne dépend que de la route. L'écrire dans les gestionnaires
 * signifierait qu'une route facturée ajoutée demain sans sa vérification serait
 * offerte — un défaut dont aucun utilisateur ne se plaindra jamais. La table des
 * routes concernées est dans `entitlements.ts`, à côté de la raison de chaque
 * ligne.
 */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (!path.startsWith('/api/')) return
  if (isPublicApiRoute(path)) return

  const { user } = await requireAuth(event)

  // Le cookie survit à la suppression du compte : la session est scellée, pas
  // vérifiée en base. Le contrôle est fait ici pour que toutes les routes en
  // héritent — voir `assertAccountExists`.
  await assertAccountExists(event, user.id)

  // Ordre voulu : la formule se vérifie **après** l'existence du compte. Un
  // compte supprimé doit s'entendre dire qu'il n'existe plus, pas qu'il lui
  // manque un abonnement.
  const requiredPlan = requiredPlanFor(path)

  if (requiredPlan) await assertPlan(user, requiredPlan)
})
