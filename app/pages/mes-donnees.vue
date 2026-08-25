<script setup lang="ts">
import { APP_TIME_ZONE } from '#shared/utils/time'

// CU-05 — Exercer ses droits sur ses données. CU-04 pour la partie consentement.
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

useSeoMeta({ title: 'Mes données' })

const { clear } = useUserSession()

const { data, error } = await useFetch('/api/consent')

if (error.value) {
  const apiError = toApiError(error.value)
  throw createError({
    statusCode: (error.value as { statusCode?: number }).statusCode ?? 502,
    statusMessage: apiError.message,
    data: { code: apiError.code },
  })
}

if (!data.value) {
  throw createError({ statusCode: 502, statusMessage: 'Vos choix n\'ont pas pu être chargés. Réessayez dans un instant.', data: { code: 'FETCH_ERROR' } })
}

const consentForm = reactive({ pending: false, tone: 'success' as 'success' | 'danger', message: '' })

/**
 * Une décision, un appel. Le corps ne porte que la finalité concernée : envoyer
 * les deux à chaque fois réaffirmerait un choix que la personne n'a pas repris,
 * et le journal enregistrerait des décisions qu'elle n'a pas prises.
 */
async function decide(body: { analytics?: boolean, wellbeing?: boolean }) {
  consentForm.pending = true
  consentForm.message = ''

  try {
    data.value = await $fetch('/api/consent', { method: 'PUT', body })
    consentForm.tone = 'success'
    consentForm.message = 'Votre choix est enregistré.'
  }
  catch (requestError) {
    consentForm.tone = 'danger'
    consentForm.message = toApiError(requestError).message
  }
  finally {
    consentForm.pending = false
  }
}

const wellbeingGranted = computed(() => data.value?.wellbeing === 'granted')
const analyticsGranted = computed(() => data.value?.analytics === true)

/** « Jamais demandé » et « retiré » ne se disent pas de la même façon. */
const wellbeingLabel = computed(() => {
  if (data.value?.wellbeing === 'granted') return 'Accordé'
  if (data.value?.wellbeing === 'withdrawn') return 'Retiré'

  return 'Pas encore décidé'
})

const analyticsLabel = computed(() => {
  if (data.value?.analytics === true) return 'Accepté'
  if (data.value?.analytics === false) return 'Refusé'

  return 'Pas encore décidé'
})

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: APP_TIME_ZONE,
})

function formatDecisionDate(iso: string | null | undefined) {
  return iso ? `Décidé le ${dateFormatter.format(new Date(iso))}` : 'Aucune décision enregistrée'
}

// ── Suppression du compte ────────────────────────────────────────────────────

const deleteForm = reactive({
  password: '',
  confirmed: false,
  pending: false,
  message: '',
  errors: {} as Record<string, string[]>,
})

