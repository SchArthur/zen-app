<script setup lang="ts" generic="T extends string | number">
/**
 * Liste déroulante : libellé, choix, aide et motifs de refus.
 *
 * Pendant d'AppField pour un `select`. Les deux composants se ressemblent parce
 * que la partie qui compte — le câblage `aria-describedby`, qui ne doit désigner
 * que des éléments réellement présents — est justement celle qu'on abîme en la
 * recopiant d'un champ à l'autre.
 *
 * Les options sont fournies par l'appelant. Une option dont la valeur est liée
 * par `:value` conserve son type : un `<option :value="9">` renvoie le nombre 9,
 * pas la chaîne « 9 », et le serveur reçoit bien un entier.
 */
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  id: string
  label: string
  hint?: string
  errors?: string[]
}>()

const model = defineModel<T>({ required: true })

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

    <select
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      class="mt-1.5 w-full rounded-md border bg-mist-100 px-3.5 py-2.75 text-sm text-fg transition-colors focus:bg-surface disabled:cursor-not-allowed disabled:text-fg-disabled"
      :class="invalid ? 'border-danger' : 'border-transparent focus:border-accent'"
    >
      <slot />
    </select>

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
