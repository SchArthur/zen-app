<script setup lang="ts">
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Line } from 'vue-chartjs'

/**
 * Graphique du tableau de bord (F7).
 *
 * Deux choses valent d'être dites sur ce composant.
 *
 * **1. Le graphique n'est pas la donnée.** Un `<canvas>` est un rectangle de
 * pixels : un lecteur d'écran n'y trouve rien, et une extension de contraste ne
 * peut rien en faire. Le composant rend donc **toujours** un tableau HTML
 * complet, masqué visuellement, et marque le canvas comme décoratif. Le tableau
 * n'est pas un pis-aller : c'est la version de référence, le dessin en est
 * l'illustration.
 *
 * **2. Les couleurs viennent du thème, pas du code.** Elles sont lues sur les
 * variables CSS `--color-chart-*` au montage, ce pour quoi le thème les déclare
 * en `@theme static`. Recopier des codes hexadécimaux ici ferait deux palettes
 * à maintenir, et la seconde dériverait sans qu'on s'en aperçoive.
 *
 * Une valeur `null` reste un trou dans la courbe, jamais un zéro : c'est
 * l'alternative A2 de CU-09 traduite en pixels.
 */
ChartJS.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
)

export interface ChartSeries {
  label: string
  values: (number | null)[]
  /** Nom du token de couleur du thème, sans le préfixe `--color-`. */
  tone: string
  /** Unité affichée dans le tableau équivalent. */
  unit?: string
}

const props = withDefaults(defineProps<{
  type: 'bar' | 'line'
  /** Étiquettes courtes de l'axe. */
  labels: string[]
  /** Étiquettes complètes, pour le tableau et les infobulles. */
  fullLabels: string[]
  series: ChartSeries[]
  /** Légende du tableau équivalent : ce que le graphique montre, en une phrase. */
  caption: string
  /** Borne haute de l'axe. Absente, l'échelle s'ajuste aux données. */
  max?: number
  height?: number
}>(), { max: undefined, height: 232 })

/**
 * Couleurs résolues au montage.
 *
 * Vide côté serveur : le graphique est de toute façon rendu par le navigateur,
 * et `getComputedStyle` n'existe pas ailleurs.
 */
const tones = ref<Record<string, string>>({})

const reducedMotion = ref(false)
const gridColor = ref('#eaf0ea')
const tickColor = ref('#9a9890')

onMounted(() => {
  const styles = getComputedStyle(document.documentElement)
  const token = (name: string) => styles.getPropertyValue(`--color-${name}`).trim()

  tones.value = Object.fromEntries(props.series.map(item => [item.tone, token(item.tone)]))

  gridColor.value = token('chart-grid') || gridColor.value
  tickColor.value = token('fg-faint') || tickColor.value

  // Le halo de respiration se tait déjà sous `prefers-reduced-motion` ; une
  // courbe qui se dessine à chaque changement de période ferait exactement ce
  // que ce réglage demande d'éviter.
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

const data = computed(() => ({
  labels: props.labels,
  datasets: props.series.map(item => ({
    label: item.label,
    data: item.values,
    backgroundColor: tones.value[item.tone] ?? 'transparent',
    borderColor: tones.value[item.tone] ?? 'transparent',
    borderWidth: props.type === 'line' ? 2 : 0,
    borderRadius: props.type === 'bar' ? 4 : undefined,
    pointRadius: props.type === 'line' ? 3 : undefined,
    pointHoverRadius: props.type === 'line' ? 5 : undefined,
    tension: props.type === 'line' ? 0.35 : undefined,
    // Une journée non déclarée laisse un trou. `spanGaps` la relierait à la
    // suivante, ce qui inventerait une continuité que personne n'a déclarée.
    spanGaps: false,
  })),
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: reducedMotion.value ? (false as const) : undefined,
  plugins: {
    // La légende est rendue en HTML à côté du graphique : celle de Chart.js est
    // dessinée dans le canvas, donc invisible aux lecteurs d'écran.
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items: { dataIndex: number }[]) => props.fullLabels[items[0]!.dataIndex] ?? '',
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: tickColor.value, font: { size: 11 } },
    },
    y: {
      beginAtZero: true,
      max: props.max,
      grid: { color: gridColor.value },
      border: { display: false },
      ticks: { color: tickColor.value, font: { size: 11 }, precision: 0, maxTicksLimit: 5 },
    },
  },
}))

/**
 * Valeur affichée dans le tableau : « — » pour une journée sans donnée.
 *
 * Arrondie à une décimale, comme partout ailleurs dans le produit. Une moyenne
 * d'équipe brute vaut « 3,888888888888889 » : la précision affichée suggérerait
 * une exactitude que six déclarations ne portent pas, et le tableau équivalent
 * doit se lire aussi facilement que le graphique.
 */
function cell(value: number | null, unit?: string) {
  if (value === null) return '—'

  const formatted = value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

  return unit ? `${formatted} ${unit}` : formatted
}
</script>

<template>
  <div>
    <!-- Légende, en HTML : celle de Chart.js vit dans le canvas. -->
    <ul class="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
      <li
        v-for="item in series"
        :key="item.label"
        class="flex items-center gap-1.75 text-caption font-semibold text-fg-muted"
      >
        <span
          aria-hidden="true"
          class="size-2.5 rounded-full"
          :style="{ backgroundColor: `var(--color-${item.tone})` }"
        />
        {{ item.label }}
      </li>
    </ul>

    <!-- Le dessin est décoratif : tout ce qu'il montre est dans le tableau. -->
    <div
      aria-hidden="true"
      :style="{ height: `${height}px` }"
    >
      <ClientOnly>
        <Bar
          v-if="type === 'bar'"
          :data="data"
          :options="options"
        />
        <Line
          v-else
          :data="data"
          :options="options"
        />

        <template #fallback>
          <div class="size-full rounded-xl bg-surface-soft" />
        </template>
      </ClientOnly>
    </div>

    <!-- Version de référence. Masquée visuellement, jamais du DOM.
         Le `sr-only` porte sur un conteneur bloc et non sur le tableau : une
         boîte `display: table` traite `width: 1px` comme un minimum, s'étale à
         la largeur de son contenu, et — étant positionnée en absolu — élargit la
         zone de défilement de la page. Un tableau de trente lignes suffisait
         ainsi à faire défiler l'écran horizontalement, ce que NF4 interdit. -->
    <div class="sr-only">
      <table>
        <caption>{{ caption }}</caption>
        <thead>
          <tr>
            <th scope="col">Journée</th>
            <th
              v-for="item in series"
              :key="item.label"
              scope="col"
            >
              {{ item.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(label, index) in fullLabels"
            :key="label"
          >
            <th scope="row">{{ label }}</th>
            <td
              v-for="item in series"
              :key="item.label"
            >
              {{ cell(item.values[index] ?? null, item.unit) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
