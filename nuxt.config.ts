import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['@/assets/css/main.css'],
  modules: ['@nuxt/eslint', 'nuxt-auth-utils', '@nuxtjs/seo'],
  vite: {
    plugins: [tailwindcss()],
  },

  // @nuxtjs/seo compose les titres avec « %s | %siteName » : sans nom de site,
  // le jeton reste affiché tel quel dans l'onglet du navigateur.
  site: { name: 'ZenTime' },

  // Valeurs par défaut = configuration de développement (Mailpit via docker compose).
  // Chaque clé est surchargeable en production par la variable d'environnement
  // correspondante : mail.host ← NUXT_MAIL_HOST, public.siteUrl ← NUXT_PUBLIC_SITE_URL.
  runtimeConfig: {
    // Le mot de passe de scellement vient de NUXT_SESSION_PASSWORD, jamais du code.
    session: {
      // Une journée de travail : au-delà, la session expire d'elle-même. Le
      // cookie est httpOnly et sameSite=lax par défaut, et passe en secure
      // dès que l'application est servie en HTTPS.
      maxAge: 60 * 60 * 8,
    },
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
