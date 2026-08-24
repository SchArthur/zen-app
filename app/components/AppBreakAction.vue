<script setup lang="ts">
/**
 * Démarrer une pause en **une** interaction, depuis n'importe quel écran.
 *
 * C'est le point 1 du scénario nominal de CU-07 — « le collaborateur démarre
 * une pause depuis n'importe quel écran, en une interaction » — et le critère
 * M de F3. Jusqu'ici le seul bouton de démarrage vivait sur `/pauses` : depuis
 * les exercices, l'humeur ou les statistiques, prendre une pause demandait
 * d'aller d'abord chercher l'écran du minuteur. Deux interactions, dont une qui
 * n'a rien à voir avec la pause.
 *
 * **Le clic démarre la pause, puis mène au minuteur.** L'enchaînement n'est pas
 * un raccourci de confort : c'est le point 2 du même scénario, « le système
 * enregistre l'heure de début **et affiche le minuteur** ». Il règle du même
 * coup la question de l'état partagé — l'écran d'arrivée relit le serveur, et
 * aucun autre écran n'a besoin de savoir qu'une pause vient de commencer.
 *
 * **Une pause déjà en cours n'est pas une erreur ici.** Le second onglet, le
 * retour arrière et le double clic produisent tous le 409 de `POST /api/breaks`.
 * Du point de vue de la personne, le résultat voulu est atteint : elle est en
 * pause. On la mène au minuteur sans rien lui reprocher. Les autres échecs,
 * eux, restent affichés sur place — la pause n'a pas démarré, l'emmener sur un
 * minuteur à l'arrêt sans un mot serait un mensonge par omission.
 */
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  label?: string
  /**
   * Classes du conteneur, quand c'est lui que la mise en page doit atteindre —
   * `mt-auto` dans une carte en colonne, par exemple. Les attributs passés
   * normalement, `class` comprise, vont au bouton : c'est lui qu'on habille
   * dans la grande majorité des cas.
   */
  rootClass?: string
}>(), {
  label: 'Prendre une pause',
  rootClass: undefined,
})

const pending = ref(false)
const message = ref('')

async function start() {
  pending.value = true
  message.value = ''

  try {
    await $fetch('/api/breaks', { method: 'POST' })
    await navigateTo('/pauses')
  }
  catch (error) {
    const apiError = toApiError(error)

    if (apiError.code === 'break_already_running') {
      await navigateTo('/pauses')

      return
    }

    message.value = apiError.message
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div :class="rootClass">
    <button
      type="button"
      :disabled="pending"
      v-bind="$attrs"
      @click="start"
    >
      {{ pending ? 'Démarrage…' : label }}
    </button>

    <!-- `role="alert"` : l'échec survient après le clic, il doit être annoncé
         sans que la personne ait à repartir à sa recherche. -->
    <p
      v-if="message"
      role="alert"
      class="mt-2 text-caption/[1.45] font-semibold text-danger-strong"
    >
      {{ message }}
    </p>
  </div>
</template>
