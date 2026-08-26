/**
 * État du consentement de qui consulte la page (CU-04).
 *
 * Une seule requête pour tout le monde : la clé `consent` fait que le bandeau,
 * l'écran « mes données » et la mesure d'audience partagent la même réponse et
 * le même objet réactif. Sans elle, chacun interrogerait le serveur de son côté
 * et le bandeau pourrait afficher un état que la mesure d'audience contredit.
 *
 * `useFetch` et non `$fetch` : l'état est résolu au rendu serveur, donc le
 * bandeau est déjà dans le HTML — il n'apparaît pas après coup en poussant la
 * page vers le bas — et le script de mesure part avec le jeton de rendu.
 */
export function useConsent() {
  return useFetch('/api/consent', { key: 'consent' })
}
