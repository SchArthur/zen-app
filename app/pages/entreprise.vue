<script setup lang="ts">
// CU-13 — Consulter les indicateurs de l'entreprise ; CU-14 — les exporter.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Indicateurs de l\'entreprise' })

const PERIOD_LABELS = { semaine: 'Cette semaine', mois: 'Ce mois-ci' } as const

type Period = keyof typeof PERIOD_LABELS

const route = useRoute()
const router = useRouter()

const period = computed<Period>(() => (route.query.periode === 'mois' ? 'mois' : 'semaine'))

const { data, error } = await useFetch('/api/company', {
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
  throw createError({ statusCode: 502, statusMessage: 'Les indicateurs n\'ont pas pu être chargés. Réessayez dans un instant.' })
}

const report = computed(() => data.value!)

function selectPeriod(value: Period) {
  return router.push({ query: value === 'semaine' ? {} : { periode: value } })
}

const exporting = ref(false)
const message = ref('')
const tone = ref<'success' | 'danger'>('success')

/**
 * Téléchargement de l'export (CU-14).
 *
 * Le fichier est récupéré par `fetch` plutôt que par un simple lien : c'est ce
 * qui permet d'afficher un refus lisible — seuil non atteint, session expirée —
 * là où un lien direct ouvrirait un onglet sur une page d'erreur JSON.
 *
 * Le nom de fichier vient du serveur, qui l'a construit avec l'entreprise et la
 * période. Le recomposer ici ferait deux vérités pour un même fichier.
 */
async function exportCsv() {
  exporting.value = true
  message.value = ''

  try {
    const response = await $fetch.raw('/api/company/export', {
      query: { period: period.value },
    })

    const disposition = response.headers.get('content-disposition') ?? ''
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'zentime-indicateurs.csv'

    // Le fichier est reconstitué à partir du texte reçu plutôt que demandé en
    // binaire : la marque d'ordre d'octets fait partie de la chaîne, elle
    // traverse donc intacte, et le type de retour de la route reste vérifiable.
    const url = URL.createObjectURL(
      new Blob([response._data ?? ''], { type: 'text/csv;charset=utf-8' }),
    )

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()

    // Sans révocation, le blob reste en mémoire jusqu'au rechargement de la page.
    URL.revokeObjectURL(url)

    tone.value = 'success'
    message.value = `Export « ${filename} » téléchargé.`
  }
  catch (requestError) {
    tone.value = 'danger'
    message.value = toApiError(requestError).message
  }
  finally {
    exporting.value = false
  }
}
</script>

<template>
  <div>
    <header class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
          {{ report.company.name }}
        </h1>
        <p class="mt-1.5 max-w-prose text-label/[1.4] font-medium text-mist-600 lg:text-sm/[1.4]">
          {{ report.headcount }} personnes. Les mêmes garanties que la vue d'équipe
          s'appliquent ici : que des moyennes, aucun nom, aucune déclaration individuelle,
          et le même seuil de {{ report.threshold }} déclarants.
        </p>
      </div>

      <div class="flex shrink-0 flex-wrap items-start gap-2.5">
        <div
          role="group"
          aria-label="Période"
          class="flex gap-1 rounded-xl bg-surface p-1 shadow-soft"
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

        <button
          v-if="report.available"
          type="button"
          :disabled="exporting"
          class="rounded-xl bg-fg px-4.5 py-3 text-label/none font-bold text-white transition-colors hover:bg-mist-900 disabled:cursor-not-allowed disabled:opacity-60"
          @click="exportCsv"
        >
          {{ exporting ? 'Export en cours…' : 'Exporter en CSV' }}
        </button>
      </div>
    </header>

    <AppAlert
      v-if="message"
      :role="tone === 'danger' ? 'alert' : 'status'"
      :tone="tone"
      class="mb-5"
    >
      {{ message }}
    </AppAlert>

    <AggregateReport
      v-if="report.available"
      :days="report.days"
      :headcount="report.headcount"
      :threshold="report.threshold"
      :series="report.series"
      :totals="report.totals"
      :trends="report.trends"
    />

    <section
      v-else
      class="rounded-3xl bg-surface px-6.5 py-6 shadow-card"
    >
      <h2 class="font-display text-xl/[1.2] text-fg">
        Pas assez de déclarations pour calculer une moyenne
      </h2>
      <p class="mt-2.5 max-w-prose text-sm/[1.6] text-fg-muted">
        Moins de {{ report.threshold }} personnes ont déclaré leur ressenti sur cette
        période. Le seuil vaut à l'échelle de l'entreprise comme à celle d'une équipe :
        une moyenne calculée sur trop peu de personnes laisse deviner qui a répondu quoi.
      </p>
      <p class="mt-3 max-w-prose text-sm/[1.6] text-fg-muted">
        L'export est également indisponible : il porte exactement les mêmes agrégats que
        cet écran, et n'a donc pas plus de raison d'exister.
      </p>

      <button
        v-if="period === 'semaine'"
        type="button"
        class="mt-5 rounded-lg bg-accent px-5 py-3 text-label/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
        @click="selectPeriod('mois')"
      >
        Élargir au mois
      </button>
    </section>
  </div>
</template>
