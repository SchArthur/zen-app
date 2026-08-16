<script setup lang="ts">
/**
 * Marque ZenTime : le point sauge dans son halo, puis le mot.
 *
 * Le halo ne respire que sur demande. Dans une barre latérale visible en
 * permanence, une animation en boucle cesse d'être apaisante pour devenir un
 * tic — la maquette ne l'anime que sur les grands formats d'accueil.
 */
defineProps<{ animated?: boolean, large?: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-2.75">
    <span
      class="relative inline-flex items-center justify-center"
      :class="large ? 'size-8.5' : 'size-7.5'"
    >
      <span
        class="absolute inset-0 rounded-full bg-accent-soft"
        :class="{ 'animate-breath': animated }"
      />
      <span
        class="relative rounded-full bg-accent"
        :class="large ? 'size-3.75' : 'size-3.25'"
      />
    </span>
    <span
      class="font-extrabold tracking-brand text-fg"
      :class="large ? 'text-3xl/none' : 'text-xl/none'"
    >ZenTime</span>
  </span>
</template>
