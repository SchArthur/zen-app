<script setup lang="ts">
// CU-07 — Consulter son tableau de bord bien-être.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Tableau de bord' })

const { user } = useUserSession()

// Formatée côté serveur puis transportée dans la charge utile : recalculer la
// date à l'hydratation la ferait diverger si le navigateur a passé minuit ou
// vit dans un autre fuseau — Vue signalerait alors un écart de rendu.
const today = useState('dashboard-date', () => {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
})

/**
 * Données de démonstration, reprises de la maquette.
 *
 * Les API de pauses, de check-in et d'exercices sont prévues en J7 (PLAN.md).
 * Tout est réuni dans un seul objet pour qu'il n'y ait qu'une chose à
 * remplacer par un `useFetch('/api/tableau-de-bord')` le moment venu, et pour
 * qu'aucune valeur ne traîne en dur au milieu du gabarit.
 */
const dashboard = reactive({
  wellbeing: { score: 78, label: 'Équilibré', trend: 6 },
  breaks: { nextInMinutes: 12, taken: 3, goal: 5 },
  mood: {
    // Échelle 1→5 du check-in quotidien. Moyennes journalières, donc décimales.
    today: 4,
    week: [
      { letter: 'L', day: 'Lundi', score: 3.1 },
      { letter: 'M', day: 'Mardi', score: 3.9 },
      { letter: 'M', day: 'Mercredi', score: 2.6 },
      { letter: 'J', day: 'Jeudi', score: 4.4 },
      { letter: 'V', day: 'Vendredi', score: 4.9 },
    ],
  },
  suggestion: {
    title: 'Respiration 4 · 7 · 8',
    description: 'Votre niveau de stress a légèrement augmenté cet après-midi. Trois minutes pour relâcher les épaules et ralentir le souffle.',
    minutes: 3,
  },
  sitting: { duration: '2 h 40', hint: 'Pensez à vous lever un instant' },
  activity: { steps: 1240, stretches: 2 },
  quote: 'Prendre soin de soi n\'est pas un luxe, c\'est ce qui rend le reste possible.',
})

/** Les cinq niveaux du check-in, du plus bas au plus haut. */
const moodLevels = [
  { level: 1, label: 'Difficile', dot: 'bg-mood-1', halo: 'ring-argile-100' },
  { level: 2, label: 'Fatigué', dot: 'bg-mood-2', halo: 'ring-argile-100' },
  { level: 3, label: 'Neutre', dot: 'bg-mood-3', halo: 'ring-sable-100' },
  { level: 4, label: 'Bien', dot: 'bg-mood-4', halo: 'ring-sage-200' },
  { level: 5, label: 'Excellent', dot: 'bg-mood-5', halo: 'ring-accent-soft' },
]

/** Raccourcis affichés sur mobile, là où la barre latérale n'existe pas. */
const quickActions = [
  { label: 'Respirer', to: '/serenite', tone: 'bg-accent-soft' },
  { label: 'Bouger', to: '/activite', tone: 'bg-ciel-100' },
  { label: 'Méditer', to: '/serenite', tone: 'bg-lavande-100' },
]

// La barre du jour se détache ; les précédentes s'éclaircissent à mesure que
// l'humeur baisse, sans jamais virer à l'alarme.
function moodBarTone(score: number) {
  if (score >= 4.5) return 'bg-accent'
  if (score >= 4) return 'bg-sage-400'
  if (score >= 3) return 'bg-sage-300'
  return 'bg-sage-200'
}

const steps = computed(() => new Intl.NumberFormat('fr-FR').format(dashboard.activity.steps))

// Un graphique en barres n'est rien pour un lecteur d'écran : on lui donne la
// même information sous forme de phrase.
const weekSummary = computed(() =>
  `Humeur de la semaine, sur 5 : ${dashboard.mood.week.map(d => `${d.day} ${d.score.toLocaleString('fr-FR')}`).join(', ')}.`,
)
</script>

