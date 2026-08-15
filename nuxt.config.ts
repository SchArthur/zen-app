// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', 'nuxt-auth-utils', '@nuxtjs/seo'],

  // Valeurs par défaut = configuration de développement (Mailpit via docker compose).
  // Chaque clé est surchargeable en production par la variable d'environnement
  // correspondante : mail.host ← NUXT_MAIL_HOST, public.siteUrl ← NUXT_PUBLIC_SITE_URL.
  runtimeConfig: {
    mail: {
      host: 'localhost',
      port: 1025,
      secure: false,
      user: '',
      password: '',
      from: 'ZenTime <bonjour@zentime.fr>',
    },
    public: {
      // Base des liens envoyés par email : ils sortent de l'application, ils ne
      // peuvent donc pas être relatifs. Clé distincte de `siteUrl`, qui appartient
      // à @nuxtjs/seo et refuse une valeur en localhost.
      appUrl: 'http://localhost:3000',
    },
  },
})
