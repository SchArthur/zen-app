<script setup lang="ts">
// CU-02 — Créer un compte. Premier temps du double opt-in : le formulaire ne
// connecte personne, il déclenche l'envoi d'un lien de confirmation.
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
  <main>
    <h1>Créer un compte</h1>

    <!-- Le formulaire disparaît une fois la demande acceptée : le seul geste
         utile est alors d'aller relever sa boîte de réception. -->
    <div v-if="sent">
      <p role="status">
        {{ message }}
      </p>
      <p>
        Vous n'avez rien reçu ?
        <NuxtLink to="/confirmer-email">
          Demander un nouveau lien
        </NuxtLink>
      </p>
    </div>

    <form
      v-else
      novalidate
      @submit.prevent="submit"
    >
      <p
        v-if="message"
        role="alert"
      >
        {{ message }}
      </p>

      <p>
        <label for="firstName">Prénom</label>
        <input
          id="firstName"
          v-model="form.firstName"
          type="text"
          autocomplete="given-name"
          required
          :aria-invalid="Boolean(errors.firstName)"
          :aria-describedby="errors.firstName ? 'firstName-error' : undefined"
        >
        <span
          v-if="errors.firstName"
          id="firstName-error"
        >{{ errors.firstName.join(' ') }}</span>
      </p>

      <p>
        <label for="lastName">Nom</label>
        <input
          id="lastName"
          v-model="form.lastName"
          type="text"
          autocomplete="family-name"
          required
          :aria-invalid="Boolean(errors.lastName)"
          aria-describedby="lastName-error"
        >
        <span
          v-if="errors.lastName"
          id="lastName-error"
        >{{ errors.lastName.join(' ') }}</span>
      </p>

      <p>
        <label for="email">Adresse email professionnelle</label>
        <input
          id="email"
          v-model="form.email"
          type="email"
          autocomplete="email"
          required
          :aria-invalid="Boolean(errors.email)"
          aria-describedby="email-hint email-error"
        >
        <span id="email-hint">Elle doit relever du domaine de votre entreprise.</span>
        <span
          v-if="errors.email"
          id="email-error"
        >{{ errors.email.join(' ') }}</span>
      </p>

      <p>
        <label for="password">Mot de passe</label>
        <input
          id="password"
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          required
          :aria-invalid="Boolean(errors.password)"
          aria-describedby="password-hint password-error"
        >
        <span id="password-hint">
          12 caractères minimum, dont une minuscule, une majuscule et un chiffre.
        </span>
        <!-- Le serveur renvoie un message par critère manquant (CU-02, E2) :
             ils sont listés, pas résumés en « mot de passe invalide ». -->
        <span
          v-if="errors.password"
          id="password-error"
        >
          <ul>
            <li
              v-for="reason in errors.password"
              :key="reason"
            >{{ reason }}</li>
          </ul>
        </span>
      </p>

      <p>
        <input
          id="acceptTerms"
          v-model="form.acceptTerms"
          type="checkbox"
          :aria-invalid="Boolean(errors.acceptTerms)"
          aria-describedby="acceptTerms-error"
        >
        <label for="acceptTerms">
          J'accepte les conditions d'utilisation et la politique de confidentialité.
        </label>
        <span
          v-if="errors.acceptTerms"
          id="acceptTerms-error"
        >{{ errors.acceptTerms.join(' ') }}</span>
      </p>

      <button
        type="submit"
        :disabled="pending"
      >
        {{ pending ? 'Envoi en cours…' : 'Créer mon compte' }}
      </button>
    </form>

    <p>
      Vous avez déjà un compte ?
      <NuxtLink to="/connexion">
        Se connecter
      </NuxtLink>
    </p>
  </main>
</template>
