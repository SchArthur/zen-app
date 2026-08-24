<script setup lang="ts">
import type { ScaleLevel } from '../utils/mood'

/**
 * Échelle à cinq niveaux du check-in quotidien (CU-09).
 *
 * Bâtie sur de vrais boutons radio, visuellement masqués : la navigation au
 * clavier (flèches, tabulation d'un groupe à l'autre), le regroupement par
 * `name` et l'annonce « 3 sur 5 » par les lecteurs d'écran sont alors ceux du
 * navigateur. Un `role="radiogroup"` posé sur des `<button>` obligerait à les
 * réécrire à la main, moins bien.
 *
 * Aucune valeur n'est pré-cochée — F5 l'exige : une valeur par défaut serait
 * envoyée telle quelle par tous ceux qui ouvrent l'écran sans y penser, et le
 * produit croirait mesurer un ressenti alors qu'il mesurerait une inertie.
 *
 * Les trois attributs d'un niveau sont visibles en même temps : couleur de la
 * barre, hauteur de la barre, libellé sous la barre. Aucun n'est réservé au
 * survol, qui n'existe pas au doigt.
 */
const props = defineProps<{
  id: string
  legend: string
  hint?: string
  levels: ScaleLevel[]
  errors?: string[]
}>()

const model = defineModel<number | null>({ required: true })

const invalid = computed(() => Boolean(props.errors?.length))

const describedBy = computed(() => [
  props.hint ? `${props.id}-hint` : null,
  invalid.value ? `${props.id}-error` : null,
].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <fieldset :aria-describedby="describedBy">
    <legend class="text-label font-bold text-fg-soft">{{ legend }}</legend>

    <p
      v-if="hint"
      :id="`${id}-hint`"
      class="mt-1 text-caption/[1.45] text-fg-faint"
    >
      {{ hint }}
    </p>

    <div
      class="mt-3.5 flex items-end gap-1.5 sm:gap-2.5"
      :class="invalid && 'rounded-xl outline-2 outline-offset-6 outline-danger'"
    >
      <label
        v-for="level in levels"
        :key="level.value"
        class="group flex flex-1 cursor-pointer flex-col items-center gap-2"
      >
        <input
          v-model="model"
          type="radio"
          class="peer sr-only"
          :name="id"
          :value="level.value"
          :aria-invalid="invalid"
        >

        <!-- Hauteur croissante : c'est la « forme » du niveau au sens de F5.
             Le conteneur garde une hauteur fixe pour que les barres restent
             alignées par le bas, comme un histogramme. C'est lui qui porte les
             variantes `peer-*` : elles ne franchissent qu'un lien de fratrie,
             et l'opacité qu'il prend se voit sur la barre qu'il contient. -->
        <span
          aria-hidden="true"
          class="flex h-14 w-full items-end opacity-40 transition-opacity group-hover:opacity-70 peer-checked:opacity-100 sm:h-16"
        >
          <span
            class="w-full rounded-md transition-[height]"
            :class="level.tone"
            :style="{ height: `${level.weight * 100}%` }"
          />
        </span>

        <span
          class="text-center text-caption/[1.25] font-semibold text-fg-faint transition-colors group-hover:text-fg-muted peer-checked:font-bold peer-checked:text-fg peer-focus-visible:underline peer-focus-visible:underline-offset-4"
        >
          {{ level.label }}
        </span>
      </label>
    </div>

    <ul
      v-if="invalid"
      :id="`${id}-error`"
      class="mt-3 flex flex-col gap-0.5"
    >
      <li
        v-for="reason in errors"
        :key="reason"
        class="text-caption/[1.45] font-semibold text-danger-strong"
      >
        {{ reason }}
      </li>
    </ul>
  </fieldset>
</template>
