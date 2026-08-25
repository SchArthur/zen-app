<script setup lang="ts">
import { formatDuration, formatRelativeDay, formatTime } from '../../utils/breaks'

// CU-07 — postcondition : « une pause horodatée est visible dans l'historique ».
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Historique de mes pauses' })

/**
 * Profondeurs consultables.
 *
 * Les douze mois glissants sont ceux qu'annonce le critère M de F3. L'API les
 * acceptait déjà (`HISTORY_MAX_DAYS`), mais aucun écran n'y menait : la fenêtre
 * était figée à trente jours, et la promesse du dossier ne tenait qu'à un
 * paramètre d'URL que personne n'écrit à la main.
 *
 * Trois profondeurs et pas davantage : elles répondent à trois questions
 * distinctes — le mois écoulé, la saison, l'année — là où une liste de dix
 * valeurs demanderait de choisir avant de savoir ce qu'on cherche.
 */
const WINDOWS = {
  mois: { days: 30, label: '30 jours', long: 'les 30 derniers jours' },
  trimestre: { days: 90, label: '3 mois', long: 'les 3 derniers mois' },
  annee: { days: 366, label: '12 mois', long: 'les 12 derniers mois' },
} as const

type WindowKey = keyof typeof WINDOWS

/**
 * La fenêtre vit dans l'URL, comme la période de `/statistiques` et les filtres
 * du catalogue : une vue se partage, se met en favori, et le bouton « précédent »
 * revient à la profondeur précédente.
 */
const route = useRoute()
const router = useRouter()

const windowKey = computed<WindowKey>(() => {
  const value = route.query.fenetre

  return typeof value === 'string' && Object.hasOwn(WINDOWS, value)
    ? value as WindowKey
    : 'mois'
})

const period = computed(() => WINDOWS[windowKey.value])

function selectWindow(value: WindowKey) {
  return router.push({ query: value === 'mois' ? {} : { fenetre: value } })
}

