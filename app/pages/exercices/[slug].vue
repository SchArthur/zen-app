<script setup lang="ts">
import {
  exerciseTypeLabels,
  exerciseTypeTones,
  formatExerciseDuration,
} from '../../utils/exercises'

// CU-08 — fiche détaillée ; CU-08.1 — déclarer l'exercice réalisé.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data, error, refresh } = await useFetch(() => `/api/exercises/${slug.value}`)

/**
 * Un exercice inconnu ou retiré du catalogue donne une vraie page 404, et non un
 * écran vide : l'adresse d'une fiche circule entre collègues, et un exercice
 * retiré doit se dire, pas se deviner.
 */
if (error.value) {
  const apiError = toApiError(error.value)
  throw createError({
    statusCode: (error.value as { statusCode?: number }).statusCode ?? 502,
    statusMessage: apiError.message,
    data: { code: apiError.code },
  })
}

if (!data.value) {
  throw createError({ statusCode: 502, statusMessage: 'Cette fiche n\'a pas pu être chargée. Réessayez dans un instant.', data: { code: 'FETCH_ERROR' } })
}

const exercise = computed(() => data.value!.exercise)
const activity = computed(() => data.value?.activity ?? null)
const related = computed(() => data.value?.related ?? [])
const windowDays = computed(() => data.value?.windowDays ?? 28)

useSeoMeta({ title: () => exercise.value.title })

const message = ref('')
const tone = ref<'success' | 'danger'>('success')
const pending = ref(false)

async function markDone() {
  pending.value = true
  message.value = ''

  try {
    const { repeated } = await $fetch(`/api/exercises/${slug.value}/log`, { method: 'POST' })

    tone.value = 'success'
    message.value = repeated
      ? 'C\'était déjà enregistré à l\'instant. Rien n\'a été compté deux fois.'
      : 'Exercice enregistré. Il apparaîtra dans vos statistiques.'
  }
  catch (requestError) {
    tone.value = 'danger'
    message.value = toApiError(requestError).message
  }
  finally {
    await refresh()
    pending.value = false
  }
}
</script>

<template>
  <div>
    <header class="mb-6">
      <NuxtLink
        to="/exercices"
        class="text-caption font-bold text-accent-strong underline underline-offset-2"
      >
        ← Retour au catalogue
      </NuxtLink>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span
          class="rounded-full px-2.75 py-1.5 text-caption/none font-bold"
          :class="exerciseTypeTones[exercise.type].chip"
        >
          {{ exerciseTypeLabels[exercise.type] }}
        </span>
        <span class="text-caption font-semibold text-fg-faint">
          {{ formatExerciseDuration(exercise.durationMin) }} · au poste, sans matériel
        </span>
      </div>

      <h1 class="mt-2.5 font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
        {{ exercise.title }}
      </h1>
      <p class="mt-1.5 max-w-prose text-label/[1.5] font-medium text-fg-muted lg:text-sm/[1.5]">
        {{ exercise.description }}
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
      <!-- Déroulé — c'est la raison d'être de la fiche (F4). -->
      <section class="rounded-3xl bg-surface px-6.5 py-6 shadow-card lg:col-span-2">
        <h2 class="text-label font-bold text-fg-subtle">Déroulé</h2>

        <ol class="mt-4.5 flex flex-col gap-4">
          <li
            v-for="(step, index) in exercise.steps"
            :key="index"
            class="flex gap-4"
          >
            <!-- Le numéro est décoratif : la liste est déjà ordonnée, un lecteur
                 d'écran annonce « 3 sur 5 » sans qu'on le lui répète. -->
            <span
              aria-hidden="true"
              class="flex size-7.5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-label font-bold text-accent-strong"
            >
              {{ index + 1 }}
            </span>
            <p class="pt-1 text-sm/[1.55] text-fg-soft">
              {{ step }}
            </p>
          </li>
        </ol>

        <p class="mt-6 rounded-xl bg-surface-soft px-4.5 py-3.5 text-caption/[1.5] text-fg-muted">
          Arrêtez-vous si un mouvement est douloureux ou vous met mal à l'aise. ZenTime
          propose des gestes de confort au poste de travail : ce n'est ni un traitement,
          ni un avis médical.
        </p>
      </section>

      <div class="flex flex-col gap-5">
        <!-- Déclaration -->
        <section
          class="flex flex-col rounded-3xl bg-linear-120 px-6 py-5.5 shadow-soft"
          :class="exerciseTypeTones[exercise.type].halo"
        >
          <h2 class="text-label font-bold text-fg-subtle">C'est fait ?</h2>
          <p class="mt-2 text-label/[1.5] text-fg-muted">
            Un seul geste : la réalisation est horodatée par le serveur et rejoint vos
            statistiques.
          </p>

          <button
            type="button"
            :disabled="pending"
            class="mt-4.5 rounded-lg bg-fg px-5 py-3.25 text-sm/none font-bold text-white transition-colors hover:bg-mist-900 disabled:cursor-not-allowed disabled:opacity-60"
            @click="markDone"
          >
            {{ pending ? 'Enregistrement…' : 'Je l\'ai fait' }}
          </button>
        </section>

        <!-- Historique personnel -->
        <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
          <h2 class="text-label font-bold text-fg-subtle">Vos réalisations</h2>

          <template v-if="activity">
            <p class="mt-3 font-display text-3xl/[1.1] text-fg">
              {{ activity.count }} fois
            </p>
            <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
              ces {{ windowDays }} derniers jours{{ activity.doneToday ? ', dont aujourd\'hui' : '' }}
            </p>
          </template>

          <p
            v-else
            class="mt-3 text-label/[1.5] text-fg-muted"
          >
            Vous ne l'avez pas encore fait. Il n'y a pas de mauvais moment pour commencer.
          </p>
        </section>

        <!-- Voisins de la même famille -->
        <section
          v-if="related.length"
          class="rounded-3xl bg-surface px-6 py-5.5 shadow-card"
        >
          <h2 class="text-label font-bold text-fg-subtle">
            Dans la même famille
          </h2>

          <ul class="mt-3 flex flex-col gap-1">
            <li
              v-for="other in related"
              :key="other.slug"
            >
              <NuxtLink
                :to="`/exercices/${other.slug}`"
                class="flex items-center justify-between gap-4 rounded-xl px-3.5 py-2.75 transition-colors hover:bg-surface-soft"
              >
                <span class="min-w-0 truncate text-label/[1.4] font-semibold text-fg-soft">
                  {{ other.title }}
                </span>
                <span class="shrink-0 text-caption font-bold tabular-nums text-fg-faint">
                  {{ formatExerciseDuration(other.durationMin) }}
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
