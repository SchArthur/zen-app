<script setup lang="ts">
/**
 * Champ de formulaire : libellé, saisie, aide et motifs de refus.
 *
 * Réunis dans un composant parce que le câblage ARIA est justement la partie
 * qu'on abîme en la recopiant : `aria-describedby` ne doit désigner que des
 * éléments réellement présents, sous peine de renvoyer les lecteurs d'écran
 * vers du vide.
 *
 * Les erreurs arrivent en liste : le serveur renvoie un message par critère
 * non respecté, et les résumer en « champ invalide » retirerait à l'utilisateur
 * ce qu'il lui manque pour corriger.
 */
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  id: string
  label: string
  hint?: string
  errors?: string[]
}>()

const model = defineModel<string>({ required: true })

const invalid = computed(() => Boolean(props.errors?.length))

const describedBy = computed(() => [
  props.hint ? `${props.id}-hint` : null,
  invalid.value ? `${props.id}-error` : null,
].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div>
    <label
      :for="id"
      class="block text-label font-bold text-fg-soft"
    >{{ label }}</label>

    <input
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      class="mt-1.5 w-full rounded-md border bg-mist-100 px-3.5 py-2.75 text-sm text-fg transition-colors placeholder:text-placeholder focus:bg-surface"
      :class="invalid ? 'border-danger' : 'border-transparent focus:border-accent'"
    >

    <p
      v-if="hint"
      :id="`${id}-hint`"
      class="mt-1.5 text-caption/[1.45] text-fg-faint"
    >
      {{ hint }}
    </p>

    <ul
      v-if="invalid"
      :id="`${id}-error`"
      class="mt-1.5 flex flex-col gap-0.5"
    >
      <li
        v-for="reason in errors"
        :key="reason"
        class="text-caption/[1.45] font-semibold text-danger-strong"
      >
        {{ reason }}
      </li>
    </ul>
  </div>
</template>
