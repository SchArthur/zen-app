<script setup lang="ts">
import { formatCheckInDay, formatDayInitial, levelLabel, moodLevels, stressLevels } from '../utils/mood'

// CU-09 — Déclarer son humeur et son stress.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Mon humeur du jour' })

/** Deux semaines : de quoi voir une tendance sans transformer l'écran en bilan. */
const WINDOW_DAYS = 14

const { data, error, refresh } = await useFetch('/api/mood', { query: { days: WINDOW_DAYS } })

if (error.value) {
  const apiError = toApiError(error.value)
  throw createError({
    statusCode: (error.value as { statusCode?: number }).statusCode ?? 502,
    statusMessage: apiError.message,
    data: { code: apiError.code },
  })
}

if (!data.value) {
  throw createError({ statusCode: 502, statusMessage: 'Vos déclarations n\'ont pas pu être chargées. Réessayez dans un instant.' })
}

const today = computed(() => data.value?.today ?? null)
const history = computed(() => data.value?.history ?? [])
const consentWithdrawn = computed(() => data.value?.consentWithdrawn ?? false)

/** Une déclaration déjà faite ouvre le formulaire sur ses valeurs (A1). */
const mood = ref<number | null>(today.value?.mood ?? null)
const stress = ref<number | null>(today.value?.stress ?? null)

// Après enregistrement, `refresh` rapporte la valeur retenue par le serveur.
// C'est elle qui fait foi : si deux onglets déclarent en même temps, le
// formulaire se réaligne sur ce qui est réellement en base.
watch(today, (value) => {
  mood.value = value?.mood ?? null
  stress.value = value?.stress ?? null
})

const errors = ref<Record<string, string[]>>({})
const message = ref('')
const tone = ref<'success' | 'danger'>('success')
const pending = ref(false)

/**
 * Les deux échelles vont ensemble.
 *
 * Le refus est prononcé ici, avant l'appel réseau, et rattaché au champ manquant
 * plutôt qu'au formulaire : c'est la même forme de message que celle du serveur,
 * qui répond par champ. L'utilisateur voit ce qu'il lui reste à faire, pas qu'il
 * s'est trompé.
 */
function validate() {
  const found: Record<string, string[]> = {}

  if (mood.value === null) found.mood = ['Choisissez un niveau d\'humeur.']
  if (stress.value === null) found.stress = ['Choisissez un niveau de stress.']

  errors.value = found

  return Object.keys(found).length === 0
}

async function submit() {
  message.value = ''

  if (!validate()) return

  pending.value = true

  try {
    await $fetch('/api/mood/today', {
      method: 'PUT',
      body: { mood: mood.value, stress: stress.value },
    })

    tone.value = 'success'
    message.value = today.value
      ? 'Déclaration corrigée. C\'est la nouvelle valeur qui est conservée.'
      : 'Déclaration enregistrée. Merci — elle ne sera jamais montrée individuellement.'
    errors.value = {}
  }
  catch (requestError) {
    const apiError = toApiError(requestError)
    tone.value = 'danger'
    message.value = apiError.message
    errors.value = apiError.errors
  }
  finally {
    await refresh()
    pending.value = false
  }
}

/** Série chronologique complétée : les journées sans déclaration restent vides. */
const trend = computed(() =>
  history.value.map(entry => ({
    ...entry,
    initial: formatDayInitial(entry.date),
    label: formatCheckInDay(entry.date),
  })),
)

/**
 * Moyenne des seules journées déclarées.
 *
 * Rapportée aux quatorze jours, elle intégrerait les week-ends et les jours sans
 * déclaration comme s'ils valaient zéro — ce qui est justement le contresens que
 * l'alternative A2 de CU-09 demande d'éviter.
 */
const average = computed(() => {
  if (!history.value.length) return null

  const total = history.value.reduce(
    (sum, entry) => ({ mood: sum.mood + entry.mood, stress: sum.stress + entry.stress }),
    { mood: 0, stress: 0 },
  )

  return {
    mood: total.mood / history.value.length,
    stress: total.stress / history.value.length,
  }
})

