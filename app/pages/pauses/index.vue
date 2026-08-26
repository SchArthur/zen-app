<script setup lang="ts">
import { formatClock, formatDuration, formatRelativeDay, formatTime } from '../../utils/breaks'
import { plural } from '../../utils/text'

// CU-07 — Suivre une pause.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Mes pauses' })

const { data, error, refresh } = await useFetch('/api/breaks', { query: { days: 7 } })

if (error.value) {
  const apiError = toApiError(error.value)
  throw createError({
    statusCode: (error.value as { statusCode?: number }).statusCode ?? 502,
    statusMessage: apiError.message,
    data: { code: apiError.code },
  })
}

if (!data.value) {
  throw createError({ statusCode: 502, statusMessage: 'Vos pauses n\'ont pas pu être chargées. Réessayez dans un instant.', data: { code: 'FETCH_ERROR' } })
}

// Tout est dérivé de `data` plutôt que recopié : après un démarrage ou un arrêt,
// l'écran relit le serveur au lieu de recalculer son état dans son coin. C'est
// ce qui le remet d'aplomb quand une pause a été ouverte depuis un autre onglet.
const current = computed(() => data.value?.current ?? null)
const days = computed(() => data.value?.days ?? [])
const today = computed(() => days.value[0])
const goal = computed(() => data.value?.goal ?? 1)
const preferences = computed(() => data.value?.preferences ?? null)

const running = computed(() => Boolean(current.value))

/** Horloge de la page : une seule pour le minuteur et pour le rappel. */
const now = ref(new Date())
const mounted = ref(false)
let ticker: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  mounted.value = true
  ticker = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})

/**
 * Temps écoulé depuis le début de la pause.
 *
 * Avant montage, c'est la valeur calculée par le serveur : la recalculer à
 * l'hydratation la ferait diverger d'une seconde ou deux et Vue signalerait un
 * écart de rendu. Ensuite, l'horloge du navigateur prend le relais — elle reste
 * juste même si l'onglet est resté en veille, là où un compteur incrémenté
 * chaque seconde aurait pris du retard.
 */
const elapsed = computed(() => {
  const session = current.value

  if (!session) return 0
  if (!mounted.value) return session.elapsedSec

  return Math.max(0, Math.floor((now.value.getTime() - new Date(session.startedAt).getTime()) / 1000))
})

/** Fin de la dernière pause terminée : c'est de là que repart le rappel. */
const lastEndedAt = computed(() => {
  for (const day of days.value) {
    const latest = day.sessions[0]

    if (latest?.endedAt) return new Date(latest.endedAt)
  }

  return null
})

const {
  permission: notificationPermission,
  due: reminderDue,
  dueAt: reminderDueAt,
  withinWorkHours,
  requestPermission: enableNotifications,
  snooze: snoozeReminder,
} = useBreakReminder({ now, preferences, lastEndedAt, running })

const nextReminderLabel = computed(() => {
  if (running.value) return 'pendant la pause'

  const at = reminderDueAt.value

  if (!at) return 'désactivé'

  const minutes = Math.round((at.getTime() - now.value.getTime()) / 60_000)

  if (minutes > 0) return `dans ${minutes} min`

  // Le rappel est mûr mais la journée est finie : le dire, plutôt que d'annoncer
  // « maintenant » un rappel qui ne viendra pas avant demain matin.
  return withinWorkHours.value ? 'maintenant' : 'hors horaires'
})

const message = ref('')
const tone = ref<'success' | 'danger'>('success')
const pending = ref(false)

/**
 * Démarrage et arrêt passent tous les deux par ici.
 *
 * L'état est relu dans tous les cas, y compris après un refus : un refus vient
 * presque toujours d'un écart entre ce que l'écran croit et ce qui est
 * enregistré, et c'est justement ce que la relecture corrige.
 */
