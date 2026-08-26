<script setup lang="ts">
import { BILLING_UNIT, HIGHLIGHTED_PLAN, PLANS, formatPrice } from '#shared/utils/plans'

/**
 * CU-01 — Consulter la présentation publique. Fonction F12, tâche 7.5.
 *
 * Seule surface indexable du produit, et seul point d'entrée d'un prospect.
 * Elle porte aussi un engagement de transparence : les garanties de
 * confidentialité s'annoncent **avant** l'inscription, pas une fois le compte
 * créé.
 *
 * Aucune coquille d'application : la page compose son propre en-tête et son
 * propre pied. Les écrans connectés ont une barre latérale et une barre
 * d'onglets qui n'ont rien à faire devant quelqu'un qui n'a pas de compte.
 *
 * Le contenu est écrit sur `dossier-conception.md` §1.1 à §1.3 et sur les
 * garanties réellement tenues par le code — seuil de cinq déclarants, moteur de
 * règles sans apprentissage, export et suppression en autonomie. Une page
 * publique qui promet ce que le produit ne fait pas est un écart de plus, et
 * c'est le seul qu'un visiteur puisse constater lui-même.
 */
definePageMeta({ layout: false })

const { loggedIn } = useUserSession()

const description = 'ZenTime accompagne vos collaborateurs pendant leur journée de travail : minuteur de pause, exercices guidés et ressenti déclaré en dix secondes. L\'entreprise en lit des tendances d\'équipe, jamais des personnes.'

useSeoMeta({
  // Le titre de l'accueil ne reprend pas le gabarit « %s | ZenTime » : la marque
  // y serait deux fois, et c'est le seul écran dont le titre doit tenir seul
  // dans un résultat de recherche.
  title: 'ZenTime — Le bien-être au travail, une pause à la fois',
  titleTemplate: '%s',
  description,
  ogTitle: 'ZenTime — Le bien-être au travail, une pause à la fois',
  ogDescription: description,
  ogType: 'website',
})

// `defineOgImage` et non `defineOgImageComponent`, déprécié depuis la v6 du
// module. La signature est la même : le composant, puis ses propriétés.
defineOgImage('Zen', {
  title: 'Le bien-être au travail, une pause à la fois',
  subtitle: 'Pauses, exercices et ressenti — des tendances d\'équipe, jamais des personnes.',
})

/**
 * Données structurées (NF6).
 *
 * `SoftwareApplication` plutôt que `Product` : c'est un logiciel en ligne, et
 * c'est le type que les moteurs comprennent pour en afficher la catégorie et le
 * tarif. Les offres sont construites depuis `PLANS`, la même source que les
 * cartes plus bas — un tarif recopié dans les données structurées finirait par
 * annoncer aux moteurs un prix que la page n'affiche plus.
 */
useSchemaOrg([
  defineSoftwareApp({
    name: 'ZenTime',
    description,
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Web',
    inLanguage: 'fr-FR',
    offers: PLANS.map(plan => ({
      '@type': 'Offer',
      'name': plan.name,
      'price': plan.pricePerSeat,
      'priceCurrency': 'EUR',
      'description': `${formatPrice(plan.pricePerSeat)} ${BILLING_UNIT}, hors taxes.`,
    })),
  }),
])

/** Ce que le produit règle, tiré de la reformulation du besoin (§1.1). */
const problems = [
  {
    title: 'La journée s\'est fragmentée',
    body: 'Réunions en cascade, sollicitations permanentes, travail hybride qui brouille la frontière avec la vie privée. On se lève moins, on souffle moins.',
  },
  {
    title: 'Les actions ponctuelles ne laissent rien',
    body: 'Une conférence sur le sommeil, une séance de sophrologie, une affiche dans l\'ascenseur : rien de tout cela n\'entre dans le quotidien, et rien ne dit si ça a servi.',
  },
  {
    title: 'L\'obligation, elle, reste entière',
    body: 'L\'employeur doit prévenir les risques physiques et mentaux (article L4121-1) et les consigner. Encore faut-il des indicateurs pour en parler.',
  },
]

