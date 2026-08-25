<script setup lang="ts">
import { exerciseTypeLabels, exerciseTypes } from '../utils/exercises'
import { roleLabels } from '../utils/roles'

// CU-06 — Gérer son profil et ses préférences.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Mon profil' })

const { fetch: refreshSession } = useUserSession()

const { data, error } = await useFetch('/api/profile')

if (error.value) {
  const apiError = toApiError(error.value)
  throw createError({
    statusCode: (error.value as { statusCode?: number }).statusCode ?? 502,
    statusMessage: apiError.message,
    data: { code: apiError.code },
  })
}

const loaded = data.value

// Le middleware `auth` a déjà exigé une session : ne rien recevoir ici est une
// panne, pas un cas d'usage. La page d'erreur de Nuxt le dit mieux qu'un
// formulaire vide, qui inviterait à réenregistrer des valeurs inventées.
if (!loaded) {
  throw createError({ statusCode: 502, statusMessage: 'Votre profil n\'a pas pu être chargé. Réessayez dans un instant.', data: { code: 'FETCH_ERROR' } })
}

const account = loaded.profile

// Les formulaires partent de l'état enregistré : aucune valeur par défaut n'est
// écrite ici, elles appartiennent à `schema.prisma`. La liste des types est
// recopiée et non partagée, sinon cocher une case modifierait la réponse reçue.
const identity = reactive({
  firstName: account.firstName,
  lastName: account.lastName,
})

const preferences = reactive({
  ...loaded.preferences,
  favoriteTypes: [...loaded.preferences.favoriteTypes],
})

interface FormState {
  pending: boolean
  tone: 'success' | 'danger'
  message: string
  errors: Record<string, string[]>
}

const identityForm = reactive<FormState>({ pending: false, tone: 'success', message: '', errors: {} })
const preferencesForm = reactive<FormState>({ pending: false, tone: 'success', message: '', errors: {} })

/**
 * Envoi d'un formulaire. Les deux passent par ici : dupliqué, l'un des deux
 * finirait par oublier de vider les motifs de refus du tour précédent, et
 * l'écran signalerait un champ déjà corrigé.
 */
async function save(state: FormState, request: () => Promise<unknown>) {
  state.pending = true
  state.message = ''
  state.errors = {}

  try {
    await request()
    state.tone = 'success'
    state.message = 'Vos modifications sont enregistrées.'
  }
  catch (error) {
    const apiError = toApiError(error)
    state.tone = 'danger'
    state.errors = apiError.errors
    state.message = Object.keys(apiError.errors).length
      ? 'Vérifiez les champs signalés ci-dessous.'
      : apiError.message
  }
  finally {
    state.pending = false
  }
}

function saveIdentity() {
  return save(identityForm, async () => {
    await $fetch('/api/profile', { method: 'PATCH', body: identity })
    // Le nom affiché dans la navigation vient de la session : sans cette
    // relecture, l'ancien resterait à l'écran jusqu'à la prochaine connexion.
    await refreshSession()
  })
}

function savePreferences() {
  return save(preferencesForm, async () => {
    await $fetch('/api/profile/preferences', { method: 'PUT', body: { ...preferences } })
  })
}

/** Journée de travail : le début peut être minuit, la fin se dit alors « 24 h ». */
const startHours = Array.from({ length: 24 }, (_, hour) => hour)
const endHours = Array.from({ length: 24 }, (_, index) => index + 1)

// Sous-ensemble des bornes acceptées par le serveur (30 à 120 minutes, CU-07) :
// une liste courte se choisit d'un coup d'œil, là où 91 valeurs se parcourent.
const reminderIntervals = [30, 45, 60, 90, 120]

function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')} h 00`
}

function formatInterval(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`

  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)} h ${rest}` : `${minutes / 60} h`
}

