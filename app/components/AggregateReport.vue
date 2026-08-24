<script setup lang="ts">
import { formatDuration } from '../utils/breaks'
import { formatCheckInDay, formatDayInitial } from '../utils/mood'
import { formatTrend } from '../utils/trends'

/**
 * Restitution d'un périmètre agrégé — équipe (CU-12) ou entreprise (CU-13).
 *
 * Les deux vues affichent la même chose au périmètre près, ce que F9 annonce
 * explicitement : « réutilise les agrégations de la vue manager avec un
 * périmètre différent ». Un seul composant, donc, plutôt que deux écrans qui
 * divergeraient au premier ajustement — et une seule place où vérifier qu'aucune
 * donnée individuelle n'est rendue.
 *
 * Le composant ne reçoit que des agrégats. Il n'a aucun moyen d'afficher un nom
 * ou une valeur individuelle, pour la bonne raison qu'aucun ne lui parvient.
 */
interface AggregateDay {
  date: string
  breaks: number
  exercises: number
  mood: number | null
  stress: number | null
}

const props = defineProps<{
  days: number
  headcount: number
  threshold: number
  series: AggregateDay[]
  totals: {
    breaks: number
    breakSec: number
    exercises: number
    moodAvg: number | null
    stressAvg: number | null
    declarants: number
  }
  trends: {
    breaks: number | null
    exercises: number | null
    mood: number | null
    stress: number | null
  }
}>()

const labels = computed(() =>
  props.series.map((day, index) => {
    if (props.days <= 7) return formatDayInitial(day.date)

    return index % 3 === 0 ? day.date.slice(8) : ''
  }),
)

const fullLabels = computed(() => props.series.map(day => formatCheckInDay(day.date)))

const activityChart = computed(() => [
  { label: 'Pauses prises', values: props.series.map(day => day.breaks), tone: 'chart-1' },
  { label: 'Exercices réalisés', values: props.series.map(day => day.exercises), tone: 'chart-3' },
])

const declarationChart = computed(() => [
  { label: 'Humeur moyenne', values: props.series.map(day => day.mood), tone: 'chart-1' },
  { label: 'Stress moyen', values: props.series.map(day => day.stress), tone: 'chart-4' },
])

const hasActivity = computed(() => props.totals.breaks > 0 || props.totals.exercises > 0)

/** Journées dont la moyenne a été masquée faute de déclarants ce jour-là. */
const maskedDays = computed(() => props.series.filter(day => day.mood === null).length)

const participation = computed(() =>
  props.headcount ? Math.round((props.totals.declarants / props.headcount) * 100) : 0,
)

function formatAverage(value: number | null) {
  return value === null ? '—' : value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

const breaksTrend = computed(() => formatTrend(props.trends.breaks))
const moodTrend = computed(() => formatTrend(props.trends.mood, { decimals: true }))
const stressTrend = computed(() => formatTrend(props.trends.stress, { decimals: true, invert: true }))
</script>

<template>
  <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
    <!-- Participation. Publiée seulement parce que le seuil est franchi : le
         nombre de déclarants d'un petit périmètre se recoupe avec ce que
         l'encadrant sait déjà de ses effectifs. -->
    <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
      <h3 class="text-label font-bold text-fg-subtle">Participation</h3>
      <p class="mt-3 font-display text-3xl/[1.1] text-fg">
        {{ participation }} <span class="text-xl text-fg-faint">%</span>
      </p>
      <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
        {{ totals.declarants }} personnes sur {{ headcount }} ont déclaré
      </p>
    </section>

    <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
      <h3 class="text-label font-bold text-fg-subtle">Pauses prises</h3>
      <p class="mt-3 font-display text-3xl/[1.1] text-fg">
        {{ totals.breaks }}
      </p>
      <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
        {{ formatDuration(totals.breakSec) }} au total
      </p>
      <p
        class="mt-2.5 text-caption font-bold"
        :class="breaksTrend.tone"
      >
        {{ breaksTrend.label }}
      </p>
    </section>

    <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
      <h3 class="text-label font-bold text-fg-subtle">Humeur moyenne</h3>
      <p class="mt-3 font-display text-3xl/[1.1] text-fg">
        {{ formatAverage(totals.moodAvg) }}
        <span class="text-xl text-fg-faint">/ 5</span>
      </p>
      <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
        sur {{ days }} jours
      </p>
      <p
        class="mt-2.5 text-caption font-bold"
        :class="moodTrend.tone"
      >
        {{ moodTrend.label }}
      </p>
    </section>

    <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
      <h3 class="text-label font-bold text-fg-subtle">Stress moyen</h3>
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

    <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card sm:col-span-2">
      <h3 class="mb-3.5 text-label font-bold text-fg-subtle">Pauses et exercices, jour par jour</h3>

      <AppChart
        v-if="hasActivity"
        type="bar"
        :labels="labels"
        :full-labels="fullLabels"
        :series="activityChart"
        caption="Pauses prises et exercices réalisés par le périmètre, par journée."
      />

      <p
        v-else
        class="rounded-xl bg-surface-soft px-4 py-3.5 text-label/[1.5] text-fg-muted"
      >
        Aucune activité enregistrée sur cette période.
      </p>
    </section>

    <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card sm:col-span-2">
      <h3 class="mb-3.5 text-label font-bold text-fg-subtle">Humeur et stress déclarés</h3>

      <AppChart
        type="line"
        :labels="labels"
        :full-labels="fullLabels"
        :series="declarationChart"
        :max="5"
        caption="Humeur et stress moyens du périmètre, par journée, sur une échelle de 1 à 5. Une journée comptant trop peu de déclarants n'a pas de valeur."
      />

      <!-- Le masquage par journée doit se dire, sans quoi un trou dans la courbe
           se lit comme une absence d'activité plutôt que comme un refus de
           calculer. -->
      <p
        v-if="maskedDays"
        class="mt-3.5 text-caption/[1.5] text-fg-muted"
      >
        {{ maskedDays }} journée{{ maskedDays === 1 ? '' : 's' }} sans valeur : moins de
        {{ threshold }} personnes y ont déclaré. La moyenne d'une journée à un ou deux
        déclarants serait leur ressenti, pas celui du groupe.
      </p>
    </section>
  </div>
</template>
