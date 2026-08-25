import tailwindcss from '@tailwindcss/vite'

/**
 * Le serveur de développement a besoin de ce que la production interdit : le
 * rechargement à chaud passe par une WebSocket.
 *
 * L'assouplissement est écrit ici plutôt que dans un bloc `$development`, qui
 * *fusionnerait* les deux listes au lieu de les remplacer et produirait un
 * `connect-src 'self' 'self' ws:`. La politique servie en production est celle
 * qu'on lit plus bas, sans détour.
 */
const dev = process.env.NODE_ENV === 'development'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['@/assets/css/main.css'],
  modules: ['@nuxt/eslint', '@nuxt/fonts', 'nuxt-auth-utils', '@nuxtjs/seo', 'nuxt-security'],
  vite: {
    plugins: [tailwindcss()],
  },

  // Polices auto-hébergées : @nuxt/fonts détecte Manrope et Newsreader dans les
  // variables `--font-*` du thème Tailwind, télécharge les fichiers au build et
  // les sert depuis /_fonts — aucun appel à fonts.googleapis.com au runtime.
  // Les graisses doivent être listées : le module ne résout que la 400 par
  // défaut, les autres seraient simulées par le navigateur.
  fonts: {
    families: [
      { name: 'Manrope', provider: 'google', weights: [400, 500, 600, 700, 800], styles: ['normal'] },
      { name: 'Newsreader', provider: 'google', weights: [400, 500], styles: ['normal', 'italic'] },
    ],
  },

  // @nuxtjs/seo compose les titres avec « %s | %siteName » : sans nom de site,
  // le jeton reste affiché tel quel dans l'onglet du navigateur.
  site: { name: 'ZenTime' },

  // Le vérificateur de liens ne connaît que les pages. L'export du droit d'accès
  // (CU-05.1) est un lien vers une ressource servie en pièce jointe, pas vers un
  // écran : il n'a ni route de page ni entrée au plan de site. Cette exclusion
  // vaut pour le contrôle à l'exécution ; la règle ESLint du même module lit un
  // inventaire de routes séparé et demande son propre commentaire d'exemption.
  linkChecker: { excludeLinks: ['/api/**'] },

  /**
   * Sécurité applicative — exigence NF1, tâche 7.2.
   *
   * Les valeurs ci-dessous remplacent celles de nuxt-security là où elles sont
   * nommées et les complètent ailleurs. Chaque écart au défaut du module est
   * motivé : un en-tête de sécurité que personne ne sait justifier finit par
   * être désactivé au premier écran cassé.
   */
  security: {
    headers: {
      /**
       * Politique de sécurité de contenu, écrite en liste blanche : tout est
       * refusé (`default-src 'none'`), et chaque type de ressource est rouvert
       * pour la seule origine de l'application. Le défaut du module, lui,
       * autorise `https:` en scripts et en styles — c'est-à-dire tout internet.
       *
       * `strict-dynamic` et le jeton de rendu : seuls s'exécutent les scripts
       * qui portent le jeton, et ceux qu'ils chargent eux-mêmes. Une balise
       * `<script>` glissée dans le HTML par un défaut d'échappement n'a pas le
       * jeton, et reste inerte — y compris servie depuis notre propre domaine.
       *
       * `style-src` garde `unsafe-inline` et **pas** de jeton, à dessein : le
       * produit pose des styles calculés en ligne (hauteur des barres d'humeur,
       * diamètre des jauges, couleur d'une série). Poser un jeton dans
       * `style-src` ferait ignorer `unsafe-inline` par le navigateur — c'est la
       * règle de la spécification — et ces attributs cesseraient de s'appliquer.
       *
       * À rouvrir au lot 8, nommément et pas en élargissant : le tunnel de
       * paiement et l'outil de mesure d'audience demanderont chacun leur
       * origine, et Stripe un `frame-src`.
       */
      contentSecurityPolicy: {
        'base-uri': ['\'none\''],
        'default-src': ['\'none\''],
        'connect-src': dev ? ['\'self\'', 'ws:', 'wss:'] : ['\'self\''],
        'font-src': ['\'self\''],
        'form-action': ['\'self\''],
        'frame-ancestors': ['\'none\''],
        'frame-src': ['\'self\''],
        'img-src': ['\'self\'', 'data:'],
        'manifest-src': ['\'self\''],
        'media-src': ['\'self\''],
        'object-src': ['\'none\''],
        'script-src': ['\'self\'', '\'strict-dynamic\'', '\'nonce-{{nonce}}\''],
        'script-src-attr': ['\'none\''],
        'style-src': ['\'self\'', '\'unsafe-inline\''],
        // Inutile en développement, où l'application est servie en clair sur
        // localhost : la directive y ferait basculer les appels en HTTPS.
        'upgrade-insecure-requests': !dev,
        // `blob:` en développement seulement : le client de rechargement à
        // chaud crée un travailleur à partir d'un objet blob pour surveiller le
        // retour du serveur. L'application, elle, n'ouvre aucun travailleur.
        'worker-src': dev ? ['\'self\'', 'blob:'] : ['\'self\''],
      },

      // `DENY` plutôt que `SAMEORIGIN` : aucun écran de ZenTime n'a vocation à
      // être encadré, pas même par lui-même. Doublon volontaire de
      // `frame-ancestors`, que les navigateurs anciens ignorent.
      xFrameOptions: 'DENY',

      // Le référent complet ferait fuiter l'adresse consultée — donc l'écran,
      // donc parfois le périmètre regardé — vers tout site atteint par un lien.
      referrerPolicy: 'strict-origin-when-cross-origin',

      // Fonctions du navigateur dont le produit ne se sert pas. La notification
      // de rappel (CU-07) n'est pas dans cette liste : elle ne relève pas de
      // Permissions-Policy mais de l'autorisation demandée à l'utilisateur.
      permissionsPolicy: {
        'accelerometer': [],
        'camera': [],
        'display-capture': [],
        'geolocation': [],
        'gyroscope': [],
        'magnetometer': [],
        'microphone': [],
        'payment': [],
        'usb': [],
      },
    },

    /**
     * CORS — l'API ne sert que l'application.
     *
     * Le front et l'API partagent une origine : aucune requête légitime n'est
     * inter-origines. La valeur par défaut du module est l'URL du serveur de
     * développement, qui serait fausse en production ; elle est donc posée
     * explicitement, et surchargeable par
     * `NUXT_SECURITY_CORS_HANDLER_ORIGIN`.
     */
    corsHandler: {
      origin: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },

    /**
     * Filtre anti-XSS générique désactivé, et c'est une décision.
     *
     * Il compare le corps de la requête à sa version nettoyée par liste noire et
     * rejette la requête si elle en diffère. Ici il refuserait des saisies
     * parfaitement légitimes — un mot de passe contenant `<`, un nom portant une
     * esperluette — pour une protection que la validation Zod assure déjà par
     * liste blanche : chaque champ a son type, sa longueur et son format, et
     * rien n'atteint la base sans y être passé. L'échappement de sortie, lui,
     * est celui de Vue.
     */
    xssValidator: false,

    /**
     * Limitation de débit — NF1, « limitation de débit sur les points d'entrée
     * d'authentification ».
     *
     * La limite globale du module — 150 requêtes par tranche de cinq minutes et
     * par adresse — est retirée : elle s'appliquerait à `/**`, donc aussi aux
     * morceaux de script, aux polices et aux images, qu'un seul chargement de
     * page demande par dizaines. Le seuil est posé là où il a un sens, dans
     * `routeRules` — et là seulement, pour les raisons mesurées qui y figurent.
     */
    rateLimiter: false,

    /**
     * Le module retire les appels `console.*` de la compilation de production.
     * Les deux seuls du produit sont des traces d'exploitation qu'exige
     * l'exception E1 de CU-02 — « l'échec est journalisé » — et il n'y a aucune
     * trace de mise au point côté navigateur. Les supprimer ne gagnerait rien et
     * rendrait muette la seule panne qu'on ne voit pas venir.
     */
    removeLoggers: false,
  },

  routeRules: {
    /**
     * Points d'entrée d'authentification — la seule limitation de débit du
     * produit, et NF1 ne demande pas autre chose.
     *
     * Le compteur porte sur le motif `/api/auth/**` et non sur chaque route :
     * sans cela, il suffirait d'alterner connexion et inscription pour doubler
     * son quota. Il vise le bourrage d'identifiants et l'inondation de boîtes de
     * réception, pas la faute de frappe.
     *
     * **Le seuil est dimensionné pour une sortie internet partagée**, et c'est
     * ce qui explique qu'il paraisse large. Les clients sont des entreprises :
     * cinquante personnes derrière une même adresse publique se connectent le
     * matin, et un seuil serré les couperait toutes pour la faute de l'une.
     * Soixante tentatives par tranche de cinq minutes couvrent cette pointe,
     * quand une attaque par dictionnaire en demande des dizaines de milliers.
     *
     * Ce que ce seuil ne fait pas, et qu'il faut savoir : il ne protège pas un
     * compte précis, puisqu'il compte par adresse. Un compteur **par compte**
     * est la mesure complémentaire — hors périmètre de ce lot, à inscrire aux
     * évolutions.
     *
     * ⚠️ Le compteur vit en mémoire du processus. En exécution sans serveur il
     * est donc par instance — même point dur que le pool de connexions
     * (`infrastructure.md` §8). Un stockage partagé est la suite à prévoir au
     * déploiement.
     */
    '/api/auth/**': {
      security: {
        rateLimiter: { tokensPerInterval: 60, interval: 300_000, headers: true },
      },
    },

    /**
     * Le reste de l'API n'est **pas** limité par débit, après mesure.
     *
     * Les appels que Nuxt passe à l'API pendant le rendu serveur traversent la
     * même barrière et sont comptés sur l'adresse du visiteur : un seul rendu du
     * tableau de bord consomme trois jetons (vérifié à l'en-tête
     * `x-ratelimit-remaining`, 18 → 14 pour un rendu plus un appel direct).
     * Rapporté à une entreprise entière derrière une seule adresse publique,
     * tout seuil praticable serait franchi par l'usage normal — et un seuil
     * assez haut pour ne pas l'être ne protégerait plus de rien.
     *
     * Ces routes ne sont pas nues pour autant : elles exigent une session, le
     * compte est relu à chaque requête, et aucune ne prend d'identifiant de
     * périmètre en entrée. La bonne mesure ici est une limitation en amont, sur
     * un stockage partagé, au déploiement.
     */
  },

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
