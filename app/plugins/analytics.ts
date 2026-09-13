/**
 * Mesure d'audience — tâche 7.6, exigence F12 : « outil de mesure d'audience
 * installé et fonctionnel, **déclenché uniquement après consentement** ».
 *
 * Trois conditions cumulatives, et la troisième est celle qui compte :
 *
 * 1. un hôte est configuré (`NUXT_PUBLIC_ANALYTICS_HOST`) ;
 * 2. un domaine déclaré chez lui (`NUXT_PUBLIC_ANALYTICS_DOMAIN`) ;
 * 3. **le consentement `ANALYTICS` est accordé et à jour.**
 *
 * Sans les deux premières, rien n'est chargé et rien n'est ouvert dans la
 * politique de sécurité de contenu : une origine tierce autorisée « au cas où »
 * est une origine tierce autorisée. Sans la troisième, le script n'est pas
 * inséré du tout — il n'est pas chargé puis neutralisé, ce qui reviendrait à
 * déposer d'abord et demander ensuite.
 *
 * L'insertion passe par `useHead` avec une source réactive, ce qui donne les
 * deux comportements attendus : au rendu serveur la balise part avec le jeton
 * de la politique de sécurité de contenu, et après un clic sur « Accepter » elle
 * est insérée par un script déjà de confiance — ce que `strict-dynamic`
 * autorise précisément.
 *
 * ⚠️ Limite à connaître : retirer son consentement **retire la balise**, mais un
 * script déjà chargé reste en mémoire jusqu'au prochain chargement de page. Le
 * retrait est donc effectif à la page suivante, pas à l'instant du clic. Le dire
 * plutôt que laisser croire à un arrêt immédiat — la politique de
 * confidentialité annonce un retrait « pour l'avenir », c'est exactement ce
 * comportement.
 *
 * Le fournisseur retenu se pilote par ses attributs (`data-domain`) et ne pose
 * aucun cookie : c'est ce qui permet de tenir la ligne « aucune donnée conservée
 * en base » du tableau des finalités.
 */
export default defineNuxtPlugin(async () => {
  const { host, domain } = useRuntimeConfig().public.analytics

  // Sortie avant toute requête : sans outil configuré, il n'y a rien à décider.
  if (!host || !domain) return

  const { data } = await useConsent()

  useHead(() => (data.value?.analytics === true
    ? {
        script: [{
          // Clé nommée : sans elle, la balise rendue côté serveur n'est pas
          // reprise en main par le gestionnaire d'en-tête, et un retrait de
          // consentement la laissait en place jusqu'au rechargement suivant.
          key: 'audience',
          src: `${host}/js/script.js`,
          defer: true,
          'data-domain': domain,
        }],
      }
    : {}))
})