/** Les fonctions livrées, et rien d'autre. */
const features = [
  {
    title: 'Un minuteur de pause',
    body: 'Démarré en une interaction depuis n\'importe quel écran. Rappel quand la position assise dure, report possible, et jamais en dehors des horaires que la personne a déclarés.',
  },
  {
    title: 'Des exercices de quelques minutes',
    body: 'Étirement, respiration, méditation — quinze exercices guidés pas à pas, réalisables au poste de travail, sans matériel et sans se faire remarquer.',
  },
  {
    title: 'Un ressenti en dix secondes',
    body: 'Deux échelles, humeur et stress, une fois par jour, corrigeables jusqu\'à minuit. Déclarées par la personne, jamais déduites d\'un capteur.',
  },
  {
    title: 'Des suggestions expliquées',
    body: 'Un jeu de règles fixes, dont le motif est toujours affiché. Aucun apprentissage automatique : ce qui est proposé peut se justifier, ligne à ligne.',
  },
  {
    title: 'Ses propres statistiques',
    body: 'Pauses prises, exercices réalisés, ressenti moyen, sur la semaine ou sur le mois. La seule comparaison offerte est celle de la personne avec sa période précédente.',
  },
  {
    title: 'Un climat d\'équipe, pas un tableau de notes',
    body: 'Le manager lit une tendance agrégée, à partir de cinq déclarants seulement. Aucun classement, aucun score individuel, aucune remontée nominative.',
  },
]

/** Trois lectures, et surtout trois interdits (§1.2). */
const audiences = [
  {
    role: 'Le collaborateur',
    sees: 'Ses pauses, ses exercices, son ressenti et sa progression, en détail.',
    cannot: 'Rien ne lui est caché de ses propres données : il les exporte et les efface quand il veut.',
    tone: 'from-avatar-mint to-avatar-sky',
  },
  {
    role: 'Le manager',
    sees: 'Le climat de sa seule équipe, agrégé, à partir de cinq personnes ayant déclaré.',
    cannot: 'Il ne peut pas voir le ressenti d\'un membre, comparer deux personnes, ni consulter une autre équipe.',
    tone: 'from-avatar-periwinkle to-avatar-lilac',
  },
  {
    role: 'Les ressources humaines',
    sees: 'Des indicateurs à l\'échelle de l\'entreprise, et leur évolution d\'une période à l\'autre.',
    cannot: 'Elles n\'accèdent à aucune donnée individuelle, et l\'export leur est refusé sous le seuil.',
    tone: 'from-avatar-mauve to-avatar-periwinkle',
  },
]

