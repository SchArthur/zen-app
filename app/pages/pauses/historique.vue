<script setup lang="ts">
import { formatDuration, formatRelativeDay, formatTime } from '../../utils/breaks'

// CU-07 — postcondition : « une pause horodatée est visible dans l'historique ».
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Historique de mes pauses' })

/**
 * Trente jours : de quoi voir une habitude s'installer sans noyer l'écran.
 * L'API accepte jusqu'à douze mois glissants (F3) — la profondeur se choisira
 * à l'écran le jour où l'on saura quoi en faire.
 */
const WINDOW_DAYS = 30

const { data, error } = await useFetch('/api/breaks', { query: { days: WINDOW_DAYS } })

if (error.value) {
  const apiError = toApiError(error.value)
  throw createError({
    statusCode: (error.value as { statusCode?: number }).statusCode ?? 502,
    statusMessage: apiError.message,
    data: { code: apiError.code },
  })
}

if (!data.value) {
  throw createError({ statusCode: 502, statusMessage: 'Votre historique n\'a pas pu être chargé. Réessayez dans un instant.' })
}

const goal = data.value.goal

// La journée porte son libellé dès ici : le rang dans la liste est la seule
// chose qui distingue « Aujourd'hui » du 19 août, et il se perd au filtrage.
const days = data.value.days.map((day, index) => ({ ...day, label: formatRelativeDay(index, day.date) }))

const totalCount = days.reduce((total, day) => total + day.count, 0)
const totalSec = days.reduce((total, day) => total + day.totalSec, 0)
const activeDays = days.filter(day => day.count > 0)

/**
 * Moyenne calculée sur les seules journées avec pause.
 *
 * Rapportée aux trente jours, elle intégrerait les week-ends et les congés et
 * afficherait un chiffre bas que rien ne permettrait de corriger. L'indicateur
 * doit dire quelque chose des journées de travail.
 */
const average = activeDays.length ? totalCount / activeDays.length : 0

// Chronologie de gauche à droite : la journée la plus ancienne d'abord, comme
// se lit un calendrier. L'API, elle, part de la plus récente.
const chart = [...days].reverse()
const maxCount = Math.max(1, ...days.map(day => day.count))

/** Une journée qui atteint l'objectif se détache ; les autres s'éclaircissent. */
function barTone(count: number) {
  if (!count) return 'bg-mist-300'

  return count >= goal ? 'bg-accent' : 'bg-sage-300'
}

function barHeight(count: number) {
  // Une journée sans pause garde un trait : elle fait partie de la période et
  // ne doit pas se confondre avec une absence de données.
  return count ? `${(count / maxCount) * 100}%` : '3px'
}
</script>

<template>
  <div>
    <header class="mb-6">
      <NuxtLink
        to="/pauses"
        class="text-caption font-bold text-accent-strong underline underline-offset-2"
      >
        ← Retour au minuteur
      </NuxtLink>
      <h1 class="mt-2 font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
        Historique de mes pauses
      </h1>
      <p class="mt-1.5 text-label/[1.4] font-medium text-mist-600 lg:text-sm/[1.4]">
        Les {{ WINDOW_DAYS }} derniers jours, journée par journée.
      </p>
    </header>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- Trois chiffres, pas un de plus : ce qui est suivi est la régularité. -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Pauses prises</h2>
        <p class="mt-3 font-display text-3xl/[1.1] text-fg">
          {{ totalCount }}
        </p>
        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          {{ formatDuration(totalSec) }} au total
        </p>
      </section>

      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Journées avec pause</h2>
        <p class="mt-3 font-display text-3xl/[1.1] text-fg">
          {{ activeDays.length }} <span class="text-xl text-fg-faint">/ {{ WINDOW_DAYS }}</span>
        </p>
        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          week-ends et congés compris
        </p>
      </section>

      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Moyenne quotidienne</h2>
        <p class="mt-3 font-display text-3xl/[1.1] text-fg">
          {{ average.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }}
        </p>
        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          pauses par journée travaillée · objectif {{ goal }}
        </p>
      </section>

      <!-- Fréquence — l'indicateur que le produit met en avant (F3). Le graphique
           n'est qu'un raccourci visuel : la liste ci-dessous en est l'équivalent
           lisible par un lecteur d'écran, d'où le résumé court en `aria-label`. -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card lg:col-span-3">
        <h2 class="text-label font-bold text-fg-subtle">Pauses par jour</h2>

        <div
          class="mt-4.5 flex h-24 items-end gap-1"
          role="img"
          :aria-label="`${totalCount} pauses réparties sur ${activeDays.length} des ${WINDOW_DAYS} derniers jours. Le détail figure dans la liste qui suit.`"
        >
          <span
            v-for="day in chart"
            :key="day.date"
            class="flex-1 rounded-sm"
            :class="barTone(day.count)"
            :style="{ height: barHeight(day.count) }"
          />
        </div>

        <div
          aria-hidden="true"
          class="mt-2 flex justify-between text-caption font-semibold text-mist-400"
        >
          <span>{{ chart[0]?.label }}</span>
          <span class="font-bold text-accent-strong">{{ chart[chart.length - 1]?.label }}</span>
        </div>
      </section>

      <!-- Détail -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card lg:col-span-3">
        <h2 class="text-label font-bold text-fg-subtle">Détail</h2>

        <div
          v-if="activeDays.length"
          class="mt-4 flex flex-col gap-5"
        >
          <div
            v-for="day in activeDays"
            :key="day.date"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
              <h3 class="text-label font-bold text-fg-soft">{{ day.label }}</h3>
              <span class="text-caption font-semibold text-fg-faint">
                {{ day.count }} pause{{ day.count > 1 ? 's' : '' }} · {{ formatDuration(day.totalSec) }}
              </span>
            </div>

            <ul class="mt-1.5 flex flex-col">
              <li
                v-for="session in day.sessions"
                :key="session.id"
                class="flex items-center justify-between gap-4 rounded-xl px-3.5 py-2.5 odd:bg-surface-soft"
              >
                <span class="text-label/[1.4] font-semibold text-fg-soft">
                  {{ formatTime(session.startedAt) }}
                  <span
                    v-if="session.endedAt"
                    class="font-medium text-fg-faint"
                  >→ {{ formatTime(session.endedAt) }}</span>
                </span>
                <span class="shrink-0 text-label font-bold tabular-nums text-fg">
                  {{ formatDuration(session.durationSec ?? 0) }}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <p
          v-else
          class="mt-4 rounded-xl bg-surface-soft px-4 py-3.5 text-label/[1.5] text-fg-muted"
        >
          Aucune pause enregistrée sur cette période. Le minuteur les ajoutera ici au fur
          et à mesure.
        </p>
      </section>
    </div>
  </div>
</template>
