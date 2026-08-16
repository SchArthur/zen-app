<script setup lang="ts">
/**
 * Marque ZenTime : le point sauge dans son halo, puis le mot.
 *
 * Le halo ne respire que sur demande. Dans une barre latérale visible en
 * permanence, une animation en boucle cesse d'être apaisante pour devenir un
 * tic — la maquette ne l'anime que sur les grands formats d'accueil.
 */
defineProps<{ animated?: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-2.75">
    <span class="relative inline-flex size-7.5 items-center justify-center">
      <span
        class="absolute inset-0 rounded-full bg-accent-soft"
        :class="{ 'animate-breath': animated }"
      />
      <span class="relative size-3.25 rounded-full bg-accent" />
    </span>
    <span class="text-xl/none font-extrabold tracking-brand text-fg">ZenTime</span>
  </span>
</template>