async function act(request: () => Promise<void>) {
  pending.value = true
  message.value = ''

  try {
    await request()
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

function start() {
  return act(async () => {
    await $fetch('/api/breaks', { method: 'POST' })
    tone.value = 'success'
    message.value = 'Pause démarrée. Levez-vous, le minuteur s\'occupe du reste.'
  })
}

function stop() {
  return act(async () => {
    const { session } = await $fetch('/api/breaks/current', { method: 'PATCH' })
    tone.value = 'success'
    message.value = `Pause de ${formatDuration(session.durationSec ?? 0)} enregistrée.`
  })
}

/** Les six dernières pauses, toutes journées confondues. */
const recent = computed(() =>
  days.value
    .flatMap((day, index) => day.sessions.map(session => ({
      id: session.id,
      day: formatRelativeDay(index, day.date),
      startedAt: session.startedAt,
      durationSec: session.durationSec ?? 0,
    })))
    .slice(0, 6),
)

function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')} h`
}
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
        Mes pauses
      </h1>
      <p class="mt-1.5 text-label/[1.4] font-medium text-fg-muted lg:text-sm/[1.4]">
        Couper la position assise, aussi souvent que possible — la fréquence compte davantage que la durée.
      </p>
    </header>

    <!-- Le rappel n'existe que dans le navigateur : il dépend de l'horloge de
         l'utilisateur, que le serveur ne connaît pas. -->
    <ClientOnly>
      <div
        v-if="reminderDue"
        role="status"
        class="mb-5 flex flex-col gap-3.5 rounded-2xl bg-warning-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-label/[1.45] font-semibold text-warning-strong">
          Vous êtes assis depuis un moment. C'est le bon moment pour souffler.
        </p>

        <div class="flex shrink-0 flex-wrap gap-2.5">
          <button
            type="button"
            :disabled="pending"
            class="rounded-lg bg-accent px-4 py-2.5 text-label/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            @click="start"
          >
            Démarrer une pause
          </button>
          <button
            type="button"
            class="rounded-lg bg-surface px-4 py-2.5 text-label/none font-bold text-fg-muted transition-colors hover:text-fg"
            @click="snoozeReminder"
          >
            Reporter de 15 min
          </button>
        </div>
      </div>
    </ClientOnly>

    <AppAlert
      v-if="message"
      :role="tone === 'danger' ? 'alert' : 'status'"
      :tone="tone"
      class="mb-5"
    >
      {{ message }}
    </AppAlert>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- Minuteur -->
      <section class="flex flex-col items-center gap-7 rounded-3xl bg-linear-120 from-halo-sage to-halo-sky px-6.5 py-7 shadow-soft sm:flex-row lg:col-span-2">
        <div class="relative flex size-40 shrink-0 items-center justify-center">
          <span
            aria-hidden="true"
            class="absolute size-40 rounded-full bg-accent-soft"
            :class="running ? 'animate-breath' : 'opacity-60'"
          />
          <span
            aria-hidden="true"
            class="absolute size-26 rounded-full bg-accent opacity-20 [animation-delay:.4s]"
            :class="running && 'animate-breath'"
          />
          <p class="relative text-center">
            <span class="block font-display text-[2.25rem]/none tabular-nums text-fg">
              {{ formatClock(elapsed) }}
            </span>
            <span class="mt-1.5 block text-caption font-semibold text-fg-faint">
              {{ running ? 'pause en cours' : 'minuteur à l\'arrêt' }}
            </span>
          </p>
        </div>

        <div class="text-center sm:text-left">
          <span class="inline-block rounded-full bg-surface px-2.75 py-1.5 text-caption/none font-bold tracking-eyebrow text-accent-strong uppercase">
            Minuteur
          </span>
          <h2 class="mt-3.5 font-display text-[1.625rem]/[1.15] text-fg">
            {{ running ? 'Pause en cours' : 'Prêt pour une pause' }}
          </h2>
          <p class="mt-1.5 max-w-95 text-sm/[1.55] text-fg-muted">
            {{ running
              ? 'Rien à surveiller : arrêtez le minuteur quand vous revenez, la durée est enregistrée toute seule.'
              : 'Deux minutes debout valent mieux qu\'une heure de bonnes intentions. Le minuteur démarre en un clic.' }}
          </p>

          <button
            type="button"
            :disabled="pending"
            class="mt-5 rounded-lg px-5.5 py-3.25 text-sm/none font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            :class="running
              ? 'bg-fg text-white hover:bg-mist-900'
              : 'bg-accent text-fg-onaccent hover:bg-accent-strong'"
            @click="running ? stop() : start()"
          >
            {{ running ? 'Arrêter la pause' : 'Démarrer une pause' }}
          </button>
        </div>
      </section>

      <!-- Aujourd'hui -->
      <section class="flex flex-col rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Aujourd'hui</h2>
        <p class="mt-3 font-display text-3xl/[1.1] text-fg">
          {{ today?.count ?? 0 }} / {{ goal }}
        </p>
        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          {{ today?.count
            ? `${plural(today.count, 'pause prise', 'pauses prises')} · ${formatDuration(today.totalSec)} au total`
            : 'aucune pause pour le moment' }}
        </p>

        <div
          class="my-3.5 flex gap-1.5"
          role="img"
          :aria-label="`${today?.count ?? 0} ${plural(today?.count ?? 0, 'pause prise', 'pauses prises')} sur un objectif de ${goal}.`"
        >
          <span
            v-for="slot in goal"
            :key="slot"
            class="h-1.5 flex-1 rounded-full"
            :class="slot <= (today?.count ?? 0) ? 'bg-accent' : 'bg-mist-300'"
          />
        </div>

        <p class="mt-auto text-caption/[1.5] text-fg-muted">
          L'objectif se déduit de vos horaires et de votre fréquence de rappel. Il se
          règle depuis
          <NuxtLink
            to="/profil"
            class="font-semibold text-accent-strong underline underline-offset-2"
          >
            votre profil
          </NuxtLink>.
        </p>
      </section>

      <!-- Dernières pauses -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card lg:col-span-2">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-label font-bold text-fg-subtle">Dernières pauses</h2>
          <NuxtLink
            to="/pauses/historique"
            class="text-caption font-bold text-accent-strong underline underline-offset-2"
          >
            Voir tout l'historique
          </NuxtLink>
        </div>

        <ul
          v-if="recent.length"
          class="mt-4 flex flex-col gap-1"
        >
          <li
            v-for="session in recent"
            :key="session.id"
            class="flex items-center justify-between gap-4 rounded-xl px-3.5 py-2.75 odd:bg-surface-soft"
          >
            <span class="min-w-0 text-label/[1.4] font-semibold text-fg-soft">
              {{ session.day }}
              <span class="font-medium text-fg-faint">· {{ formatTime(session.startedAt) }}</span>
            </span>
            <span class="shrink-0 text-label font-bold tabular-nums text-fg">
              {{ formatDuration(session.durationSec) }}
            </span>
          </li>
        </ul>

        <p
          v-else
          class="mt-4 rounded-xl bg-surface-soft px-4 py-3.5 text-label/[1.5] text-fg-muted"
        >
          Aucune pause enregistrée cette semaine. La première est la plus difficile.
        </p>
      </section>

      <!-- Rappel -->
      <section class="flex flex-col rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Rappel de pause</h2>

        <template v-if="preferences?.remindersEnabled">
          <ClientOnly>
            <p class="mt-3 font-display text-3xl/[1.1] text-fg">
              {{ nextReminderLabel }}
            </p>

            <template #fallback>
              <p class="mt-3 font-display text-3xl/[1.1] text-fg-faint">
                …
              </p>
            </template>
          </ClientOnly>

          <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
            toutes les {{ preferences.reminderIntervalMin }} min, entre
            {{ formatHour(preferences.workStartHour) }} et {{ formatHour(preferences.workEndHour) }}
          </p>

          <!-- L'autorisation ne se demande que sur clic, et jamais au
               chargement : un navigateur qui a dit non l'a dit pour de bon. -->
          <ClientOnly>
            <button
              v-if="notificationPermission === 'default'"
              type="button"
              class="mt-4 rounded-lg bg-surface-sunken px-4 py-2.75 text-label/none font-bold text-fg-soft transition-colors hover:bg-mist-300"
              @click="enableNotifications"
            >
              Autoriser les notifications
            </button>

            <p
              v-else
              class="mt-4 text-caption/[1.5] text-fg-muted"
            >
              {{ notificationPermission === 'granted'
                ? 'Les notifications sont autorisées : le rappel s\'affichera même dans un autre onglet.'
                : 'Les notifications sont refusées par votre navigateur. Le rappel reste affiché sur cette page.' }}
            </p>
          </ClientOnly>
        </template>

        <template v-else>
          <p class="mt-3 text-label/[1.5] text-fg-muted">
            Les rappels sont désactivés. Le minuteur fonctionne quand même : rien ne
            viendra simplement vous le suggérer.
          </p>
          <NuxtLink
            to="/profil"
            class="mt-4 self-start rounded-lg bg-surface-sunken px-4 py-2.75 text-label/none font-bold text-fg-soft transition-colors hover:bg-mist-300"
          >
            Régler mes rappels
          </NuxtLink>
        </template>
      </section>
    </div>
  </div>
</template>