async function deleteAccount() {
  deleteForm.pending = true
  deleteForm.message = ''
  deleteForm.errors = {}

  try {
    await $fetch('/api/me', { method: 'DELETE', body: { password: deleteForm.password } })
    // L'état de session du navigateur est vidé avant de naviguer : le cookie a
    // déjà été retiré par le serveur, mais l'application afficherait encore le
    // nom et le rôle de quelqu'un qui n'existe plus.
    await clear()
    await navigateTo('/connexion?compte=supprime')
  }
  catch (requestError) {
    const apiError = toApiError(requestError)
    deleteForm.errors = apiError.errors
    deleteForm.message = Object.keys(apiError.errors).length
      ? 'Vérifiez les champs signalés ci-dessous.'
      : apiError.message
  }
  finally {
    deleteForm.pending = false
  }
}
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="font-display text-[1.625rem]/[1.05] text-fg lg:text-[2rem]/[1.05]">
        Mes données
      </h1>
      <p class="mt-1.5 text-label/[1.4] font-medium text-mist-600 lg:text-sm/[1.4]">
        Vos choix, une copie de tout ce que nous conservons, et la sortie — sans
        avoir à écrire à qui que ce soit.
      </p>
    </header>

    <div class="flex flex-col gap-5">
      <!-- Consentements — CU-04 -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Mes consentements</h2>

        <AppAlert
          v-if="consentForm.message"
          :role="consentForm.tone === 'danger' ? 'alert' : 'status'"
          :tone="consentForm.tone"
          class="mt-4"
        >
          {{ consentForm.message }}
        </AppAlert>

        <ul class="mt-4 flex flex-col gap-3.5">
          <li class="flex flex-col gap-3 rounded-xl bg-surface-soft px-4.5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="text-label font-bold text-fg">
                Suivi de mon bien-être
              </p>
              <p class="mt-1 text-caption/[1.5] text-fg-muted">
                Vos pauses, vos exercices et vos déclarations d'humeur. Sans ce
                consentement, le formulaire de déclaration reste fermé — et rien
                d'autre ne change.
              </p>
              <p class="mt-1.5 text-caption font-semibold text-fg-faint">
                {{ wellbeingLabel }} · {{ formatDecisionDate(data?.wellbeingDecidedAt) }}
              </p>
            </div>
            <!-- Retirer coûte le même geste qu'accorder : un bouton, un clic
                 (exigence F10). -->
            <button
              type="button"
              :disabled="consentForm.pending"
              class="shrink-0 rounded-lg border border-border-strong bg-surface px-5 py-2.75 text-label/none font-bold text-fg transition-colors hover:bg-mist-200 disabled:cursor-not-allowed disabled:opacity-60"
              @click="decide({ wellbeing: !wellbeingGranted })"
            >
              {{ wellbeingGranted ? 'Retirer mon consentement' : 'Donner mon consentement' }}
            </button>
          </li>

          <li class="flex flex-col gap-3 rounded-xl bg-surface-soft px-4.5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="text-label font-bold text-fg">
                Mesure d'audience
              </p>
              <p class="mt-1 text-caption/[1.5] text-fg-muted">
                Comptage anonyme des pages consultées, pour savoir ce qui sert et
                ce qui ne sert pas. Rien n'est mesuré tant que vous n'avez pas
                accepté.
              </p>
              <p class="mt-1.5 text-caption font-semibold text-fg-faint">
                {{ analyticsLabel }} · {{ formatDecisionDate(data?.analyticsDecidedAt) }}
              </p>
            </div>
            <button
              type="button"
              :disabled="consentForm.pending"
              class="shrink-0 rounded-lg border border-border-strong bg-surface px-5 py-2.75 text-label/none font-bold text-fg transition-colors hover:bg-mist-200 disabled:cursor-not-allowed disabled:opacity-60"
              @click="decide({ analytics: !analyticsGranted })"
            >
              {{ analyticsGranted ? 'Refuser' : 'Accepter' }}
            </button>
          </li>
        </ul>

        <p class="mt-4 text-caption/[1.5] text-fg-faint">
          Un retrait vaut pour l'avenir : il ne remet pas en cause ce qui a été
          collecté tant que le consentement était en vigueur (article 7.3 du
          RGPD). Pour effacer le passé, utilisez la suppression de compte.
        </p>
      </section>

      <!-- Export — CU-05.1 -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Récupérer mes données</h2>

        <p class="mt-3 text-label/[1.5] text-fg-soft">
          Un fichier JSON contenant tout ce qui est rattaché à votre compte :
          identité, préférences, pauses, exercices réalisés, déclarations
          d'humeur, historique de vos consentements et, si vous encadrez une
          équipe, la liste de vos consultations.
        </p>

        <!-- Lien et non bouton : c'est une navigation vers une ressource, que le
             serveur sert en pièce jointe. Un `fetch` puis un objet blob
             reproduirait à la main ce que le navigateur sait déjà faire, et
             échouerait sans JavaScript. -->
        <!-- Point d'entrée d'API et non page : il n'a ni route de page ni entrée
             au plan de site, ce que la règle de vérification des liens ne peut
             pas deviner. -->
        <!-- eslint-disable link-checker/valid-route, link-checker/valid-sitemap-link -->
        <a
          href="/api/me/export"
          class="mt-4 inline-block rounded-lg bg-accent px-5.5 py-3.25 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
        >
          Télécharger mes données
        </a>
        <!-- eslint-enable link-checker/valid-route, link-checker/valid-sitemap-link -->
      </section>

      <!-- Suppression — CU-05.2 -->
      <section class="rounded-3xl bg-surface px-6 py-5.5 shadow-card">
        <h2 class="text-label font-bold text-fg-subtle">Supprimer mon compte</h2>

        <p class="mt-3 text-label/[1.5] text-fg-soft">
          Votre compte, vos préférences, vos pauses, vos exercices et vos
          déclarations d'humeur sont effacés immédiatement et définitivement.
        </p>

        <p class="mt-2 text-caption/[1.5] text-fg-muted">
          Deux traces subsistent, sans lien avec votre identité : la preuve
          qu'un consentement avait été recueilli, et celle que vos éventuelles
          consultations d'équipe avaient été journalisées. Elles ne désignent
          plus personne. Les moyennes d'équipe déjà affichées sont recalculées
          sans vos déclarations.
        </p>

        <form
          novalidate
          class="mt-4 flex flex-col gap-4"
          @submit.prevent="deleteAccount"
        >
          <AppAlert
            v-if="deleteForm.message"
            role="alert"
            tone="danger"
          >
            {{ deleteForm.message }}
          </AppAlert>

          <AppField
            id="password"
            v-model="deleteForm.password"
            label="Votre mot de passe"
            type="password"
            autocomplete="current-password"
            required
            hint="Il confirme que la demande vient bien de vous."
            :errors="deleteForm.errors.password"
            class="max-w-sm"
          />

          <label class="flex items-start gap-2.5 text-label/[1.45] font-semibold text-fg-soft">
            <input
              v-model="deleteForm.confirmed"
              type="checkbox"
              class="mt-0.5 size-4 shrink-0 rounded-xs border-border-strong accent-danger"
            >
            <span>Je comprends que cette suppression est définitive.</span>
          </label>

          <button
            type="submit"
            :disabled="deleteForm.pending || !deleteForm.confirmed"
            class="self-start rounded-lg bg-danger px-5.5 py-3.25 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-danger-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ deleteForm.pending ? 'Suppression…' : 'Supprimer définitivement mon compte' }}
          </button>
        </form>
      </section>

      <p class="text-caption/[1.5] text-fg-faint">
        Le détail de ce que nous collectons, pourquoi et pour combien de temps
        est dans la
        <NuxtLink
          to="/confidentialite"
          class="font-semibold text-accent-strong underline underline-offset-2"
        >
          politique de confidentialité
        </NuxtLink>.
      </p>
    </div>
  </div>
</template>
