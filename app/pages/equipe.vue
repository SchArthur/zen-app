<script setup lang="ts">
// CU-12 — Consulter le climat de son équipe.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Climat de mon équipe' })

const PERIOD_LABELS = { semaine: 'Cette semaine', mois: 'Ce mois-ci' } as const

type Period = keyof typeof PERIOD_LABELS

const route = useRoute()
const router = useRouter()

const period = computed<Period>(() => (route.query.periode === 'mois' ? 'mois' : 'semaine'))

const { data, error } = await useFetch('/api/team', {
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
  throw createError({ statusCode: 502, statusMessage: 'Le climat de votre équipe n\'a pas pu être chargé. Réessayez dans un instant.' })
}

const report = computed(() => data.value!)

function selectPeriod(value: Period) {
  return router.push({ query: value === 'semaine' ? {} : { periode: value } })
}
</script>

<template>
  <div>
    <header class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
          Équipe {{ report.team.name }}
        </h1>
        <p class="mt-1.5 max-w-prose text-label/[1.4] font-medium text-mist-600 lg:text-sm/[1.4]">
          {{ report.headcount }} personnes. Cet écran ne montre que des moyennes : aucun nom,
          aucune déclaration individuelle, aucun classement entre collègues — ni ici, ni dans
          l'interface qui l'alimente.
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

    <AggregateReport
      v-if="report.available"
      :days="report.days"
      :headcount="report.headcount"
      :threshold="report.threshold"
      :series="report.series"
      :totals="report.totals"
      :trends="report.trends"
    />

    <!-- Alternative A1 de CU-12 : sous le seuil, **aucun agrégat n'est calculé
         ni transmis**. Le message explique la règle et invite à élargir la
         période, au lieu de laisser croire à une panne. -->
    <section
      v-else
      class="rounded-3xl bg-surface px-6.5 py-6 shadow-card"
    >
      <h2 class="font-display text-xl/[1.2] text-fg">
        Pas assez de déclarations pour calculer une moyenne
      </h2>
      <p class="mt-2.5 max-w-prose text-sm/[1.6] text-fg-muted">
        Moins de {{ report.threshold }} personnes de votre équipe ont déclaré leur ressenti
        sur cette période. En dessous de ce seuil, une moyenne cesse d'être une moyenne :
        elle laisse deviner qui a répondu quoi. Aucun agrégat n'est donc calculé — le
        serveur ne les produit même pas.
      </p>
      <p class="mt-3 max-w-prose text-sm/[1.6] text-fg-muted">
        Ce n'est pas un défaut d'affichage : c'est la contrepartie de ce que ZenTime promet
        à vos collègues, et c'est aussi ce qui les fait déclarer.
      </p>

      <div class="mt-5 flex flex-wrap gap-2.5">
        <button
          v-if="period === 'semaine'"
          type="button"
          class="rounded-lg bg-accent px-5 py-3 text-label/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
          @click="selectPeriod('mois')"
        >
          Élargir au mois
        </button>
        <NuxtLink
          to="/tableau-de-bord"
          class="rounded-lg bg-surface-soft px-5 py-3 text-label/none font-bold text-fg-soft transition-colors hover:bg-mist-300"
        >
          Retour à mon tableau de bord
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