// La description du groupe de cases : `aria-describedby` ne doit désigner que
// des éléments présents, et la liste des refus n'existe qu'après un refus.
const favoriteTypesDescribedBy = computed(() =>
  preferencesForm.errors.favoriteTypes ? 'favoriteTypes-hint favoriteTypes-error' : 'favoriteTypes-hint',
)
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
        Mon profil
      </h1>
      <p class="mt-1.5 text-label/[1.4] font-medium text-mist-600 lg:text-sm/[1.4]">
        Vos informations et vos réglages, modifiables à tout moment.
      </p>
    </header>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- Identité -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card lg:col-span-2">
        <h2 class="text-label font-bold text-fg-subtle">Identité</h2>

        <form
          novalidate
          class="mt-4 flex flex-col gap-4"
          @submit.prevent="saveIdentity"
        >
          <AppAlert
            v-if="identityForm.message"
            :role="identityForm.tone === 'danger' ? 'alert' : 'status'"
            :tone="identityForm.tone"
          >
            {{ identityForm.message }}
          </AppAlert>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppField
              id="firstName"
              v-model="identity.firstName"
              label="Prénom"
              type="text"
              autocomplete="given-name"
              required
              :errors="identityForm.errors.firstName"
            />

            <AppField
              id="lastName"
              v-model="identity.lastName"
              label="Nom"
              type="text"
              autocomplete="family-name"
              required
              :errors="identityForm.errors.lastName"
            />
          </div>

          <button
            type="submit"
            :disabled="identityForm.pending"
            class="self-start rounded-lg bg-accent px-5.5 py-3.25 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ identityForm.pending ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </form>
      </section>

      <!-- Compte : ce qui est attaché au compte et ne se règle pas ici -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Compte</h2>

        <dl class="mt-4 flex flex-col gap-3.5">
          <div>
            <dt class="text-caption font-semibold text-fg-faint">Adresse email</dt>
            <dd class="mt-0.5 text-label/[1.4] font-semibold break-all text-fg-soft">
              {{ account.email }}
            </dd>
          </div>
          <div>
            <dt class="text-caption font-semibold text-fg-faint">Rôle</dt>
            <dd class="mt-0.5 text-label/[1.4] font-semibold text-fg-soft">
              {{ roleLabels[account.role] }}
            </dd>
          </div>
          <div>
            <dt class="text-caption font-semibold text-fg-faint">Entreprise</dt>
            <dd class="mt-0.5 text-label/[1.4] font-semibold text-fg-soft">
              {{ account.company }}
            </dd>
          </div>
          <div>
            <dt class="text-caption font-semibold text-fg-faint">Équipe</dt>
            <dd class="mt-0.5 text-label/[1.4] font-semibold text-fg-soft">
              {{ account.team ?? 'Aucune équipe' }}
            </dd>
          </div>
        </dl>

        <p class="mt-4 rounded-xl bg-surface-soft px-4 py-3 text-caption/[1.5] text-fg-muted">
          L'adresse email sert d'identifiant de connexion et rattache le compte à son
          entreprise. Le rôle et l'équipe sont attribués par l'entreprise : votre
          responsable RH peut les faire évoluer.
        </p>
      </section>

      <!-- Préférences -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card lg:col-span-3">
        <h2 class="text-label font-bold text-fg-subtle">Préférences</h2>
        <p class="mt-1.5 text-caption/[1.5] text-fg-muted">
          Elles règlent le moment des rappels et le choix des exercices proposés.
          Aucun rappel n'est envoyé en dehors de vos horaires déclarés.
        </p>

        <form
          novalidate
          class="mt-4 flex flex-col gap-6"
          @submit.prevent="savePreferences"
        >
          <AppAlert
            v-if="preferencesForm.message"
            :role="preferencesForm.tone === 'danger' ? 'alert' : 'status'"
            :tone="preferencesForm.tone"
          >
            {{ preferencesForm.message }}
          </AppAlert>

          <fieldset>
            <legend class="text-label font-bold text-fg-soft">Horaires de travail</legend>

            <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
              <AppSelect
                id="workStartHour"
                v-model="preferences.workStartHour"
                label="Début de journée"
                :errors="preferencesForm.errors.workStartHour"
              >
                <option
                  v-for="hour in startHours"
                  :key="hour"
                  :value="hour"
                >
                  {{ formatHour(hour) }}
                </option>
              </AppSelect>

              <AppSelect
                id="workEndHour"
                v-model="preferences.workEndHour"
                label="Fin de journée"
                :errors="preferencesForm.errors.workEndHour"
              >
                <option
                  v-for="hour in endHours"
                  :key="hour"
                  :value="hour"
                >
                  {{ formatHour(hour) }}
                </option>
              </AppSelect>
            </div>
          </fieldset>

          <fieldset>
            <legend class="text-label font-bold text-fg-soft">Rappels de pause</legend>

            <div class="mt-3 flex items-start gap-2.5">
              <input
                id="remindersEnabled"
                v-model="preferences.remindersEnabled"
                type="checkbox"
                class="mt-0.5 size-4.5 shrink-0 accent-accent"
              >
              <label
                for="remindersEnabled"
                class="text-caption/[1.5] text-fg-muted"
              >
                M'inviter à faire une pause quand je suis resté trop longtemps assis.
              </label>
            </div>

            <div class="mt-4 sm:max-w-xs">
              <AppSelect
                id="reminderIntervalMin"
                v-model="preferences.reminderIntervalMin"
                label="Au bout de"
                hint="De 30 minutes à 2 heures. Un rappel n'est jamais bloquant : il se reporte ou s'ignore."
                :disabled="!preferences.remindersEnabled"
                :errors="preferencesForm.errors.reminderIntervalMin"
              >
                <option
                  v-for="minutes in reminderIntervals"
                  :key="minutes"
                  :value="minutes"
                >
                  {{ formatInterval(minutes) }}
                </option>
              </AppSelect>
            </div>
          </fieldset>

          <fieldset :aria-describedby="favoriteTypesDescribedBy">
            <legend class="text-label font-bold text-fg-soft">Exercices que vous appréciez</legend>
            <p
              id="favoriteTypes-hint"
              class="mt-1.5 text-caption/[1.5] text-fg-muted"
            >
              Les suggestions puiseront d'abord dans ces familles. Sans coche, tout le
              catalogue reste proposé.
            </p>

            <div class="mt-3 flex flex-wrap gap-2.5">
              <label
                v-for="type in exerciseTypes"
                :key="type"
                class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-mist-100 px-4 py-2.75 transition-colors hover:bg-surface-sunken has-checked:border-accent-muted has-checked:bg-accent-soft"
              >
                <input
                  v-model="preferences.favoriteTypes"
                  type="checkbox"
                  :value="type"
                  class="size-4.5 shrink-0 accent-accent"
                >
                <span class="text-label font-semibold text-fg-soft">
                  {{ exerciseTypeLabels[type] }}
                </span>
              </label>
            </div>

            <ul
              v-if="preferencesForm.errors.favoriteTypes"
              id="favoriteTypes-error"
              class="mt-1.5 flex flex-col gap-0.5"
            >
              <li
                v-for="reason in preferencesForm.errors.favoriteTypes"
                :key="reason"
                class="text-caption/[1.45] font-semibold text-danger-strong"
              >
                {{ reason }}
              </li>
            </ul>
          </fieldset>

          <button
            type="submit"
            :disabled="preferencesForm.pending"
            class="self-start rounded-lg bg-accent px-5.5 py-3.25 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ preferencesForm.pending ? 'Enregistrement…' : 'Enregistrer mes préférences' }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>
