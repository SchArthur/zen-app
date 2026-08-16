<script setup lang="ts">
// CU-03 — S'authentifier.
useSeoMeta({ title: 'Connexion' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()

const form = reactive({ email: '', password: '' })

const pending = ref(false)
const message = ref('')
const errors = ref<Record<string, string[]>>({})
// Un compte existant mais non confirmé est le seul cas où proposer un renvoi de
// lien a du sens — et le serveur ne le signale qu'à qui a donné le bon mot de passe.
const notVerified = ref(false)

const resending = ref(false)
const resendMessage = ref('')

async function submit() {
  pending.value = true
  message.value = ''
  errors.value = {}
  notVerified.value = false

  try {
    await $fetch('/api/auth/login', { method: 'POST', body: form })
    // Recharge la session côté client avant de naviguer : sans cela, le
    // middleware de route de la page suivante croirait encore à un visiteur.
    await refreshSession()
    await navigateTo(typeof route.query.suite === 'string' ? route.query.suite : '/tableau-de-bord')
  }
  catch (error) {
    const apiError = toApiError(error)
    errors.value = apiError.errors
    message.value = Object.keys(apiError.errors).length
      ? 'Vérifiez les champs signalés ci-dessous.'
      : apiError.message
    notVerified.value = apiError.code === 'email_not_verified'
  }
  finally {
    pending.value = false
  }
}

async function resend() {
  resending.value = true
  resendMessage.value = ''

  try {
    const response = await $fetch('/api/auth/resend-verification', {
      method: 'POST',
      body: { email: form.email },
    })
    resendMessage.value = response.message
  }
  catch (error) {
    resendMessage.value = toApiError(error).message
  }
  finally {
    resending.value = false
  }
}
</script>

<template>
  <main>
    <h1>Connexion</h1>

    <form
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
        <label for="email">Adresse email</label>
        <input
          id="email"
          v-model="form.email"
          type="email"
          autocomplete="email"
          required
          :aria-invalid="Boolean(errors.email)"
          aria-describedby="email-error"
        >
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
          autocomplete="current-password"
          required
          :aria-invalid="Boolean(errors.password)"
          aria-describedby="password-error"
        >
        <span
          v-if="errors.password"
          id="password-error"
        >{{ errors.password.join(' ') }}</span>
      </p>

      <button
        type="submit"
        :disabled="pending"
      >
        {{ pending ? 'Connexion en cours…' : 'Se connecter' }}
      </button>
    </form>

    <section v-if="notVerified">
      <h2>Adresse non confirmée</h2>
      <p>Votre compte existe mais reste inactif tant que son adresse n'est pas confirmée.</p>

      <button
        type="button"
        :disabled="resending"
        @click="resend"
      >
        {{ resending ? 'Envoi en cours…' : 'Recevoir un nouveau lien de confirmation' }}
      </button>

      <p
        v-if="resendMessage"
        role="status"
      >
        {{ resendMessage }}
      </p>
    </section>

    <p>
      Pas encore de compte ?
      <NuxtLink to="/inscription">
        Créer un compte
      </NuxtLink>
    </p>
  </main>
</template>
