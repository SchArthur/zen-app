<script setup lang="ts">
import { BILLING_UNIT, PLANS, findPlan, formatPrice } from '#shared/utils/plans'
import type { Plan } from '../../lib/generated/prisma/enums.js'

/**
 * CU-15 — Souscrire un abonnement. Fonction F11, tâche 7.3.
 *
 * Écran du **responsable RH**, seul titulaire d'un compte parmi les décideurs
 * (`cas-utilisation.md` §2.5). Le donneur d'ordre décide de l'achat mais ne se
 * connecte jamais : ajouter un acteur qui ne touche pas au logiciel aurait
 * modélisé un processus commercial, pas un système.
 *
 * Les formules affichées ici sont **exactement** celles de la page publique —
 * même source, même prix, même contenu, mêmes exclusions. Un écran de
 * souscription qui redécrirait l'offre finirait par la décrire autrement, et
 * c'est précisément entre les deux descriptions que se glisse un litige.
 *
 * Aucune donnée bancaire ne passe par cet écran ni par l'application : le bouton
 * ouvre un tunnel hébergé par le prestataire, et l'abonnement naît de la
 * notification qu'il renvoie (critère mesurable de F11).
 */
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Abonnement' })

const route = useRoute()
const router = useRouter()

const { data, error, refresh } = await useFetch('/api/billing/subscription')

if (error.value) {
  const apiError = toApiError(error.value)
  throw createError({
    statusCode: (error.value as { statusCode?: number }).statusCode ?? 502,
    statusMessage: apiError.message,
    data: { code: apiError.code },
  })
}

if (!data.value) {
  throw createError({ statusCode: 502, statusMessage: 'L\'état de votre abonnement n\'a pas pu être chargé. Réessayez dans un instant.', data: { code: 'FETCH_ERROR' } })
}

const state = computed(() => data.value!)
const subscription = computed(() => state.value.subscription)
const currentOffer = computed(() => (subscription.value ? findPlan(subscription.value.plan) : null))
const display = computed(() => (subscription.value ? subscriptionDisplays[subscription.value.status] : null))

const feedback = reactive({ tone: 'info' as 'info' | 'success' | 'warning' | 'danger', message: '' })
const pending = ref<Plan | 'portal' | null>(null)

/**
 * Retour du tunnel de paiement.
 *
 * Le prestataire ramène ici avec l'identifiant de la session payée. On le lui
 * repasse pour qu'il relise la session **à la source** : l'écran affiche alors
 * l'abonnement réel dès le retour, sans attendre la notification — qui reste le
 * chemin qui fait foi, et le seul qui fonctionne quand l'onglet a été fermé.
 *
 * Les paramètres sont retirés de l'adresse une fois traités. Sans cela, un
 * rafraîchissement rejouerait la confirmation, et l'adresse recopiée dans un
 * courriel porterait un identifiant de session — qui n'a rien à faire ailleurs
 * que dans le navigateur de qui vient de payer.
 */
onMounted(async () => {
  const outcome = route.query.paiement
  const sessionId = route.query.session

  if (!outcome) return

  await router.replace({ query: {} })

  if (outcome === 'annule') {
    feedback.tone = 'info'
    feedback.message = 'Souscription abandonnée. Rien n\'a été prélevé.'
    return
  }

  if (outcome !== 'succes' || typeof sessionId !== 'string') return

  try {
    const result = await $fetch('/api/billing/confirm', { method: 'POST', body: { session: sessionId } })

    if (result.applied) {
      feedback.tone = 'success'
      feedback.message = 'Paiement accepté, votre abonnement est actif.'
    }
    else {
      feedback.tone = 'info'
      feedback.message = 'Le paiement est en cours de traitement. Cet écran se mettra à jour dès qu\'il aboutit.'
    }
  }
  catch (requestError) {
    // L'échec de la confirmation n'est pas l'échec du paiement : la
    // notification, elle, arrivera. Le message le dit plutôt que d'annoncer un
    // refus qui n'a pas eu lieu.
    feedback.tone = 'warning'
    feedback.message = `${toApiError(requestError).message} Si le paiement a été accepté, votre abonnement s'activera d'ici quelques instants.`
  }
  finally {
    await refresh()
  }
})

