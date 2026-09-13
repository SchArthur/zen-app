<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * Page d'erreur de l'application.
 *
 * Sans ce fichier, Nuxt sert sa propre page — titrée « … | Nuxt », hors de la
 * charte, et en production réduite à un message générique. Or les messages
 * d'erreur du produit sont **écrits** : « Cet exercice n'existe pas ou n'est
 * plus proposé », « Vous n'avez pas accès à cette ressource ». Les rédiger avec
 * soin dans les gestionnaires de route pour les afficher ensuite sur une page
 * qui n'est pas la nôtre revenait à perdre le travail au dernier mètre.
 *
 * La page couvre les quatre cas que l'application produit réellement :
 *
 * - **401** — session absente ou expirée. Elle mène à la connexion, en gardant
 *   l'adresse demandée pour y revenir après (même paramètre `suite` que le
 *   middleware de route).
 * - **402** — la formule souscrite par l'entreprise ne comprend pas cet écran
 *   (CU-15). Distinct du 403 à dessein : « pas vous » n'a pas d'issue, « pas
 *   encore payé » en a une, et la page mène alors aux formules.
 * - **403** — rôle insuffisant (matrice des accès, `cas-utilisation.md` §6).
 *   La page ne nomme pas le rôle attendu, comme `assertRole` : l'indiquer
 *   renseignerait sur l'organisation interne de l'entreprise.
 * - **404** — adresse inconnue, ou exercice retiré du catalogue.
 * - **le reste** — panne. On propose de réessayer, ce qui est la seule action
 *   utile, plutôt que de laisser l'utilisateur devant un cul-de-sac.
 *
 * Le message du serveur n'est repris que s'il **vient de nous**, et le signe
 * en est `data.code` : nos `createError` en portent un, la couche basse non.
 * Sans ce filtre, une adresse inconnue affichait « Page not found:
 * /page-qui-nexiste-pas » — le message anglais du routeur de Nuxt, sur une page
 * française. Et une erreur non maîtrisée pourrait tout aussi bien porter un nom
 * de table ou un chemin de fichier, qui n'ont rien à faire sous les yeux d'un
 * utilisateur et renseignent qui sonde l'application.
 */
const props = defineProps<{ error: NuxtError }>()

const status = computed(() => props.error.statusCode ?? 500)

const titles: Record<number, string> = {
  401: 'Votre session a expiré',
  402: 'Cet écran demande une autre formule',
  403: 'Cette page ne vous est pas ouverte',
  404: 'Cette page n\'existe pas',
}

/** Repli écrit pour chaque cas, quand le serveur n'a rien fourni de lisible. */
const details: Record<number, string> = {
  401: 'Reconnectez-vous pour reprendre là où vous en étiez.',
  402: 'L\'abonnement de votre entreprise ne comprend pas cette fonction.',
  403: 'Votre rôle ne donne pas accès à cet écran.',
  404: 'L\'adresse demandée ne correspond à aucun écran de ZenTime.',
}

const title = computed(() => titles[status.value] ?? 'Quelque chose s\'est mal passé')

/** Notre propre message, reconnaissable au code stable qui l'accompagne. */
const ours = computed(() =>
  typeof props.error.data === 'object' && props.error.data !== null
    ? Boolean((props.error.data as { code?: string }).code)
    : false,
)

const detail = computed(() => {
  if (ours.value && props.error.message) return props.error.message

  return details[status.value]
    ?? 'L\'application n\'a pas pu répondre. Ce n\'est pas de votre fait : réessayez dans un instant.'
})

const { loggedIn, user } = useUserSession()

const route = useRoute()

/**
 * Où renvoyer la personne.
 *
 * Une session expirée mène à la connexion, avec l'adresse demandée en `suite` —
 * c'est ce que fait déjà le middleware `auth`, et l'erreur ne doit pas défaire
 * ce que la navigation normale sait faire. Les autres cas ramènent à un écran
 * sur lequel il est possible d'agir.
 */
const home = computed(() => {
  if (status.value === 401) {
    return { label: 'Se reconnecter', to: `/connexion?suite=${encodeURIComponent(route.fullPath)}` }
  }

  // 402 mène là où l'on peut y remédier. C'est toute la raison d'avoir
  // distingué « pas payé » de « pas vous » : un 403 n'a pas d'issue, un 402 si.
  // Encore faut-il que celui qui lit puisse s'en servir — l'écran de
  // souscription est réservé au responsable RH (CU-15), et y envoyer un
  // collaborateur le mènerait d'un refus à un autre.
  if (status.value === 402 && user.value?.role === 'HR') {
    return { label: 'Voir les formules', to: '/tarifs' }
  }

  return loggedIn.value
    ? { label: 'Retour à mon tableau de bord', to: '/tableau-de-bord' }
    : { label: 'Retour à l\'accueil', to: '/' }
})

useSeoMeta({
  title: title.value,
  // Une page d'erreur n'a rien à faire dans un index de moteur de recherche.
  robots: 'noindex, nofollow',
})

/** `clearError` défait l'état d'erreur avant de naviguer, sinon elle persiste. */
function leave() {
  return clearError({ redirect: home.value.to })
}
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center px-5 py-10">
    <div class="w-full max-w-md">
      <div class="mb-7 flex flex-col items-center gap-2.5 text-center">
        <AppLogo
          animated
          large
        />
        <p class="font-display text-lg text-fg-muted italic">
          Bien-être &amp; santé au travail
        </p>
      </div>

      <div class="rounded-3xl bg-surface px-6 py-7 text-center shadow-card sm:px-8">
        <!-- Le code est une information secondaire : il sert à en parler au
             support, pas à comprendre ce qui se passe. D'où sa discrétion. -->
        <p class="text-caption font-bold tracking-eyebrow text-fg-faint uppercase">
          Erreur {{ status }}
        </p>

        <h1 class="mt-3 font-display text-[1.625rem]/[1.15] text-fg">
          {{ title }}
        </h1>

        <p class="mt-3 text-label/[1.55] text-fg-muted">
          {{ detail }}
        </p>

        <button
          type="button"
          class="mt-6 w-full rounded-lg bg-accent px-5 py-3.25 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
          @click="leave"
        >
          {{ home.label }}
        </button>
      </div>
    </div>
  </main>
</template>
