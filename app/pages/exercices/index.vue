<script setup lang="ts">
import type { ExerciseType } from '../../../lib/generated/prisma/enums.js'
import {
  durationFilters,
  exerciseTypeLabels,
  exerciseTypeTones,
  exerciseTypes,
  formatExerciseDuration,
} from '../../utils/exercises'

// CU-08 — Consulter le catalogue d'exercices.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Exercices' })

const route = useRoute()
const router = useRouter()

/**
 * L'état des filtres vit dans l'URL, et nulle part ailleurs.
 *
 * Trois conséquences, toutes voulues : un catalogue filtré se partage et se met
 * en favori, le bouton « précédent » du navigateur défait un filtre, et le
 * retour depuis une fiche d'exercice retrouve la liste telle qu'elle était.
 * Un `ref` local aurait perdu les trois.
 */
const type = computed(() => {
  const value = route.query.type

  return exerciseTypes.includes(value as ExerciseType) ? value as ExerciseType : undefined
})

const maxMin = computed(() => {
  const value = Number(route.query.maxMin)

  return durationFilters.some(filter => filter.value === value) ? value : undefined
})

/**
 * Les filtres sont recopiés dans la requête serveur plutôt que transmis tels
 * quels : `route.query` peut contenir n'importe quoi, et ce qui n'a pas été
 * reconnu ci-dessus ne doit pas atteindre l'API. Le serveur revalide de son
 * côté — c'est un confort d'interface, pas un contrôle de sécurité.
 */
const { data, error, refresh } = await useFetch('/api/exercises', {
  query: computed(() => ({ type: type.value, maxMin: maxMin.value })),
})

if (error.value) {
  const apiError = toApiError(error.value)
  throw createError({
    statusCode: (error.value as { statusCode?: number }).statusCode ?? 502,
    statusMessage: apiError.message,
    data: { code: apiError.code },
  })
}

if (!data.value) {
  throw createError({ statusCode: 502, statusMessage: 'Le catalogue n\'a pas pu être chargé. Réessayez dans un instant.', data: { code: 'FETCH_ERROR' } })
}

const exercises = computed(() => data.value?.exercises ?? [])
const countsByType = computed(() => data.value?.countsByType ?? {})
const favoriteTypes = computed(() => data.value?.favoriteTypes ?? [])
const doneToday = computed(() => data.value?.doneToday ?? 0)
const windowDays = computed(() => data.value?.windowDays ?? 28)

/** Nombre total d'exercices à durée donnée, toutes familles confondues. */
const totalForDuration = computed(() =>
  Object.values(countsByType.value).reduce((total, count) => total + count, 0),
)

/**
 * Écrit un filtre dans l'URL. `undefined` le retire au lieu de le poser à vide :
 * `?type=` traînerait dans l'adresse sans rien vouloir dire.
 */
function setFilter(patch: Record<string, string | number | undefined>) {
  const query = Object.fromEntries(
    Object.entries({ ...route.query, ...patch })
      .filter(([, value]) => value !== undefined && value !== ''),
  )

  return router.push({ query })
}

function toggleType(value: ExerciseType) {
  return setFilter({ type: type.value === value ? undefined : value })
}

function toggleDuration(value: number) {
  return setFilter({ maxMin: maxMin.value === value ? undefined : value })
}

const message = ref('')
const tone = ref<'success' | 'danger'>('success')
const pending = ref('')

/**
 * CU-08.1 — déclarer une réalisation depuis la carte, sans ouvrir la fiche.
 *
 * F4 demande une réalisation enregistrable « en une interaction depuis la
 * fiche ». La proposer aussi depuis la liste ne coûte rien et évite un
 * aller-retour à qui connaît déjà l'exercice par cœur.
 *
 * L'état est relu dans tous les cas : c'est ce qui remet la carte d'aplomb quand
 * la déclaration a déjà été faite depuis un autre onglet.
 */