function formatAverage(value: number) {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

// Un graphique n'est rien pour un lecteur d'écran : la même information est
// donnée sous forme de phrase.
const trendSummary = computed(() =>
  `Humeur des ${WINDOW_DAYS} derniers jours, sur 5 : ${trend.value.map(entry => `${entry.label}, ${entry.mood}`).join(' ; ')}.`,
)
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
        Mon humeur du jour
      </h1>
      <p class="mt-1.5 max-w-prose text-label/[1.4] font-medium text-mist-600 lg:text-sm/[1.4]">
        Deux curseurs, dix secondes. Vos réponses ne sont jamais montrées individuellement :
        elles ne servent qu'à vos propres statistiques et à des moyennes d'équipe, à partir
        de cinq personnes.
      </p>
    </header>

    <AppAlert
      v-if="message"
      :role="tone === 'danger' ? 'alert' : 'status'"
      :tone="tone"
      class="mb-5"
    >
      {{ message }}
    </AppAlert>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- Formulaire -->
      <section class="rounded-3xl bg-surface px-6.5 py-6 shadow-card lg:col-span-2">
        <!-- Exception E1 de CU-09 : consentement retiré, le formulaire n'est plus
             proposé. Le dire, plutôt que l'afficher et refuser à l'envoi. -->
        <template v-if="consentWithdrawn">
          <h2 class="font-display text-xl/[1.2] text-fg">
            Le suivi de votre bien-être est désactivé
          </h2>
          <p class="mt-2 max-w-prose text-label/[1.55] text-fg-muted">
            Vous avez retiré votre consentement au traitement de vos données de bien-être.
            Tant qu'il n'est pas rétabli, aucune déclaration ne vous est demandée et aucune
            n'est enregistrée.
          </p>
          <NuxtLink
            to="/profil"
            class="mt-4.5 inline-block rounded-lg bg-surface-soft px-4 py-2.75 text-label/none font-bold text-fg-soft transition-colors hover:bg-mist-300"
          >
            Revoir mes réglages
          </NuxtLink>
        </template>

        <form
          v-else
          novalidate
          @submit.prevent="submit"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-label font-bold text-fg-subtle">
              {{ today ? 'Votre déclaration du jour' : 'Comment allez-vous aujourd\'hui ?' }}
            </h2>
            <p
              v-if="today"
              class="text-caption font-semibold text-fg-faint"
            >
              modifiable jusqu'à minuit
            </p>
          </div>

          <div class="mt-6 flex flex-col gap-8">
            <AppScale
              id="mood"
              v-model="mood"
              legend="Votre humeur"
              hint="Ce que vous ressentez maintenant, pas ce que vous devriez ressentir."
              :levels="moodLevels"
              :errors="errors.mood"
            />

            <AppScale
              id="stress"
              v-model="stress"
              legend="Votre niveau de stress"
              hint="1 pour serein, 5 pour débordé."
              :levels="stressLevels"
              :errors="errors.stress"
            />
          </div>

          <div class="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="submit"
              :disabled="pending"
              class="rounded-lg bg-accent px-5.5 py-3.25 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ pending ? 'Enregistrement…' : today ? 'Corriger ma déclaration' : 'Enregistrer' }}
            </button>

            <p
              v-if="today"
              class="text-caption/[1.5] text-fg-muted"
            >
              Actuellement : {{ levelLabel(moodLevels, today.mood) }} ·
              {{ levelLabel(stressLevels, today.stress) }}. La correction remplace la
              valeur, aucun historique des corrections n'est conservé.
            </p>
          </div>
        </form>
      </section>

      <!-- Moyennes -->
      <section class="flex flex-col rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Sur {{ WINDOW_DAYS }} jours</h2>

        <template v-if="average">
          <p class="mt-3 font-display text-3xl/[1.1] text-fg">
            {{ formatAverage(average.mood) }}
            <span class="text-xl text-fg-faint">/ 5</span>
          </p>
          <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
            humeur moyenne · stress {{ formatAverage(average.stress) }} / 5
          </p>
          <p class="mt-3.5 text-caption/[1.5] text-fg-muted">
            Calculée sur les {{ history.length }} journée{{ history.length > 1 ? 's' : '' }}
            que vous avez déclarée{{ history.length > 1 ? 's' : '' }}. Les journées sans
            déclaration ne comptent pas comme des zéros.
          </p>
        </template>

        <p
          v-else
          class="mt-3 text-label/[1.5] text-fg-muted"
        >
          Rien à afficher pour l'instant. La première déclaration ouvrira la série.
        </p>
      </section>

      <!-- Tendance -->
      <section
        v-if="trend.length"
        class="rounded-3xl bg-surface px-6 py-5.5 shadow-card lg:col-span-3"
      >
        <h2 class="text-label font-bold text-fg-subtle">Vos déclarations récentes</h2>

        <div
          class="mt-4.5 flex h-24 items-end gap-1.5"
          role="img"
          :aria-label="trendSummary"
        >
          <span
            v-for="entry in trend"
            :key="entry.date"
            class="flex-1 rounded-sm"
            :class="moodLevels[entry.mood - 1]?.tone"
            :style="{ height: `${(entry.mood / 5) * 100}%` }"
          />
        </div>

        <div
          aria-hidden="true"
          class="mt-2 flex gap-1.5"
        >
          <span
            v-for="(entry, index) in trend"
            :key="entry.date"
            class="flex-1 text-center text-caption font-semibold"
            :class="index === trend.length - 1 ? 'font-bold text-accent-strong' : 'text-mist-400'"
          >
            {{ entry.initial }}
          </span>
        </div>
      </section>
    </div>
  </div>
</template>