async function subscribe(plan: Plan) {
  pending.value = plan
  feedback.message = ''

  try {
    const { url } = await $fetch('/api/billing/checkout', { method: 'POST', body: { plan } })

    // Navigation de premier plan, et non redirection suivie par `fetch` : le
    // tunnel doit s'ouvrir devant l'utilisateur, pas dans une réponse que
    // personne ne regarde.
    await navigateTo(url, { external: true })
  }
  catch (requestError) {
    feedback.tone = 'danger'
    feedback.message = toApiError(requestError).message
    pending.value = null
  }
}

async function openPortal() {
  pending.value = 'portal'
  feedback.message = ''

  try {
    const { url } = await $fetch('/api/billing/portal', { method: 'POST' })
    await navigateTo(url, { external: true })
  }
  catch (requestError) {
    feedback.tone = 'danger'
    feedback.message = toApiError(requestError).message
    pending.value = null
  }
}
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
        Abonnement
      </h1>
      <p class="mt-1.5 max-w-prose text-label/[1.4] font-medium text-fg-muted lg:text-sm/[1.4]">
        Les formules sont facturées {{ BILLING_UNIT }}, hors taxes. Votre entreprise compte
        aujourd'hui <strong class="font-bold text-fg">{{ state.seats }}</strong>
        <!-- Les deux mots s'accordent : `plural` ajouterait sinon le `s` au
             seul dernier — « 10 compte confirmés », le même défaut d'accord que
             « 1 pauses prises » corrigé au lot 6. -->
        {{ plural(state.seats, 'compte confirmé', 'comptes confirmés') }}.
      </p>
    </header>

    <AppAlert
      v-if="feedback.message"
      :tone="feedback.tone"
      role="status"
      class="mb-5"
    >
      {{ feedback.message }}
    </AppAlert>

    <!-- Un environnement sans clés le dit, plutôt que d'offrir un bouton qui
         échoue. C'est le cas du poste d'un relecteur qui clone le dépôt. -->
    <AppAlert
      v-if="!state.configured"
      tone="warning"
      role="status"
      class="mb-5"
    >
      Le paiement en ligne n'est pas configuré sur cet environnement : la
      souscription est présentée mais ne peut pas aboutir.
    </AppAlert>

    <!-- ── Abonnement en cours ───────────────────────────────────────────── -->
    <section
      v-if="subscription && display"
      class="mb-8 rounded-3xl bg-surface px-6 py-6 shadow-card lg:px-7"
    >
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-caption font-bold tracking-eyebrow text-fg-faint uppercase">
            Formule en cours
          </p>
          <h2 class="mt-2 font-display text-[1.5rem]/[1.1] text-fg">
            ZenTime {{ currentOffer?.name ?? subscription.plan }}
          </h2>
          <p class="mt-2 text-label/[1.5] text-fg-muted">
            {{ subscription.seats }} {{ plural(subscription.seats, 'poste') }} facturés<template v-if="formatPeriodEnd(subscription.currentPeriodEnd)">,
              période en cours jusqu'au {{ formatPeriodEnd(subscription.currentPeriodEnd) }}</template>.
          </p>
        </div>

        <button
          v-if="state.canManage"
          type="button"
          :disabled="pending !== null"
          class="shrink-0 rounded-xl bg-fg px-4.5 py-3 text-label/none font-bold text-white transition-colors hover:bg-mist-900 disabled:cursor-not-allowed disabled:opacity-60"
          @click="openPortal"
        >
          {{ pending === 'portal' ? 'Ouverture…' : 'Gérer l\'abonnement' }}
        </button>

        <!-- Un abonnement sans fiche client chez le prestataire n'est pas une
             anomalie : c'est celui qui n'a pas été souscrit en ligne — un
             pilote ouvert à la main, un partenariat, le jeu de données de
             démonstration. Il n'y a alors rien à gérer ici, et le dire vaut
             mieux qu'un bouton absent sans explication. -->
        <p
          v-else
          class="max-w-xs shrink-0 text-caption/[1.5] text-fg-faint"
        >
          Cet abonnement n'a pas été souscrit en ligne : il n'y a pas de
          facturation à gérer depuis cet écran.
        </p>
      </div>

      <AppAlert
        :tone="display.tone"
        role="status"
        class="mt-5"
      >
        <strong class="font-bold">{{ display.label }}.</strong> {{ display.detail }}
      </AppAlert>
    </section>

    <!-- ── Les formules ──────────────────────────────────────────────────── -->
    <section>
      <h2 class="font-display text-[1.375rem]/[1.15] text-fg">
        {{ subscription ? 'Les formules' : 'Choisir une formule' }}
      </h2>

      <ul class="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <li
          v-for="plan in PLANS"
          :key="plan.id"
          class="flex flex-col rounded-3xl px-6 py-6 lg:px-7"
          :class="subscription?.plan === plan.id
            ? 'bg-accent-soft ring-1 ring-accent-muted'
            : 'bg-surface shadow-card'"
        >
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="text-label font-bold text-fg-muted">
              {{ plan.name }}
            </h3>
            <span
              v-if="subscription?.plan === plan.id"
              class="rounded-full bg-surface px-2.5 py-1 text-caption font-bold text-accent-strong"
            >
              Votre formule
            </span>
          </div>

          <p class="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span class="font-display text-[2.25rem]/none text-fg">{{ formatPrice(plan.pricePerSeat) }}</span>
            <span class="text-caption/[1.4] font-semibold text-fg-muted">HT {{ BILLING_UNIT }}</span>
          </p>

          <!-- Ce que la souscription coûterait aujourd'hui. Le prestataire
               recomptera les postes à chaque échéance ; ce montant est celui de
               la première, pas un engagement. -->
          <p class="mt-2 text-caption/[1.5] text-fg-faint">
            Soit {{ formatPrice(plan.pricePerSeat * state.seats) }} HT par mois pour
            {{ state.seats }} {{ plural(state.seats, 'poste') }}.
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

          <button
            v-if="state.canSubscribe"
            type="button"
            :disabled="!state.configured || pending !== null"
            class="mt-6 rounded-lg bg-accent px-5 py-3.25 text-center text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            @click="subscribe(plan.id)"
          >
            {{ pending === plan.id ? 'Ouverture du paiement…' : `Souscrire à ${plan.name}` }}
          </button>

          <!-- Changer de formule n'est pas une nouvelle souscription : c'est la
               modification de l'abonnement en cours, avec son calcul de prorata.
               Elle appartient au portail client. -->
          <p
            v-else
            class="mt-6 text-caption/[1.5] text-fg-faint"
          >
            {{ subscription?.plan === plan.id
              ? 'Formule en cours.'
              : 'Le changement de formule se fait depuis « Gérer l\'abonnement ».' }}
          </p>
        </li>
      </ul>

      <!-- F11, critère mesurable : « conditions générales et mentions légales
           accessibles avant paiement ». Le lien est au-dessus du tunnel, pas
           dans un pied de page qu'on atteint après. -->
      <p class="mt-6 max-w-prose text-caption/[1.55] text-fg-faint">
        Le paiement est traité par notre prestataire : aucune donnée bancaire ne
        transite par ZenTime ni n'y est conservée. Le traitement de vos données
        est décrit dans la
        <NuxtLink
          to="/confidentialite"
          class="underline underline-offset-2 hover:text-fg-muted"
        >
          politique de confidentialité</NuxtLink>, et la facturation suit le nombre de
        collaborateurs qui ont confirmé leur compte — jamais l'effectif de
        l'entreprise.
      </p>
    </section>
  </div>
</template>
