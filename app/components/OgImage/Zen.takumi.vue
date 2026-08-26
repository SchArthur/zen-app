<script setup lang="ts">
/**
 * Image de partage (1200 × 630), rendue côté serveur par nuxt-og-image.
 *
 * Écrite en styles **en ligne** et en flexbox seule : le moteur de rendu n'est
 * pas un navigateur, il ne connaît ni la grille, ni les classes utilitaires du
 * thème, ni les polices auto-hébergées de l'application. Recopier ici les
 * quelques valeurs de la charte est le prix à payer pour que l'image existe —
 * et elles sont peu nombreuses.
 */
withDefaults(defineProps<{ title?: string, subtitle?: string }>(), {
  title: 'Le bien-être au travail, une pause à la fois',
  subtitle: '',
})
</script>

<template>
  <div
    style="display: flex; flex-direction: column; justify-content: space-between;
           width: 100%; height: 100%; padding: 72px; background-color: #e7e5df;"
  >
    <!-- Marque : le point sauge dans son halo, puis le mot. -->
    <div style="display: flex; align-items: center;">
      <div
        style="display: flex; align-items: center; justify-content: center;
               width: 56px; height: 56px; border-radius: 9999px; background-color: #e6f0e8;"
      >
        <div style="width: 24px; height: 24px; border-radius: 9999px; background-color: #5e9576;" />
      </div>
      <div style="margin-left: 20px; font-size: 40px; font-weight: 800; color: #2c362f; letter-spacing: -0.02em;">
        ZenTime
      </div>
    </div>

    <div style="display: flex; flex-direction: column;">
      <div style="font-size: 64px; line-height: 1.1; color: #2c362f; max-width: 900px;">
        {{ title }}
      </div>
      <div
        v-if="subtitle"
        style="margin-top: 28px; font-size: 30px; line-height: 1.4; color: #5b635c; max-width: 900px;"
      >
        {{ subtitle }}
      </div>
    </div>

    <div style="display: flex; align-items: center;">
      <div style="width: 40px; height: 6px; border-radius: 9999px; background-color: #5e9576;" />
      <!-- Pied fixe : l'adresse, pas une accroche. La phrase variable est déjà
           au-dessus, et la répéter ferait perdre la seule ligne de l'image qui
           serve à quelque chose une fois la vignette partagée. -->
      <div style="margin-left: 20px; font-size: 24px; color: #7d847d;">
        zentime.fr
      </div>
    </div>
  </div>
</template>
