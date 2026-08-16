<script setup lang="ts">
/**
 * Bandeau de message : confirmation, information ou refus.
 *
 * Reprend le bandeau RGPD de la maquette (fond doux, pastille, texte de 13 px)
 * décliné sur les quatre états du thème. Aucun rouge vif : la charte proscrit
 * l'alarme agressive, même pour dire non.
 *
 * Le rôle ARIA revient à l'appelant : `role="alert"` interrompt la lecture en
 * cours, `role="status"` attend la fin. Tout n'a pas la même urgence.
 */
withDefaults(defineProps<{ tone?: 'info' | 'success' | 'warning' | 'danger' }>(), {
  tone: 'info',
})

const surfaces = {
  info: 'bg-info-soft text-info-strong',
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  danger: 'bg-danger-soft text-danger-strong',
}

const dots = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}
</script>

<template>
  <div
    class="flex items-start gap-2.75 rounded-lg px-4.5 py-3 text-label/[1.45] font-semibold"
    :class="surfaces[tone]"
  >
    <span
      aria-hidden="true"
      class="mt-1.5 size-2 shrink-0 rounded-full"
      :class="dots[tone]"
    />
    <span><slot /></span>
  </div>
</template>
