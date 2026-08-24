<script setup lang="ts">
import { formatDuration } from '../utils/breaks'
import { plural } from '../utils/text'
import { exerciseTypeLabels, exerciseTypeTones, formatExerciseDuration } from '../utils/exercises'
import { formatCheckInDay, formatDayInitial, levelLabel, moodLevels, stressLevels } from '../utils/mood'
import { APP_TIME_ZONE } from '#shared/utils/time'

// CU-10 — Consulter ses recommandations ; CU-11 — l'état du jour.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Tableau de bord' })

const { user } = useUserSession()

const { data, error, refresh } = await useFetch('/api/dashboard')

if (error.value) {
  const apiError = toApiError(error.value)
  throw createError({
    statusCode: (error.value as { statusCode?: number }).statusCode ?? 502,
    statusMessage: apiError.message,
    data: { code: apiError.code },
  })
}

if (!data.value) {
  throw createError({ statusCode: 502, statusMessage: 'Votre tableau de bord n\'a pas pu être chargé. Réessayez dans un instant.' })
}

const breaks = computed(() => data.value!.breaks)
const preferences = computed(() => data.value?.preferences ?? null)
const recommendation = computed(() => data.value?.recommendation ?? null)
const moodToday = computed(() => data.value?.mood.today ?? null)
const moodWeek = computed(() => data.value?.mood.week ?? [])
const doneToday = computed(() => data.value?.exercises.doneToday ?? 0)
const running = computed(() => Boolean(breaks.value.current))

/** Horloge de la page : une seule pour le rappel et pour le temps assis. */
const now = ref(new Date())
const mounted = ref(false)
let ticker: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  mounted.value = true
  // Une minute suffit : rien sur cet écran ne se compte à la seconde, et le
  // minuteur, lui, vit sur /pauses.
  ticker = setInterval(() => {
    now.value = new Date()
  }, 60_000)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})

const today = useState('dashboard-date', () => {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: APP_TIME_ZONE,
  }).format(new Date())

  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
})

const lastEndedAt = computed(() => breaks.value.lastEndedAt ? new Date(breaks.value.lastEndedAt) : null)

const { dueAt: reminderDueAt, withinWorkHours } = useBreakReminder({
  now,
  preferences,
  lastEndedAt,
  running,
})

/** Instant où la valeur du serveur a été reçue, pour la faire avancer ensuite. */
const loadedAt = ref(new Date())

watch(data, () => {
  loadedAt.value = new Date()
})

/**
 * Temps assis d'affilée.
 *
 * La valeur de départ vient du serveur : c'est lui qui sait où commence la
 * journée déclarée, et la recalculer à l'hydratation la ferait diverger. Ensuite
 * l'horloge de la page l'avance, sans jamais refaire le calcul — on ajoute le
 * temps écoulé depuis la réponse, ce qui reste juste même si l'onglet est resté
 * en veille.
 */
const sittingMin = computed(() => {
  const base = data.value?.sitting?.minutes

  if (base === undefined) return null
  if (!mounted.value) return base

  return base + Math.max(0, Math.floor((now.value.getTime() - loadedAt.value.getTime()) / 60_000))
})

/** Ce qui est écrit sous le compteur doit dire d'où il part. */
const sittingCaption = computed(() =>
  data.value?.sitting?.basis === 'break'
    ? 'depuis votre dernière pause'
    : 'depuis le début de votre journée',
)

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`

  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

const nextBreakLabel = computed(() => {
  if (running.value) return 'pause en cours'
  if (!preferences.value?.remindersEnabled) return 'rappels désactivés'

  const at = reminderDueAt.value

  if (!at) return '—'

  const minutes = Math.round((at.getTime() - now.value.getTime()) / 60_000)

  if (minutes > 0) return `dans ${formatMinutes(minutes)}`

  return withinWorkHours.value ? 'maintenant' : 'demain'
})

/** Raccourcis mobiles : le catalogue, déjà filtré sur une famille (CU-08). */
const quickActions = [
  { label: 'Respirer', to: '/exercices?type=BREATHING', tone: 'bg-accent-soft' },
  { label: 'Bouger', to: '/exercices?type=STRETCHING', tone: 'bg-ciel-100' },
  { label: 'Méditer', to: '/exercices?type=MEDITATION', tone: 'bg-lavande-100' },
]

/**
 * Série d'humeur de la semaine, sept journées complètes.
 *
 * Les journées non déclarées gardent leur place, avec une humeur à `null` : les
 * tasser donnerait une série de quatre barres contiguës qui se lirait comme
 * quatre jours de suite. La place vide dit quelque chose de juste — il ne s'est
 * rien passé ce jour-là — là où un zéro dirait une humeur au plus bas.
 */
const week = computed(() =>
  moodWeek.value.map(entry => ({
    ...entry,
    initial: formatDayInitial(entry.date),
    label: formatCheckInDay(entry.date),
  })),
)

const declaredDays = computed(() => week.value.filter(day => day.mood !== null))

const weekSummary = computed(() =>
  declaredDays.value.length
    ? `Humeur des sept derniers jours, sur 5 : ${declaredDays.value.map(day => `${day.label}, ${day.mood}`).join(' ; ')}. Les autres journées n'ont pas été déclarées.`
    : 'Aucune déclaration sur les sept derniers jours.',
)

