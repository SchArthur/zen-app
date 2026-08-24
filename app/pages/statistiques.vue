<script setup lang="ts">
import { formatDuration } from '../utils/breaks'
import { formatCheckInDay, formatDayInitial } from '../utils/mood'
import { formatTrend } from '../utils/trends'

// CU-11 — Consulter son tableau de bord personnel (F7).
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Mes statistiques' })

const PERIOD_LABELS = { semaine: 'Cette semaine', mois: 'Ce mois-ci' } as const

type Period = keyof typeof PERIOD_LABELS

const route = useRoute()
const router = useRouter()

/**
 * La période vit dans l'URL, comme les filtres du catalogue : une vue partagée
 * ou mise en favori s'ouvre sur la même période, et le bouton « précédent »
 * revient à la précédente.
 */
const period = computed<Period>(() => {
  const value = route.query.periode

  return value === 'mois' ? 'mois' : 'semaine'
})

const { data, error } = await useFetch('/api/stats', {
  query: computed(() => ({ period: period.value })),
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
  throw createError({ statusCode: 502, statusMessage: 'Vos statistiques n\'ont pas pu être chargées. Réessayez dans un instant.' })
}

const series = computed(() => data.value?.series ?? [])
const totals = computed(() => data.value!.totals)
const trends = computed(() => data.value!.trends)
const days = computed(() => data.value?.days ?? 7)

function selectPeriod(value: Period) {
  return router.push({ query: value === 'semaine' ? {} : { periode: value } })
}

/**
 * Étiquettes d'axe.
 *
 * Sur sept jours, l'initiale du jour suffit et se lit d'un coup d'œil. Sur
 * trente, elle se répète quatre fois et n'apprend plus rien : on passe au
 * quantième, et une étiquette sur trois pour que l'axe reste lisible.
 */
const labels = computed(() =>
  series.value.map((day, index) => {
    if (days.value <= 7) return formatDayInitial(day.date)

    return index % 3 === 0 ? day.date.slice(8) : ''
  }),
)

const fullLabels = computed(() => series.value.map(day => formatCheckInDay(day.date)))

const activityChart = computed(() => [
  { label: 'Pauses prises', values: series.value.map(day => day.breaks), tone: 'chart-1' },
  { label: 'Exercices réalisés', values: series.value.map(day => day.exercises), tone: 'chart-3' },
])

const declarationChart = computed(() => [
  { label: 'Humeur', values: series.value.map(day => day.mood), tone: 'chart-1' },
  { label: 'Stress', values: series.value.map(day => day.stress), tone: 'chart-4' },
])

const hasActivity = computed(() => totals.value.breaks > 0 || totals.value.exercises > 0)
const hasDeclarations = computed(() => totals.value.declaredDays > 0)

function formatAverage(value: number | null) {
  return value === null ? '—' : value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

const breaksTrend = computed(() => formatTrend(trends.value.breaks))
const exercisesTrend = computed(() => formatTrend(trends.value.exercises))
const moodTrend = computed(() => formatTrend(trends.value.mood, { decimals: true }))
const stressTrend = computed(() => formatTrend(trends.value.stress, { decimals: true, invert: true }))
</script>

<template>
  <div>
    <header class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
          Mes statistiques
        </h1>
        <p class="mt-1.5 max-w-prose text-label/[1.4] font-medium text-mist-600 lg:text-sm/[1.4]">
          Vos habitudes sur la période, et rien d'autre : pas de score global, pas de
          comparaison avec vos collègues. Le seul point de repère est votre période
          précédente.
        </p>
      </div>

      <div
        role="group"
        aria-label="Période"
        class="flex shrink-0 gap-1 rounded-xl bg-surface p-1 shadow-soft"
      >
        <button
          v-for="(label, value) in PERIOD_LABELS"
          :key="value"
          type="button"
          :aria-pressed="period === value"
          class="rounded-lg px-4 py-2.25 text-label/none font-bold transition-colors"
          :class="period === value
            ? 'bg-accent text-fg-onaccent'
            : 'text-fg-subtle hover:bg-surface-soft'"
          @click="selectPeriod(value)"
        >
          {{ label }}
        </button>
      </div>
    </header>

    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <!-- Les quatre indicateurs de F7 : pauses, exercices, humeur, stress. -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Pauses prises</h2>
        <p class="mt-3 font-display text-3xl/[1.1] text-fg">
          {{ totals.breaks }}
        </p>
        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          {{ formatDuration(totals.breakSec) }} au total ·
          {{ totals.activeDays }} journée{{ totals.activeDays === 1 ? '' : 's' }} sur {{ days }}
        </p>
        <p
          class="mt-2.5 text-caption font-bold"
          :class="breaksTrend.tone"
        >
          {{ breaksTrend.label }}
        </p>
      </section>

      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Exercices réalisés</h2>
        <p class="mt-3 font-display text-3xl/[1.1] text-fg">
          {{ totals.exercises }}
        </p>
        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          sur {{ days }} jours
        </p>
        <p
          class="mt-2.5 text-caption font-bold"
          :class="exercisesTrend.tone"
        >
          {{ exercisesTrend.label }}
        </p>
      </section>

      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Humeur moyenne</h2>
        <p class="mt-3 font-display text-3xl/[1.1] text-fg">
          {{ formatAverage(totals.moodAvg) }}
          <span class="text-xl text-fg-faint">/ 5</span>
        </p>
        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          sur {{ totals.declaredDays }} journée{{ totals.declaredDays === 1 ? '' : 's' }}
          déclarée{{ totals.declaredDays === 1 ? '' : 's' }}
        </p>
        <p
          class="mt-2.5 text-caption font-bold"
          :class="moodTrend.tone"
        >
          {{ moodTrend.label }}
        </p>
      </section>

      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Niveau de stress</h2>
        <p class="mt-3 font-display text-3xl/[1.1] text-fg">
          {{ formatAverage(totals.stressAvg) }}
          <span class="text-xl text-fg-faint">/ 5</span>
        </p>
        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          1 pour serein, 5 pour débordé
        </p>
        <p
          class="mt-2.5 text-caption font-bold"
          :class="stressTrend.tone"
        >
          {{ stressTrend.label }}
        </p>
      </section>

      <!-- Graphique 1 — activité -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card sm:col-span-2">
        <h2 class="mb-3.5 text-label font-bold text-fg-subtle">Pauses et exercices, jour par jour</h2>

        <AppChart
          v-if="hasActivity"
          type="bar"
          :labels="labels"
          :full-labels="fullLabels"
          :series="activityChart"
          caption="Pauses prises et exercices réalisés, par journée."
        />

        <p
          v-else
          class="rounded-xl bg-surface-soft px-4 py-3.5 text-label/[1.5] text-fg-muted"
        >
          Rien d'enregistré sur cette période. Une pause de deux minutes suffit à faire
          apparaître la première barre.
        </p>
      </section>

      <!-- Graphique 2 — déclarations -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card sm:col-span-2">
        <h2 class="mb-3.5 text-label font-bold text-fg-subtle">Humeur et stress déclarés</h2>

        <AppChart
          v-if="hasDeclarations"
          type="line"
          :labels="labels"
          :full-labels="fullLabels"
          :series="declarationChart"
          :max="5"
          caption="Humeur et niveau de stress déclarés, par journée, sur une échelle de 1 à 5. Une journée non déclarée n'a pas de valeur."
        />

        <p
          v-else
          class="rounded-xl bg-surface-soft px-4 py-3.5 text-label/[1.5] text-fg-muted"
        >
          Aucune déclaration sur cette période. Les journées non déclarées restent vides :
          elles ne comptent jamais comme un zéro.
        </p>

        <p
          v-if="hasDeclarations && totals.declaredDays < days"
          class="mt-3.5 text-caption/[1.5] text-fg-muted"
        >
          {{ days - totals.declaredDays }} journée{{ days - totals.declaredDays === 1 ? '' : 's' }}
          sans déclaration sur la période — week-ends et congés compris. Les moyennes
          ci-dessus ne les comptent pas.
        </p>
      </section>
    </div>
  </div>
</template>
