<script setup lang="ts">
/**
 * Écrans d'entrée : une carte seule, centrée, sur le fond calme de
 * l'application.
 *
 * Aucune maquette ne les couvre. La mise en page reprend donc des éléments
 * déjà définis ailleurs — marque qui respire, accroche en Newsreader italique
 * de la planche d'intro, carte blanche à grand rayon — plutôt que d'inventer
 * un troisième langage visuel.
 */
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center px-5 py-10">
    <div class="w-full max-w-md">
      <div class="mb-7 flex flex-col items-center gap-2.5 text-center">
        <AppLogo
          animated
          large
        />
        <p class="font-display text-lg text-fg-muted italic">
          Bien-être &amp; santé au travail
        </p>
      </div>

      <div class="rounded-3xl bg-surface px-6 py-7 shadow-card sm:px-8">
        <slot />
      </div>

      <!-- Les garanties de confidentialité s'annoncent **avant** l'inscription
           (F12), pas une fois le compte créé. -->
      <p class="mt-5 text-center text-caption text-fg-faint">
        <NuxtLink
          to="/confidentialite"
          class="font-semibold underline underline-offset-2 hover:text-fg-muted"
        >
          Politique de confidentialité
        </NuxtLink>
      </p>
    </div>
  </main>
</template>
