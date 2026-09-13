<script setup lang="ts">
/**
 * Anneau de progression : une valeur rapportée à un objectif.
 *
 * Il portait un « indice de bien-être sur 100 » dans la maquette. F7 l'interdit
 * — « aucun score global de bien-être, aucune comparaison avec d'autres
 * utilisateurs » — pour une raison qui tient en une phrase de son critère R : ne
 * pas transformer le bien-être en performance. Un score agrège des ressentis
 * déclarés en une note, et une note se compare.
 *
 * L'anneau mesure donc désormais une progression vers un objectif que
 * l'utilisateur s'est lui-même donné, ce qui n'est pas la même chose : le
 * dénominateur vient de ses propres réglages, et il n'a de sens que pour lui.
 *
 * Le contenu du centre est laissé à l'appelant, qui n'affiche pas toujours le
 * total.
 */
const props = withDefaults(defineProps<{
  /** Valeur à représenter, dans l'unité de `max`. */
  value: number
  /** Description lue par les lecteurs d'écran — le SVG, lui, est décoratif. */
  label: string
  max?: number
  /** Diamètre en pixels. Le rayon et l'épaisseur en découlent. */
  size?: number
  stroke?: number
}>(), { max: 100, size: 118, stroke: 11 })

const center = computed(() => props.size / 2)
const radius = computed(() => props.size / 2 - props.stroke)
const circumference = computed(() => 2 * Math.PI * radius.value)

// Une valeur hors bornes viendrait d'une donnée fausse, pas d'un choix de
// design : on la ramène dans l'anneau plutôt que de dessiner n'importe quoi.
const ratio = computed(() => Math.min(Math.max(props.value / props.max, 0), 1))
const offset = computed(() => circumference.value * (1 - ratio.value))
</script>

<template>
  <div
    class="relative shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    :aria-label="label"
  >
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      aria-hidden="true"
    >
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        class="stroke-mist-200"
        :stroke-width="stroke"
      />
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        class="stroke-accent"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        :transform="`rotate(-90 ${center} ${center})`"
      />
    </svg>

    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <slot />
    </div>
  </div>
</template>
