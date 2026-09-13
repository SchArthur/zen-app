<script setup lang="ts">
// CU-02 — Créer un compte. Premier temps du double opt-in : le formulaire ne
// connecte personne, il déclenche l'envoi d'un lien de confirmation.
definePageMeta({ layout: 'auth' })

useSeoMeta({ title: 'Créer un compte' })

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  acceptTerms: false,
})

const pending = ref(false)
const sent = ref(false)
const message = ref('')
const errors = ref<Record<string, string[]>>({})

async function submit() {
  pending.value = true
  message.value = ''
  errors.value = {}

  try {
    const response = await $fetch('/api/auth/register', { method: 'POST', body: form })
    sent.value = true
    message.value = response.message
  }
  catch (error) {
    const apiError = toApiError(error)
    errors.value = apiError.errors
    // Quand chaque champ porte déjà son motif de refus, répéter en tête le
    // libellé technique du serveur n'ajoute rien : on oriente vers les champs.
    message.value = Object.keys(apiError.errors).length
      ? 'Vérifiez les champs signalés ci-dessous.'
      : apiError.message
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div>
    <!-- Le formulaire disparaît une fois la demande acceptée : le seul geste
         utile est alors d'aller relever sa boîte de réception. -->
    <div v-if="sent">
      <h1 class="font-display text-[1.75rem]/[1.1] text-fg">
        Vérifiez votre boîte mail
      </h1>

      <AppAlert
        role="status"
        tone="success"
        class="mt-5"
      >
        {{ message }}
      </AppAlert>

      <p class="mt-6 text-center text-label text-fg-subtle">
        Vous n'avez rien reçu ?
        <NuxtLink
          to="/confirmer-email"
          class="font-bold text-accent-strong underline-offset-2 hover:underline"
        >
          Demander un nouveau lien
        </NuxtLink>
      </p>
    </div>

    <div v-else>
      <h1 class="font-display text-[1.75rem]/[1.1] text-fg">
        Créer un compte
      </h1>
      <p class="mt-1.5 text-label/[1.45] font-medium text-fg-muted">
        Quelques minutes par jour pour souffler, sans quitter votre poste.
      </p>

      <form
        novalidate
        class="mt-6 flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <AppAlert
          v-if="message"
          role="alert"
          tone="danger"
        >
          {{ message }}
        </AppAlert>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppField
            id="firstName"
            v-model="form.firstName"
            label="Prénom"
            type="text"
            autocomplete="given-name"
            required
            :errors="errors.firstName"
          />

          <AppField
            id="lastName"
            v-model="form.lastName"
            label="Nom"
            type="text"
            autocomplete="family-name"
            required
            :errors="errors.lastName"
          />
        </div>

        <AppField
          id="email"
          v-model="form.email"
          label="Adresse email professionnelle"
          type="email"
          autocomplete="email"
          required
          hint="Elle doit relever du domaine de votre entreprise."
          :errors="errors.email"
        />

        <!-- Le serveur renvoie un message par critère manquant (CU-02, E2) :
             AppField les liste, il ne les résume pas. -->
        <AppField
          id="password"
          v-model="form.password"
          label="Mot de passe"
          type="password"
          autocomplete="new-password"
          required
          hint="12 caractères minimum, dont une minuscule, une majuscule et un chiffre."
          :errors="errors.password"
        />

        <div>
          <div class="flex items-start gap-2.5">
            <input
              id="acceptTerms"
              v-model="form.acceptTerms"
              type="checkbox"
              class="mt-0.5 size-4.5 shrink-0 accent-accent"
              :aria-invalid="Boolean(errors.acceptTerms)"
              :aria-describedby="errors.acceptTerms ? 'acceptTerms-error' : undefined"
            >
            <label
              for="acceptTerms"
              class="text-caption/[1.5] text-fg-muted"
            >
              J'accepte les conditions d'utilisation et la politique de confidentialité.
            </label>
          </div>
          <p
            v-if="errors.acceptTerms"
            id="acceptTerms-error"
            class="mt-1.5 text-caption/[1.45] font-semibold text-danger-strong"
          >
            {{ errors.acceptTerms.join(' ') }}
          </p>
        </div>

        <button
          type="submit"
          :disabled="pending"
          class="mt-1 w-full rounded-lg bg-accent px-4 py-3.5 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ pending ? 'Envoi en cours…' : 'Créer mon compte' }}
        </button>
      </form>

      <p class="mt-6 text-center text-label text-fg-subtle">
        Vous avez déjà un compte ?
        <NuxtLink
          to="/connexion"
          class="font-bold text-accent-strong underline-offset-2 hover:underline"
        >
          Se connecter
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
