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

/**
 * Écrans réservés aux personnes connectées.
 *
 * Une seule liste, lue par deux modules : le fichier d'exclusion des robots et,
 * par ricochet, le plan de site — `@nuxtjs/sitemap` retire ce que `robots`
 * interdit. Sans elle, le plan de site publiait les quatorze écrans de
 * l'application, dont `/equipe` et `/entreprise` : des adresses inaccessibles
 * pour un robot, mais qui renseignent sur la structure du produit et diluent
 * l'exploration des pages qui, elles, ont quelque chose à dire.
 *
 * `/confirmer-email` en fait partie bien qu'elle soit publique : son adresse
 * porte un jeton d'activation, et une adresse indexée est une adresse
 * conservée.
 */
const PRIVATE_ROUTES = [
  '/tableau-de-bord',
  '/pauses',
  '/exercices',
  '/humeur',
  '/statistiques',
  '/profil',
  '/mes-donnees',
  '/equipe',
  '/entreprise',
  // Écran de souscription, à ne pas confondre avec la section tarifaire de la
  // page d'accueil : celle-ci est publique et indexable, celui-là est réservé au
  // responsable RH et n'a rien à faire dans un plan de site.
  '/tarifs',
  '/connexion',
  '/inscription',
  '/confirmer-email',
]

/**
 * Hôte de l'outil de mesure d'audience, vide tant qu'aucun n'est configuré.
 *
 * Rien n'est ouvert dans la politique de sécurité de contenu tant que la
 * variable n'est pas posée : une origine tierce autorisée « au cas où » est une
 * origine tierce autorisée.
 *
 * ⚠️ Elle est lue **à la compilation**, parce que la politique de sécurité de
 * contenu est figée dans le paquet servi. La poser seulement à l'exécution
 * chargerait le script et ferait bloquer ses appels par le navigateur. Sur
 * l'hébergeur visé les variables sont présentes à la compilation, mais c'est une
 * condition, pas un acquis.
 */