/** Garanties tenues par le code, pas par une intention. */
const guarantees = [
  {
    title: 'Le seuil de cinq, aussi jour par jour',
    body: 'Sous cinq déclarants, l\'application ne renvoie rien — ni moyenne, ni total, ni nombre de participants. Le seuil s\'applique aussi à chaque journée : une seule déclaration un mardi ferait de la « moyenne du mardi » le ressenti de quelqu\'un.',
  },
  {
    title: 'Chaque consultation est tracée',
    body: 'Toute lecture d\'un climat d\'équipe laisse une trace horodatée, réussie comme refusée. Chacun retrouve ses propres consultations dans son export.',
  },
  {
    title: 'Un consentement révocable en un clic',
    body: 'Il se retire en autant de gestes qu\'il s\'accorde. La collecte s\'arrête, le compte demeure, et refuser ne change rien au reste de l\'application.',
  },
  {
    title: 'Partir avec ses données, ou sans rien laisser',
    body: 'Export au format ouvert et suppression définitive du compte, depuis l\'interface, sans demande à formuler ni délai d\'attente.',
  },
]
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <a
      href="#contenu"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-label focus:font-bold focus:shadow-pop"
    >
      Aller au contenu
    </a>

    <header class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 lg:px-9">
      <AppLogo />

      <!-- Les liens de cette barre et ceux du pied portent un retrait vertical
           qui n'a rien d'esthétique : sans lui, leur zone cliquable fait 18 px
           de haut, sous le minimum de 24 px des cibles tactiles. Relevé par
           l'audit d'accessibilité, seul défaut qu'il ait trouvé. -->
      <nav aria-label="Navigation de la page d'accueil">
        <ul class="flex flex-wrap items-center gap-x-5 gap-y-3 text-label font-semibold text-fg-muted">
          <li>
            <a
              href="#fonctions"
              class="inline-block py-1.5 hover:text-fg"
            >Ce que ça fait</a>
          </li>
          <li>
            <a
              href="#confidentialite"
              class="inline-block py-1.5 hover:text-fg"
            >Confidentialité</a>
          </li>
          <li>
            <a
              href="#tarifs"
              class="inline-block py-1.5 hover:text-fg"
            >Tarifs</a>
          </li>
          <li v-if="loggedIn">
            <NuxtLink
              to="/tableau-de-bord"
              class="rounded-lg bg-accent px-4 py-2.5 text-label/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
            >
              Mon tableau de bord
            </NuxtLink>
          </li>
          <template v-else>
            <li>
              <NuxtLink
                to="/connexion"
                class="inline-block py-1.5 hover:text-fg"
              >
                Se connecter
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/inscription"
                class="rounded-lg bg-accent px-4 py-2.5 text-label/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
              >
                Créer un compte
              </NuxtLink>
            </li>
          </template>
        </ul>
      </nav>
    </header>

    <main id="contenu">
      <!-- ── Accroche ─────────────────────────────────────────────────────── -->
      <section class="mx-auto max-w-6xl px-5 pt-10 pb-16 lg:px-9 lg:pt-20 lg:pb-24">
        <div class="max-w-3xl">
          <p class="text-caption font-bold tracking-eyebrow text-accent-strong uppercase">
            Bien-être &amp; santé au travail
          </p>
          <!-- L'espace avant le saut de ligne n'est pas une coquille : sans
               elle, Vue condense le blanc et le nom accessible du titre devient
               « … au travail,une pause à la fois ». -->
          <h1 class="mt-4 font-display text-[2.25rem]/[1.08] text-fg lg:text-[3.5rem]/[1.05]">
            Le bien-être au travail, <br>
            <span class="italic">une pause à la fois.</span>
          </h1>
          <p class="mt-5 max-w-2xl text-base/prose text-fg-soft lg:text-lg/prose">
            ZenTime accompagne vos collaborateurs pendant leur journée plutôt qu'à
            côté d'elle : un minuteur de pause, des exercices de quelques minutes,
            un ressenti déclaré en dix secondes. L'entreprise en lit des tendances
            d'équipe — jamais des personnes.
          </p>

          <div class="mt-8 flex flex-wrap gap-3">
            <NuxtLink
              :to="loggedIn ? '/tableau-de-bord' : '/inscription'"
              class="rounded-lg bg-accent px-6 py-3.5 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
            >
              {{ loggedIn ? 'Ouvrir mon tableau de bord' : 'Créer un compte' }}
            </NuxtLink>
            <a
              href="#tarifs"
              class="rounded-lg border border-border-strong bg-surface px-6 py-3.5 text-sm/none font-bold text-fg transition-colors hover:bg-surface-soft"
            >
              Voir les tarifs
            </a>
          </div>

          <!-- Trois garanties, dites tout de suite. C'est la première objection
               d'un collaborateur à qui son employeur installe un outil de
               bien-être, et elle ne se lève pas au bas de la page. -->
          <ul class="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-caption/[1.5] font-semibold text-fg-muted">
            <li class="flex items-center gap-2">
              <span
                aria-hidden="true"
                class="size-1.75 rounded-full bg-accent"
              />
              Usage volontaire
            </li>
            <li class="flex items-center gap-2">
              <span
                aria-hidden="true"
                class="size-1.75 rounded-full bg-accent"
              />
              Aucune donnée nominative pour l'employeur
            </li>
            <li class="flex items-center gap-2">
              <span
                aria-hidden="true"
                class="size-1.75 rounded-full bg-accent"
              />
              Hébergement dans l'Union européenne
            </li>
          </ul>
        </div>
      </section>

      <!-- ── Le problème ──────────────────────────────────────────────────── -->
      <section class="bg-surface py-16 lg:py-20">
        <div class="mx-auto max-w-6xl px-5 lg:px-9">
          <h2 class="max-w-2xl font-display text-[1.75rem]/[1.15] text-fg lg:text-[2.25rem]/[1.1]">
            Le problème n'est pas le manque de bonne volonté
          </h2>

          <ul class="mt-9 grid grid-cols-1 gap-6 md:grid-cols-3">
            <li
              v-for="problem in problems"
              :key="problem.title"
            >
              <h3 class="text-label font-bold text-fg">
                {{ problem.title }}
              </h3>
              <p class="mt-2 text-label/prose text-fg-muted">
                {{ problem.body }}
              </p>
            </li>
          </ul>
        </div>
      </section>

      <!-- ── Fonctions ────────────────────────────────────────────────────── -->
      <section
        id="fonctions"
        class="scroll-mt-6 py-16 lg:py-20"
      >
        <div class="mx-auto max-w-6xl px-5 lg:px-9">
          <h2 class="max-w-2xl font-display text-[1.75rem]/[1.15] text-fg lg:text-[2.25rem]/[1.1]">
            Six gestes simples, tenus par l'application
          </h2>
          <p class="mt-3 max-w-2xl text-label/prose text-fg-muted lg:text-sm/prose">
            Rien de plus. Un outil de bien-être qui collecterait davantage que ce
            dont il a besoin pour proposer un exercice serait disproportionné,
            quelle que soit la qualité de son consentement.
          </p>

          <ul class="mt-9 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <li
              v-for="feature in features"
              :key="feature.title"
              class="rounded-3xl bg-surface px-6 py-5.5 shadow-soft"
            >
              <h3 class="text-label font-bold text-fg">
                {{ feature.title }}
              </h3>
              <p class="mt-2 text-label/prose text-fg-muted">
                {{ feature.body }}
              </p>
            </li>
          </ul>
        </div>
      </section>

      <!-- ── Trois lectures ───────────────────────────────────────────────── -->
      <section class="bg-surface py-16 lg:py-20">
        <div class="mx-auto max-w-6xl px-5 lg:px-9">
          <h2 class="max-w-2xl font-display text-[1.75rem]/[1.15] text-fg lg:text-[2.25rem]/[1.1]">
            Trois lectures des mêmes données, trois interdits
          </h2>
          <p class="mt-3 max-w-2xl text-label/prose text-fg-muted lg:text-sm/prose">
            C'est la tension que le produit devait résoudre : collecter un
            ressenti intime et donner une vue au manager. Traitées naïvement, ces
            deux exigences se contredisent — le jour où quelqu'un soupçonne que sa
            saisie remonte à sa hiérarchie, il arrête ou il ment.
          </p>

          <ul class="mt-9 grid grid-cols-1 gap-5 md:grid-cols-3">
            <li
              v-for="audience in audiences"
              :key="audience.role"
              class="flex flex-col rounded-3xl bg-app px-6 py-5.5"
            >
              <span
                aria-hidden="true"
                class="mb-4 block size-9 rounded-full bg-linear-135"
                :class="audience.tone"
              />
              <h3 class="text-label font-bold text-fg">
                {{ audience.role }}
              </h3>
              <p class="mt-2 text-label/prose text-fg-muted">
                {{ audience.sees }}
              </p>
              <p class="mt-3 border-t border-border pt-3 text-caption/[1.55] font-semibold text-fg-subtle">
                {{ audience.cannot }}
              </p>
            </li>
          </ul>
        </div>
      </section>

      <!-- ── Confidentialité ──────────────────────────────────────────────── -->
      <section
        id="confidentialite"
        class="scroll-mt-6 py-16 lg:py-20"
      >
        <div class="mx-auto max-w-6xl px-5 lg:px-9">
          <h2 class="max-w-2xl font-display text-[1.75rem]/[1.15] text-fg lg:text-[2.25rem]/[1.1]">
            Ce que nous garantissons, et qui est vérifiable
          </h2>
          <p class="mt-3 max-w-2xl text-label/prose text-fg-muted lg:text-sm/prose">
            ZenTime n'est pas un outil de surveillance, c'est un outil
            d'incitation. Il ne mesure pas la performance, n'alimente aucune
            évaluation et ne produit aucun classement entre collaborateurs.
          </p>

          <ul class="mt-9 grid grid-cols-1 gap-5 md:grid-cols-2">
            <li
              v-for="guarantee in guarantees"
              :key="guarantee.title"
              class="rounded-3xl bg-surface px-6 py-5.5 shadow-soft"
            >
              <h3 class="text-label font-bold text-fg">
                {{ guarantee.title }}
              </h3>
              <p class="mt-2 text-label/prose text-fg-muted">
                {{ guarantee.body }}
              </p>
            </li>
          </ul>

          <p class="mt-7 text-label/prose text-fg-muted">
            Le détail — chaque finalité, sa base légale et sa durée de
            conservation — est dans la
            <NuxtLink
              to="/confidentialite"
              class="font-semibold text-accent-strong underline underline-offset-2"
            >
              politique de confidentialité
            </NuxtLink>, lisible sans compte.
          </p>
        </div>
      </section>

      <!-- ── Tarifs ───────────────────────────────────────────────────────── -->
      <section
        id="tarifs"
        class="scroll-mt-6 bg-surface py-16 lg:py-20"
      >
        <div class="mx-auto max-w-6xl px-5 lg:px-9">
          <h2 class="max-w-2xl font-display text-[1.75rem]/[1.15] text-fg lg:text-[2.25rem]/[1.1]">
            Deux formules, facturées à l'usage réel
          </h2>
          <p class="mt-3 max-w-2xl text-label/prose text-fg-muted lg:text-sm/prose">
            Le prix suit le nombre de collaborateurs qui se servent réellement de
            ZenTime, pas l'effectif de l'entreprise. Facturer ceux qui ne s'en
            servent pas donnerait à l'employeur une raison d'insister — et cette
            raison suffirait à vicier le consentement sur lequel tout repose.
          </p>

          <ul class="mt-9 grid grid-cols-1 gap-5 md:grid-cols-2">
            <li
              v-for="plan in PLANS"
              :key="plan.id"
              class="flex flex-col rounded-3xl px-6 py-6 lg:px-7"
              :class="plan.id === HIGHLIGHTED_PLAN
                ? 'bg-accent-soft ring-1 ring-accent-muted'
                : 'bg-app'"
            >
              <h3 class="text-label font-bold text-fg-muted">
                {{ plan.name }}
              </h3>

              <p class="mt-2 flex flex-wrap items-baseline gap-x-2">
                <span class="font-display text-[2.5rem]/none text-fg">{{ formatPrice(plan.pricePerSeat) }}</span>
                <span class="text-caption/[1.4] font-semibold text-fg-muted">HT {{ BILLING_UNIT }}</span>
              </p>

              <p class="mt-3 text-label/prose text-fg-soft">
                {{ plan.audience }}
              </p>

              <ul class="mt-5 flex flex-1 flex-col gap-2.5">
                <li
                  v-for="item in plan.features"
                  :key="item"
                  class="flex gap-2.5 text-label/[1.5] text-fg-muted"
                >
                  <span
                    aria-hidden="true"
                    class="mt-1.75 size-1.75 shrink-0 rounded-full bg-accent"
                  />
                  <span>{{ item }}</span>
                </li>
                <!-- Ce que la formule n'inclut pas, écrit. Une liste de
                     fonctions qui s'arrête sans le dire laisse deviner. -->
                <li
                  v-for="item in plan.excluded"
                  :key="item"
                  class="flex gap-2.5 text-label/[1.5] text-fg-muted"
                >
                  <span
                    aria-hidden="true"
                    class="mt-2.25 h-px w-1.75 shrink-0 bg-current"
                  />
                  <span>Non compris : {{ item }}</span>
                </li>
              </ul>

              <NuxtLink
                :to="loggedIn ? '/tableau-de-bord' : '/inscription'"
                class="mt-6 rounded-lg px-5 py-3.25 text-center text-sm/none font-bold transition-colors"
                :class="plan.id === HIGHLIGHTED_PLAN
                  ? 'bg-accent text-fg-onaccent hover:bg-accent-strong'
                  : 'border border-border-strong bg-surface text-fg hover:bg-surface-soft'"
              >
                Commencer avec {{ plan.name }}
              </NuxtLink>
            </li>
          </ul>

          <p class="mt-6 text-caption/[1.55] text-fg-faint">
            Prix hors taxes, facturés au mois et résiliables à tout moment. La
            souscription se fait dans l'application, par le responsable des
            ressources humaines de votre entreprise. Si ZenTime n'y est pas
            encore déployé, écrivez-nous à
            <a
              href="mailto:bonjour@zentime.fr"
              class="underline underline-offset-2 hover:text-fg-muted"
            >bonjour@zentime.fr</a>
            pour faire ouvrir son compte : c'est le domaine de votre adresse
            professionnelle qui rattachera ensuite chacun, sans qu'aucune liste
            de salariés ne nous soit transmise.
          </p>
        </div>
      </section>

      <!-- ── Appel final ──────────────────────────────────────────────────── -->
      <section class="py-16 lg:py-20">
        <div class="mx-auto max-w-6xl px-5 lg:px-9">
          <div class="rounded-4xl bg-linear-135 from-halo-sage to-halo-sky px-7 py-10 lg:px-12 lg:py-14">
            <h2 class="max-w-2xl font-display text-[1.75rem]/[1.15] text-fg lg:text-[2.25rem]/[1.1]">
              Une minute par jour, et l'entreprise sait enfin où elle en est
            </h2>
            <p class="mt-3 max-w-2xl text-label/prose text-fg-soft lg:text-sm/prose">
              Le rattachement se fait par le domaine de votre adresse
              professionnelle : votre employeur ne transmet aucune liste de
              salariés, et c'est vous qui vous inscrivez.
            </p>
            <NuxtLink
              :to="loggedIn ? '/tableau-de-bord' : '/inscription'"
              class="mt-7 inline-block rounded-lg bg-accent px-6 py-3.5 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
            >
              {{ loggedIn ? 'Ouvrir mon tableau de bord' : 'Créer un compte' }}
            </NuxtLink>
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-border">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 lg:px-9">
        <p class="text-caption text-fg-muted">
          © {{ new Date().getFullYear() }} ZenTime — bien-être et santé au travail.
        </p>
        <ul class="flex flex-wrap gap-x-5 gap-y-3 text-caption font-semibold text-fg-muted">
          <li>
            <NuxtLink
              to="/confidentialite"
              class="inline-block py-1.5 underline underline-offset-2 hover:text-fg"
            >
              Politique de confidentialité
            </NuxtLink>
          </li>
          <li>
            <NuxtLink
              to="/connexion"
              class="inline-block py-1.5 hover:text-fg"
            >
              Se connecter
            </NuxtLink>
          </li>
        </ul>
      </div>
    </footer>
  </div>
</template>