function moodBarTone(score: number | null) {
  if (score === null) return 'bg-mist-300'

  return moodLevels[score - 1]?.tone ?? 'bg-mist-300'
}

const pending = ref(false)
const message = ref('')
const tone = ref<'success' | 'danger'>('success')

/** Déclarer l'exercice recommandé sans quitter le tableau de bord (CU-08.1). */
async function completeRecommendation(slug: string) {
  pending.value = true
  message.value = ''

  try {
    const { repeated } = await $fetch(`/api/exercises/${slug}/log`, { method: 'POST' })

    tone.value = 'success'
    message.value = repeated
      ? 'C\'était déjà enregistré à l\'instant. Rien n\'a été compté deux fois.'
      : 'Exercice enregistré. La suggestion suivante en tiendra compte.'
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

const quote = 'Prendre soin de soi n\'est pas un luxe, c\'est ce qui rend le reste possible.'
</script>

<template>
  <div>
    <header class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
          Bonjour, {{ user?.firstName }}
        </h1>
        <p class="mt-1.5 text-label/[1.4] font-medium text-mist-600 lg:text-sm/[1.4]">
          {{ today }}
        </p>
      </div>

      <!-- La déclaration se fait sur /humeur, qui l'enregistre vraiment. Ce bloc
           en est le rappel et le raccourci, jamais un second formulaire. -->
      <NuxtLink
        to="/humeur"
        class="flex items-center gap-3.5 rounded-2xl bg-surface px-4.5 py-3.5 shadow-soft transition-shadow hover:shadow-card"
      >
        <span class="text-label font-semibold text-fg-subtle">
          {{ moodToday ? 'Humeur du jour' : 'Déclarer mon humeur' }}
        </span>
        <span
          aria-hidden="true"
          class="flex items-center gap-2"
        >
          <span
            v-for="level in moodLevels"
            :key="level.value"
            class="rounded-full"
            :class="[
              level.tone,
              moodToday?.mood === level.value ? 'size-6.5 ring-3 ring-accent-soft' : 'size-5.5 opacity-40',
            ]"
          />
        </span>
      </NuxtLink>
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
      <!-- Pauses du jour. L'anneau mesure une progression vers un objectif que
           l'utilisateur s'est donné — pas un score de bien-être : F7 exclut
           explicitement tout indice global. -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Pauses aujourd'hui</h2>
        <div class="mt-3.5 flex items-center gap-4.5">
          <AppGauge
            :value="breaks.taken"
            :max="breaks.goal"
            :label="`${breaks.taken} ${plural(breaks.taken, 'pause prise', 'pauses prises')} sur un objectif de ${breaks.goal}.`"
          >
            <span class="text-3xl/none font-extrabold text-fg">{{ breaks.taken }}</span>
            <span class="mt-0.5 text-2xs font-semibold text-fg-faint">/ {{ breaks.goal }}</span>
          </AppGauge>

          <div>
            <p class="text-label/[1.5] font-medium text-fg-subtle">
              {{ breaks.taken
                ? `${formatDuration(breaks.totalSec)} au total`
                : 'aucune pause pour le moment' }}
            </p>
            <p class="mt-2 text-caption/[1.5] text-fg-muted">
              L'objectif se déduit de vos horaires et de votre fréquence de rappel.
            </p>
          </div>
        </div>
      </section>

      <!-- Prochaine pause -->
      <section class="flex flex-col rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Prochaine pause</h2>

        <ClientOnly>
          <p class="mt-3 font-display text-3xl/[1.1] text-fg">
            {{ nextBreakLabel }}
          </p>

          <template #fallback>
            <p class="mt-3 font-display text-3xl/[1.1] text-fg-faint">…</p>
          </template>
        </ClientOnly>

        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          {{ breaks.taken }} / {{ breaks.goal }} {{ plural(breaks.taken, 'pause prise', 'pauses prises') }} aujourd'hui
        </p>

        <div
          class="my-3.5 flex gap-1.5"
          role="img"
          :aria-label="`${breaks.taken} ${plural(breaks.taken, 'pause prise', 'pauses prises')} sur ${breaks.goal}.`"
        >
          <span
            v-for="slot in breaks.goal"
            :key="slot"
            class="h-1.5 flex-1 rounded-full"
            :class="slot <= breaks.taken ? 'bg-accent' : 'bg-mist-300'"
          />
        </div>

        <!-- Une pause en cours n'a pas à être redémarrée : le bouton devient un
             lien vers le minuteur, qui est l'endroit où on l'arrête. Sinon
             c'est le même déclencheur qu'en barre latérale — un bouton qui
             annonce « prendre une pause maintenant » doit la prendre, pas
             conduire à l'écran où on la prendra. -->
        <NuxtLink
          v-if="running"
          to="/pauses"
          class="mt-auto rounded-lg bg-accent px-4 py-3.5 text-center text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
        >
          Voir le minuteur
        </NuxtLink>

        <AppBreakAction
          v-else
          label="Prendre une pause maintenant"
          root-class="mt-auto"
          class="w-full rounded-lg bg-accent px-4 py-3.5 text-center text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        />
      </section>

      <!-- Raccourcis — mobile seulement -->
      <div class="grid grid-cols-3 gap-2.75 lg:hidden">
        <NuxtLink
          v-for="action in quickActions"
          :key="action.label"
          :to="action.to"
          class="rounded-2xl bg-surface px-2.5 py-4 text-center shadow-soft transition-shadow hover:shadow-card"
        >
          <span
            aria-hidden="true"
            class="inline-block size-7.5 rounded-full"
            :class="action.tone"
          />
          <span class="mt-2.25 block text-xs/[1.2] font-bold text-fg-soft">{{ action.label }}</span>
        </NuxtLink>
      </div>

      <!-- Humeur de la semaine -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-label font-bold text-fg-subtle">Humeur de la semaine</h2>
          <NuxtLink
            to="/statistiques"
            class="text-caption font-bold text-accent-strong underline underline-offset-2"
          >
            Tout voir
          </NuxtLink>
        </div>

        <template v-if="declaredDays.length">
          <div
            class="mt-4.5 flex h-20 items-end gap-2.75"
            role="img"
            :aria-label="weekSummary"
          >
            <!-- Une journée non déclarée garde un trait fin : elle fait partie de
                 la semaine, et ne doit se confondre ni avec une humeur basse ni
                 avec une absence de données. -->
            <span
              v-for="day in week"
              :key="day.date"
              class="flex-1 rounded-sm"
              :class="moodBarTone(day.mood)"
              :style="{ height: day.mood === null ? '3px' : `${(day.mood / 5) * 100}%` }"
            />
          </div>
          <div
            aria-hidden="true"
            class="mt-2 flex gap-2.75"
          >
            <span
              v-for="(day, index) in week"
              :key="day.date"
              class="flex-1 text-center text-caption"
              :class="index === week.length - 1
                ? 'font-bold text-accent-strong'
                : 'font-semibold text-mist-400'"
            >
              {{ day.initial }}
            </span>
          </div>
        </template>

        <p
          v-else
          class="mt-4 rounded-xl bg-surface-soft px-4 py-3.5 text-label/[1.5] text-fg-muted"
        >
          Aucune déclaration cette semaine. Une minute suffit pour ouvrir la série.
        </p>
      </section>

      <!-- Recommandation — CU-10. Le motif accompagne toujours la suggestion :
           sur des données de santé déclarées, une proposition inexpliquée est
           reçue comme une intrusion (F6). -->
      <section
        class="flex flex-col items-center gap-6 rounded-3xl bg-linear-120 px-6.5 py-6 shadow-soft sm:flex-row lg:col-span-2"
        :class="recommendation ? exerciseTypeTones[recommendation.exercise.type].halo : 'from-halo-sage to-halo-sky'"
      >
        <div
          aria-hidden="true"
          class="relative flex size-32 shrink-0 items-center justify-center"
        >
          <span class="absolute size-[7.375rem] animate-breath rounded-full bg-accent-soft" />
          <span class="absolute size-[4.375rem] animate-breath rounded-full bg-accent opacity-20 [animation-delay:.4s]" />
          <span class="relative size-7.5 rounded-full bg-accent" />
        </div>

        <div v-if="recommendation">
          <span class="inline-block rounded-full bg-surface px-2.75 py-1.5 text-caption/none font-bold tracking-eyebrow text-accent-strong uppercase">
            Recommandé pour vous
          </span>
          <h2 class="mt-3.5 font-display text-[1.625rem]/[1.15] text-fg">
            {{ recommendation.exercise.title }}
          </h2>
          <p class="mt-1.5 max-w-95 text-sm/[1.55] text-fg-muted">
            <!-- Le motif d'abord, la description ensuite : c'est le « pourquoi
                 moi » qui décide si la suggestion est reçue ou subie. -->
            <strong class="font-semibold text-fg-soft">{{ recommendation.reason }}</strong>
            {{ recommendation.exercise.description }}
          </p>
          <p class="mt-2 text-caption font-semibold text-fg-faint">
            {{ exerciseTypeLabels[recommendation.exercise.type] }} ·
            {{ formatExerciseDuration(recommendation.exercise.durationMin) }}
          </p>

          <div class="mt-4.5 flex flex-wrap gap-2.5">
            <NuxtLink
              :to="`/exercices/${recommendation.exercise.slug}`"
              class="rounded-lg bg-fg px-5.5 py-3.25 text-sm/none font-bold text-white transition-colors hover:bg-mist-900"
            >
              Voir le déroulé
            </NuxtLink>
            <button
              type="button"
              :disabled="pending"
              class="rounded-lg bg-surface px-5 py-3.25 text-sm/none font-bold text-fg-soft transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
              @click="completeRecommendation(recommendation.exercise.slug)"
            >
              {{ pending ? 'Enregistrement…' : 'Je l\'ai fait' }}
            </button>
          </div>
        </div>

        <!-- Vivier épuisé : le profil restreint les familles et tout le reste a
             été fait ces deux derniers jours. C'est une bonne nouvelle, et ça se
             dit — plutôt que de répéter un exercice fait hier. -->
        <div v-else>
          <span class="inline-block rounded-full bg-surface px-2.75 py-1.5 text-caption/none font-bold tracking-eyebrow text-accent-strong uppercase">
            Rien à proposer
          </span>
          <h2 class="mt-3.5 font-display text-[1.625rem]/[1.15] text-fg">
            Vous avez fait le tour
          </h2>
          <p class="mt-1.5 max-w-95 text-sm/[1.55] text-fg-muted">
            Tous les exercices de vos familles préférées ont été réalisés ces deux derniers
            jours. Élargissez vos préférences, ou piochez librement dans le catalogue.
          </p>
          <div class="mt-4.5 flex flex-wrap gap-2.5">
            <NuxtLink
              to="/exercices"
              class="rounded-lg bg-fg px-5.5 py-3.25 text-sm/none font-bold text-white transition-colors hover:bg-mist-900"
            >
              Ouvrir le catalogue
            </NuxtLink>
            <NuxtLink
              to="/profil"
              class="rounded-lg bg-surface px-5 py-3.25 text-sm/none font-bold text-fg-soft transition-colors hover:bg-surface-soft"
            >
              Mes préférences
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Temps assis + exercices -->
      <div class="flex flex-col gap-5">
        <section class="rounded-3xl bg-surface px-5.5 py-5 shadow-card">
          <h2 class="text-label font-bold text-fg-subtle">Temps assis d'affilée</h2>

          <template v-if="sittingMin !== null">
            <p class="mt-2.5 font-display text-[1.6875rem]/none text-sable-600">
              {{ formatMinutes(sittingMin) }}
            </p>
            <p class="mt-1.25 text-label/[1.4] font-medium text-fg-faint">
              {{ sittingCaption }}
            </p>
          </template>

          <template v-else>
            <p class="mt-2.5 font-display text-[1.6875rem]/none text-accent-strong">
              {{ running ? 'en pause' : '—' }}
            </p>
            <p class="mt-1.25 text-label/[1.4] font-medium text-fg-faint">
              {{ running ? 'le compteur est à l\'arrêt' : 'hors de vos horaires déclarés' }}
            </p>
          </template>
        </section>

        <section class="rounded-3xl bg-surface px-5.5 py-5 shadow-card">
          <h2 class="text-label font-bold text-fg-subtle">Exercices réalisés</h2>
          <p class="mt-2.5 flex items-baseline gap-1.5">
            <span class="font-display text-[1.6875rem]/none text-fg">{{ doneToday }}</span>
            <span class="text-label font-semibold text-fg-faint">aujourd'hui</span>
          </p>
          <p class="mt-1.25 text-label/[1.4] font-medium text-fg-faint">
            {{ moodToday
              ? `humeur ${levelLabel(moodLevels, moodToday.mood)?.toLowerCase()} · stress ${levelLabel(stressLevels, moodToday.stress)?.toLowerCase()}`
              : 'humeur du jour non déclarée' }}
          </p>
        </section>
      </div>

      <!-- Citation -->
      <section class="flex items-center gap-4.5 rounded-3xl bg-surface px-6.5 py-4.5 shadow-soft lg:col-span-3">
        <span
          aria-hidden="true"
          class="font-display text-[2.5rem]/none font-bold text-accent"
        >“</span>
        <blockquote class="font-display text-lg/[1.45] text-fg-soft italic">
          {{ quote }}
        </blockquote>
      </section>
    </div>
  </div>
</template>