<template>
  <div>
    <header class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
          Bonjour, {{ user?.firstName }}
        </h1>
        <p class="mt-1.5 text-label/[1.4] font-medium text-mist-600 lg:text-sm/[1.4]">
          {{ today }} · une belle énergie aujourd'hui
        </p>
      </div>

      <div class="flex items-center gap-3.5 rounded-2xl bg-surface px-4.5 py-3.5 shadow-soft">
        <span class="text-label font-semibold text-fg-subtle">Humeur du jour</span>
        <div
          role="radiogroup"
          aria-label="Humeur du jour"
          class="flex items-center gap-2"
        >
          <button
            v-for="mood in moodLevels"
            :key="mood.level"
            type="button"
            role="radio"
            :aria-checked="dashboard.mood.today === mood.level"
            :aria-label="mood.label"
            :title="mood.label"
            class="rounded-full transition-all"
            :class="[
              mood.dot,
              dashboard.mood.today === mood.level ? `size-6.5 ring-3 ${mood.halo}` : 'size-5.5',
            ]"
            @click="dashboard.mood.today = mood.level"
          />
        </div>
      </div>
    </header>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- Indice de bien-être -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Indice de bien-être</h2>
        <div class="mt-3.5 flex items-center gap-4.5">
          <WellbeingGauge
            :value="dashboard.wellbeing.score"
            :label="`Indice de bien-être : ${dashboard.wellbeing.score} sur 100, ${dashboard.wellbeing.label.toLowerCase()}.`"
          >
            <span class="text-3xl/none font-extrabold text-fg">{{ dashboard.wellbeing.score }}</span>
            <span class="mt-0.5 text-2xs font-semibold text-fg-faint">/ 100</span>
          </WellbeingGauge>

          <div>
            <span class="inline-block rounded-full bg-accent-soft px-2.75 py-1.5 text-xs/none font-bold text-accent-strong">
              {{ dashboard.wellbeing.label }}
            </span>
            <p class="mt-2.5 text-label/[1.5] font-medium text-fg-subtle">
              +{{ dashboard.wellbeing.trend }} points<br>cette semaine
            </p>
          </div>
        </div>
      </section>

      <!-- Prochaine pause -->
      <section class="flex flex-col rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Prochaine pause</h2>
        <p class="mt-3 font-display text-3xl/[1.1] text-fg">
          dans {{ dashboard.breaks.nextInMinutes }} min
        </p>
        <p class="mt-1 text-label/[1.4] font-medium text-fg-faint">
          {{ dashboard.breaks.taken }} / {{ dashboard.breaks.goal }} pauses prises aujourd'hui
        </p>

        <div
          class="my-3.5 flex gap-1.5"
          role="img"
          :aria-label="`${dashboard.breaks.taken} pauses prises sur ${dashboard.breaks.goal}.`"
        >
          <span
            v-for="slot in dashboard.breaks.goal"
            :key="slot"
            class="h-1.5 flex-1 rounded-full"
            :class="slot <= dashboard.breaks.taken ? 'bg-accent' : 'bg-mist-300'"
          />
        </div>

        <!-- « Démarrer une pause en une interaction depuis n'importe quel écran »
             (CU-07) : le minuteur vit sur /pauses, le tableau de bord y mène. -->
        <NuxtLink
          to="/pauses"
          class="mt-auto rounded-lg bg-accent px-4 py-3.5 text-center text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
        >
          Prendre une pause maintenant
        </NuxtLink>
      </section>

      <!-- Raccourcis — mobile seulement, la barre latérale les remplace ailleurs -->
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
        <h2 class="text-label font-bold text-fg-subtle">Humeur de la semaine</h2>
        <div
          class="mt-4.5 flex h-20 items-end gap-2.75"
          role="img"
          :aria-label="weekSummary"
        >
          <span
            v-for="(day, index) in dashboard.mood.week"
            :key="index"
            class="flex-1 rounded-sm"
            :class="moodBarTone(day.score)"
            :style="{ height: `${(day.score / 5) * 100}%` }"
          />
        </div>
        <div
          aria-hidden="true"
          class="mt-2 flex gap-2.75"
        >
          <span
            v-for="(day, index) in dashboard.mood.week"
            :key="index"
            class="flex-1 text-center text-caption"
            :class="index === dashboard.mood.week.length - 1
              ? 'font-bold text-accent-strong'
              : 'font-semibold text-mist-400'"
          >
            {{ day.letter }}
          </span>
        </div>
      </section>

      <!-- Suggestion sérénité -->
      <section class="flex flex-col items-center gap-6 rounded-3xl bg-linear-120 from-halo-sage to-halo-sky px-6.5 py-6 shadow-soft sm:flex-row lg:col-span-2">
        <div
          aria-hidden="true"
          class="relative flex size-32 shrink-0 items-center justify-center"
        >
          <span class="absolute size-[7.375rem] animate-breath rounded-full bg-accent-soft" />
          <span class="absolute size-[4.375rem] animate-breath rounded-full bg-accent opacity-20 [animation-delay:.4s]" />
          <span class="relative size-7.5 rounded-full bg-accent" />
        </div>

        <div>
          <span class="inline-block rounded-full bg-surface px-2.75 py-1.5 text-caption/none font-bold tracking-eyebrow text-accent-strong uppercase">
            Suggestion sérénité
          </span>
          <h2 class="mt-3.5 font-display text-[1.625rem]/[1.15] text-fg">
            {{ dashboard.suggestion.title }}
          </h2>
          <p class="mt-1.5 max-w-95 text-sm/[1.55] text-fg-muted">
            {{ dashboard.suggestion.description }}
          </p>
          <button
            type="button"
            class="mt-4.5 rounded-lg bg-fg px-5.5 py-3.25 text-sm/none font-bold text-white transition-colors hover:bg-mist-900"
          >
            Commencer · {{ dashboard.suggestion.minutes }} min
          </button>
        </div>
      </section>

      <!-- Temps assis + activité -->
      <div class="flex flex-col gap-5">
        <section class="rounded-3xl bg-surface px-5.5 py-5 shadow-card">
          <h2 class="text-label font-bold text-fg-subtle">Temps assis d'affilée</h2>
          <p class="mt-2.5 font-display text-[1.6875rem]/none text-sable-600">
            {{ dashboard.sitting.duration }}
          </p>
          <p class="mt-1.25 text-label/[1.4] font-medium text-fg-faint">
            {{ dashboard.sitting.hint }}
          </p>
        </section>

        <section class="rounded-3xl bg-surface px-5.5 py-5 shadow-card">
          <h2 class="text-label font-bold text-fg-subtle">Activité physique</h2>
          <p class="mt-2.5 flex items-baseline gap-1.5">
            <span class="font-display text-[1.6875rem]/none text-fg">{{ steps }}</span>
            <span class="text-label font-semibold text-fg-faint">pas</span>
          </p>
          <p class="mt-1.25 text-label/[1.4] font-medium text-fg-faint">
            {{ dashboard.activity.stretches }} étirements réalisés
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
          {{ dashboard.quote }}
        </blockquote>
      </section>
    </div>
  </div>
</template>