const { data, error } = await useFetch('/api/breaks', {
  query: computed(() => ({ days: period.value.days })),
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
  throw createError({ statusCode: 502, statusMessage: 'Votre historique n\'a pas pu être chargé. Réessayez dans un instant.' })
}

const goal = computed(() => data.value?.goal ?? 1)

// La journée porte son libellé dès ici : le rang dans la liste est la seule
// chose qui distingue « Aujourd'hui » du 19 août, et il se perd au filtrage.
const days = computed(() =>
  (data.value?.days ?? []).map((day, index) => ({ ...day, label: formatRelativeDay(index, day.date) })),
)

const totalCount = computed(() => days.value.reduce((total, day) => total + day.count, 0))
const totalSec = computed(() => days.value.reduce((total, day) => total + day.totalSec, 0))
const activeDays = computed(() => days.value.filter(day => day.count > 0))

/**
 * Moyenne calculée sur les seules journées avec pause.
 *
 * Rapportée à toute la fenêtre, elle intégrerait les week-ends et les congés et
 * afficherait un chiffre bas que rien ne permettrait de corriger. L'indicateur
 * doit dire quelque chose des journées de travail.
 */
const average = computed(() => activeDays.value.length ? totalCount.value / activeDays.value.length : 0)

/**
 * Une barre par journée sur trente jours, une barre par semaine au-delà.
 *
 * Trois cent soixante-six barres dans la largeur d'un téléphone font des traits
 * de moins d'un pixel : le graphique cesse d'être lisible au moment précis où
 * on lui demande de montrer une tendance longue. Le regroupement hebdomadaire
 * garde une cinquantaine de barres quelle que soit la profondeur, ce qui est
 * aussi la bonne granularité pour une habitude — on ne prend pas ses pauses
 * autrement le mardi que le jeudi.
 */
const BUCKET_THRESHOLD_DAYS = 31

const chart = computed(() => {
  // Chronologie de gauche à droite : la journée la plus ancienne d'abord, comme
  // se lit un calendrier. L'API, elle, part de la plus récente.
  const chronological = [...days.value].reverse()

  if (chronological.length <= BUCKET_THRESHOLD_DAYS) {
    return chronological.map(day => ({ key: day.date, count: day.count, label: day.label }))
  }

  const weeks: { key: string, count: number, label: string }[] = []

  for (let index = 0; index < chronological.length; index += 7) {
    const week = chronological.slice(index, index + 7)
    const first = week[0]!

    weeks.push({
      key: first.date,
      count: week.reduce((total, day) => total + day.count, 0),
      label: `semaine du ${first.label}`,
    })
  }

  return weeks
})

const grouped = computed(() => chart.value.length !== days.value.length)

// La phrase d'accroche suit la maille réellement affichée : annoncer « journée
// par journée » au-dessus d'un graphique hebdomadaire serait faux, et c'est le
// genre de faux qui se remarque au moment où l'on cherche une date précise.
const intro = computed(() => {
  const window = period.value.long

  return `${window.charAt(0).toUpperCase()}${window.slice(1)}, ${grouped.value ? 'semaine par semaine' : 'journée par journée'}.`
})

/** Objectif ramené à la maille du graphique : par semaine quand on groupe. */
const barGoal = computed(() => grouped.value ? goal.value * 5 : goal.value)

const maxCount = computed(() => Math.max(1, ...chart.value.map(bar => bar.count)))

/** Une barre qui atteint l'objectif se détache ; les autres s'éclaircissent. */
function barTone(count: number) {
  if (!count) return 'bg-mist-300'

  return count >= barGoal.value ? 'bg-accent' : 'bg-sage-300'
}

function barHeight(count: number) {
  // Une barre sans pause garde un trait : elle fait partie de la période et ne
  // doit pas se confondre avec une absence de données.
  return count ? `${(count / maxCount.value) * 100}%` : '3px'
}

/**
 * Le détail ne suit pas la fenêtre.
 *
 * Sur douze mois, la liste séance par séance ferait deux cent cinquante blocs :
 * personne ne la lit, et elle repousse tout le reste hors de l'écran. Les
 * chiffres et le graphique portent la période entière ; cette liste répond à
 * l'autre question, « qu'ai-je fait ces dernières semaines ».
 */
const DETAIL_DAYS = 30

const detail = computed(() => activeDays.value.slice(0, DETAIL_DAYS))
const detailTruncated = computed(() => activeDays.value.length > DETAIL_DAYS)
</script>

<template>
  <div>
    <header class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
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
          {{ intro }}
        </p>
      </div>

      <div
        role="group"
        aria-label="Profondeur de l'historique"
        class="flex shrink-0 gap-1 rounded-xl bg-surface p-1 shadow-soft"
      >
        <button
          v-for="(option, value) in WINDOWS"
          :key="value"
          type="button"
          :aria-pressed="windowKey === value"
          class="rounded-lg px-4 py-2.25 text-label/none font-bold transition-colors"
          :class="windowKey === value
            ? 'bg-accent text-fg-onaccent'
            : 'text-fg-subtle hover:bg-surface-soft'"
          @click="selectWindow(value)"
        >
          {{ option.label }}
        </button>
      </div>
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
          {{ activeDays.length }} <span class="text-xl text-fg-faint">/ {{ period.days }}</span>
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
        <h2 class="text-label font-bold text-fg-subtle">
          Pauses par {{ grouped ? 'semaine' : 'jour' }}
        </h2>

        <div
          class="mt-4.5 flex h-24 items-end gap-1"
          role="img"
:aria-label="`${totalCount} pauses réparties sur ${activeDays.length} des ${period.days} derniers jours. ${detailTruncated ? 'Seules les journées avec pause les plus récentes sont détaillées ci-dessous.' : 'Le détail figure dans la liste qui suit.'}`"
        >
          <span
            v-for="bar in chart"
            :key="bar.key"
            class="flex-1 rounded-sm"
            :class="barTone(bar.count)"
            :style="{ height: barHeight(bar.count) }"
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

        <p
          v-if="detailTruncated"
          class="mt-2 text-caption/[1.5] text-fg-muted"
        >
          Les {{ DETAIL_DAYS }} journées avec pause les plus récentes. Les chiffres et le
          graphique ci-dessus portent, eux, sur {{ period.long }}.
        </p>

        <div
          v-if="detail.length"
          class="mt-4 flex flex-col gap-5"
        >
          <div
            v-for="day in detail"
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
