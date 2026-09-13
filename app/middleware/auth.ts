/**
 * Middleware de route : réserve une page aux personnes connectées.
 *
 * Il ne protège que l'affichage. Ce n'est pas une mesure de sécurité — il
 * s'exécute dans le navigateur, où l'utilisateur peut tout contourner. La
 * protection réelle est celle de `server/middleware/auth.ts`, qui garde les
 * données. Ce middleware-ci évite seulement d'afficher une page vide à qui
 * n'est pas connecté, et le renvoie là où il peut agir.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo({ path: '/connexion', query: { suite: to.fullPath } })
  }
})