async function markDone(slug: string, title: string) {
  pending.value = slug
  message.value = ''

  try {
    const { repeated } = await $fetch(`/api/exercises/${slug}/log`, { method: 'POST' })

    tone.value = 'success'
    message.value = repeated
      ? `« ${title} » était déjà enregistré à l'instant. Rien n'a été compté deux fois.`
      : `« ${title} » enregistré. Bien joué.`
  }
  catch (requestError) {
    tone.value = 'danger'
    message.value = toApiError(requestError).message
  }
  finally {
    await refresh()
    pending.value = ''
  }
}
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
        Exercices
      </h1>
      <p class="mt-1.5 text-label/[1.4] font-medium text-fg-muted lg:text-sm/[1.4]">
        Tout se fait au poste, sans matériel. Choisissez d'abord le temps que vous avez.
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

    <!-- Filtres. Des boutons et non un formulaire : chaque clic navigue, il n'y
         a rien à valider. -->
    <section
      aria-labelledby="filtres"
      class="mb-5 rounded-3xl bg-surface px-5.5 py-5 shadow-card"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="filtres"
          class="text-label font-bold text-fg-subtle"
        >
          Filtrer le catalogue
        </h2>
        <p class="text-caption font-semibold text-fg-faint">
          {{ exercises.length }} exercice{{ exercises.length > 1 ? 's' : '' }}
          sur {{ totalForDuration }}
          <template v-if="doneToday">
            · {{ doneToday }} fait{{ doneToday > 1 ? 's' : '' }} aujourd'hui
          </template>
        </p>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          v-for="value in exerciseTypes"
          :key="value"
          type="button"
          :aria-pressed="type === value"
          class="flex items-center gap-2 rounded-lg px-3.5 py-2.25 text-label/none font-semibold transition-colors"
          :class="type === value
            ? 'bg-fg text-white'
            : 'bg-surface-soft text-fg-soft hover:bg-mist-300'"
          @click="toggleType(value)"
        >
          <span
            aria-hidden="true"
            class="size-2 rounded-full"
            :class="exerciseTypeTones[value].dot"
          />
          {{ exerciseTypeLabels[value] }}
          <span class="font-bold tabular-nums opacity-60">{{ countsByType[value] ?? 0 }}</span>
        </button>

        <span
          aria-hidden="true"
          class="mx-1 hidden w-px self-stretch bg-border-strong sm:block"
        />

        <button
          v-for="filter in durationFilters"
          :key="filter.value"
          type="button"
          :aria-pressed="maxMin === filter.value"
          class="rounded-lg px-3.5 py-2.25 text-label/none font-semibold transition-colors"
          :class="maxMin === filter.value
            ? 'bg-fg text-white'
            : 'bg-surface-soft text-fg-soft hover:bg-mist-300'"
          @click="toggleDuration(filter.value)"
        >
          {{ filter.label }}
        </button>
      </div>

      <!-- Rappel de ce que le profil a retenu. Aucune conséquence sur la liste :
           une préférence cochée un jour ne doit pas restreindre le catalogue. -->
      <p
        v-if="favoriteTypes.length"
        class="mt-3.5 text-caption/[1.5] text-fg-muted"
      >
        Vous avez retenu
        {{ favoriteTypes.map(favorite => exerciseTypeLabels[favorite].toLowerCase()).join(' et ') }}
        dans
        <NuxtLink
          to="/profil"
          class="font-semibold text-accent-strong underline underline-offset-2"
        >
          vos préférences
        </NuxtLink>. Le catalogue reste entier.
      </p>
    </section>

    <ul
      v-if="exercises.length"
      class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
    >
      <li
        v-for="exercise in exercises"
        :key="exercise.id"
        class="flex flex-col rounded-3xl bg-surface px-6 py-5.5 shadow-card"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-full px-2.75 py-1.5 text-caption/none font-bold"
            :class="exerciseTypeTones[exercise.type].chip"
          >
            {{ exerciseTypeLabels[exercise.type] }}
          </span>
          <span class="text-caption font-semibold text-fg-faint">
            {{ formatExerciseDuration(exercise.durationMin) }}
          </span>
          <span
            v-if="favoriteTypes.includes(exercise.type)"
            class="ml-auto text-caption font-bold text-accent-strong"
          >
            Dans vos préférences
          </span>
        </div>

        <h2 class="mt-3 font-display text-xl/[1.2] text-fg">
          <!-- Le lien porte le titre : c'est ce qu'annonce un lecteur d'écran
               quand il liste les liens de la page. -->
          <NuxtLink
            :to="`/exercices/${exercise.slug}`"
            class="underline-offset-4 hover:underline"
          >
            {{ exercise.title }}
          </NuxtLink>
        </h2>

        <p class="mt-2 text-label/[1.55] text-fg-muted">
          {{ exercise.description }}
        </p>

        <p
          v-if="exercise.activity"
          class="mt-3 text-caption font-semibold"
          :class="exercise.activity.doneToday ? 'text-accent-strong' : 'text-fg-faint'"
        >
          {{ exercise.activity.doneToday ? 'Fait aujourd\'hui' : `Fait ${exercise.activity.count} fois` }}
          <span
            v-if="!exercise.activity.doneToday"
            class="font-medium"
          >
            ces {{ windowDays }} derniers jours
          </span>
        </p>

        <div class="mt-auto flex flex-wrap gap-2.5 pt-4.5">
          <NuxtLink
            :to="`/exercices/${exercise.slug}`"
            class="rounded-lg bg-accent px-4 py-2.75 text-label/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
          >
            Voir le déroulé
          </NuxtLink>
          <button
            type="button"
            :disabled="pending === exercise.slug"
            class="rounded-lg bg-surface-soft px-4 py-2.75 text-label/none font-bold text-fg-soft transition-colors hover:bg-mist-300 disabled:cursor-not-allowed disabled:opacity-60"
            @click="markDone(exercise.slug, exercise.title)"
          >
            {{ pending === exercise.slug ? 'Enregistrement…' : 'Je l\'ai fait' }}
          </button>
        </div>
      </li>
    </ul>

    <p
      v-else
      class="rounded-3xl bg-surface px-6 py-5.5 text-label/[1.5] text-fg-muted shadow-card"
    >
      Aucun exercice ne correspond à ces filtres. Élargissez la durée, ou
      <button
        type="button"
        class="font-bold text-accent-strong underline underline-offset-2"
        @click="setFilter({ type: undefined, maxMin: undefined })"
      >
        affichez tout le catalogue
      </button>.
    </p>
  </div>
</template>