const analyticsHostRaw = (process.env.NUXT_PUBLIC_ANALYTICS_HOST || '').trim()
const analyticsHost = (() => {
  if (!analyticsHostRaw) return ''

  try {
    return new URL(analyticsHostRaw.startsWith('http') ? analyticsHostRaw : `https://${analyticsHostRaw}`).origin
  }
  catch {
    return ''
  }
})()

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

  /**
   * Identité du site, lue par tout `@nuxtjs/seo` — titres, adresse canonique,
   * plan de site, métadonnées de partage, données structurées.
   *
   * `name` compose les titres en « %s | ZenTime » : sans lui, le jeton resterait
   * affiché tel quel dans l'onglet. `url` est indispensable au plan de site et
   * aux adresses canoniques, qui ne peuvent pas être relatives ; elle est
   * surchargée en recette par `NUXT_PUBLIC_SITE_URL`. `defaultLocale` pose
   * `<html lang="fr">` — l'attribut valait `en` jusqu'ici, ce qui fait lire la
   * page en anglais par les synthèses vocales.
   */
  site: {
    name: 'ZenTime',
    url: process.env.NUXT_PUBLIC_SITE_URL || 'https://zentime.fr',
    defaultLocale: 'fr',
    description: 'ZenTime accompagne les collaborateurs pendant leur journée de travail : pauses, exercices guidés et suivi du ressenti. Les données restent individuelles, jamais nominatives pour l\'employeur.',
  },

  /**
   * Identité pour les données structurées (NF6).
   *
   * Déclarée une fois ici plutôt que sur chaque page : `nuxt-schema-org` la
   * rattache au graphe de toutes les pages, et les types plus précis — la fiche
   * logiciel de l'accueil — s'y accrochent au lieu de la redéclarer.
   *
   * Sans `logo` : le produit n'a pas d'image de marque exportable, et déclarer
   * une propriété que rien n'alimente vaut moins que de ne pas la déclarer.
   */
  schemaOrg: {
    identity: {
      type: 'Organization',
      name: 'ZenTime',
      description: 'Éditeur d\'une application de bien-être et de santé au travail pour les entreprises.',
    },
  },

  /**
   * Image de partage. 1200 × 630 est le format que les réseaux recadrent le
   * moins ; le défaut du module (1200 × 600) est rogné en haut et en bas.
   *
   * Le secret de signature est fixé par `NUXT_OG_IMAGE_SECRET` en production :
   * régénéré à chaque compilation, il invalide les adresses d'images déjà
   * partagées à chaque déploiement.
   */
  ogImage: {
    defaults: { width: 1200, height: 630 },
  },

  /**
   * Fichier d'exclusion des robots (F12). Voir `PRIVATE_ROUTES` : ce qui est
   * interdit ici disparaît aussi du plan de site.
   *
   * Écrit en `groups` plutôt qu'avec le raccourci `disallow` : un seul bloc
   * `User-agent: *`, celui qu'on lit ici. Le fichier servi en contenait deux, le
   * second vide — il venait de `public/_robots.txt`, resté du gabarit Nuxt, que
   * le module fusionne à sa configuration. Le fichier a été retiré : une règle
   * « tout est permis » posée à côté d'une liste d'interdictions est exactement
   * ce qu'un fichier d'exclusion ne doit pas contenir.
   */
  robots: {
    groups: [{ userAgent: ['*'], disallow: PRIVATE_ROUTES, allow: [] }],
  },

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
       * **Le tunnel de paiement du lot 8 n'a rien rouvert, et c'est un
       * résultat, pas un oubli.** Ce commentaire annonçait un `frame-src` et un
       * `connect-src` pour le prestataire ; l'intégration retenue n'en demande
       * aucun des deux. Le paiement est un tunnel **hébergé** : le navigateur
       * quitte l'application pour le domaine du prestataire, et une navigation
       * de premier plan n'est régie par aucune directive de cette politique.
       * Aucun script tiers n'est chargé sur nos pages, aucun cadre n'y est
       * incrusté, aucun appel n'est passé depuis le navigateur à l'interface du
       * prestataire.
       *
       * **Mesuré sur le paquet de production le 26/08/2026**, et pas déduit :
       * l'en-tête servi ne contient aucune origine du prestataire — `connect-src
       * 'self'`, `frame-src 'self'` — et le parcours de souscription complet
       * aboutit malgré tout sur son domaine. Une politique qui n'autorise rien
       * et un tunnel qui fonctionne quand même : il n'a donc besoin de rien.
       *
       * L'intégration **incrustée**, elle, aurait demandé les trois directives
       * (`js.stripe.com` en scripts et en cadres, `api.stripe.com` en
       * connexions). Elle a été écartée pour cette raison même : elle ferait
       * entrer le premier script tiers non consenti du produit sur les pages
       * d'une application de santé au travail, pour un simple confort
       * d'affichage. Les inscrire quand même « pour être prêt » reviendrait à
       * en payer le prix sans en tirer le confort — et une origine tierce
       * autorisée au cas où est une origine tierce autorisée.
       */
      contentSecurityPolicy: {
        'base-uri': ['\'none\''],
        'default-src': ['\'none\''],
        // L'hôte de mesure d'audience n'entre ici que s'il est configuré : c'est
        // lui que le script appelle pour déposer un évènement.
        'connect-src': [
          '\'self\'',
          ...(dev ? ['ws:', 'wss:'] : []),
          ...(analyticsHost ? [analyticsHost] : []),
        ],
        'font-src': ['\'self\''],
        'form-action': ['\'self\''],
        'frame-ancestors': ['\'none\''],
        'frame-src': ['\'self\''],
        'img-src': ['\'self\'', 'data:'],
        'manifest-src': ['\'self\''],
        'media-src': ['\'self\''],
        'object-src': ['\'none\''],
        // L'hôte de mesure d'audience est **ignoré** par tout navigateur qui
        // applique `strict-dynamic` : la confiance y vient du jeton de rendu et
        // se propage aux scripts que le script de tête insère lui-même, ce qui
        // couvre le nôtre. Il n'est listé que pour les navigateurs qui
        // n'implémentent pas `strict-dynamic` et retombent sur la liste d'hôtes.
        'script-src': [
          '\'self\'',
          '\'strict-dynamic\'',
          '\'nonce-{{nonce}}\'',
          ...(analyticsHost ? [analyticsHost] : []),
        ],
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
    /**
     * Paiement (F11, CU-15). Vide par défaut, et **hors de `public`** : ces deux
     * secrets ne doivent jamais atteindre le navigateur.
     *
     * Un environnement sans clés démarre normalement et le dit — `/tarifs`
     * annonce que le paiement n'est pas configuré ici, plutôt que d'offrir un
     * bouton qui échoue. C'est le cas du poste d'un relecteur qui clone le
     * dépôt.
     *
     * Contrairement à l'hôte de mesure d'audience, elles sont lues **à
     * l'exécution** : rien de ce qu'elles gouvernent n'est figé dans le paquet
     * servi.
     */
    stripe: {
      secretKey: '',
      webhookSecret: '',
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

      /**
       * Mesure d'audience (tâche 7.6). Vide par défaut : **rien n'est chargé
       * tant que rien n'est configuré**, ce qui est aussi l'état par défaut du
       * consentement.
       *
       * `host` est l'origine du service, `domain` le site déclaré chez lui. Les
       * deux sont nécessaires : sans l'un, le script ne se charge pas ; sans
       * l'autre, il se charge sans savoir à quel site rattacher les visites.
       */
      analytics: {
        host: analyticsHost,
        domain: process.env.NUXT_PUBLIC_ANALYTICS_DOMAIN || '',
      },
    },
  },
})
