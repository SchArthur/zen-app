<script setup lang="ts">
// CU-02.1 — Confirmer son adresse. La page consomme le jeton par un POST : un
// antivirus de messagerie qui prélit le lien ne l'active donc pas, alors qu'il
// suivrait volontiers une URL en GET.
useSeoMeta({ title: 'Confirmation de votre adresse' })

type Status = 'pending' | 'verified' | 'already_verified' | 'failed' | 'no_token'

const route = useRoute()
const token = computed(() => String(route.query.token ?? ''))

const status = ref<Status>('pending')
const message = ref('')
const canResend = ref(false)

const resendEmail = ref('')
const resending = ref(false)
const resendMessage = ref('')

onMounted(async () => {
  if (!token.value) {
    status.value = 'no_token'
    canResend.value = true
    return
  }

  try {
    const response = await $fetch('/api/auth/verify-email', {
      method: 'POST',
      body: { token: token.value },
    })
    status.value = response.status
    message.value = response.message
  }
  catch (error) {
    const apiError = toApiError(error)
    status.value = 'failed'
    message.value = apiError.message
    // Un lien expiré comme un lien invalide se réparent de la même façon :
    // en en demandant un nouveau (CU-02, alternative A2).
    canResend.value = true
  }
})

async function resend() {
  resending.value = true
  resendMessage.value = ''

  try {
    const response = await $fetch('/api/auth/resend-verification', {
      method: 'POST',
      body: { email: resendEmail.value },
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
    <h1>Confirmation de votre adresse</h1>

    <p
      v-if="status === 'pending'"
      role="status"
    >
      Vérification du lien en cours…
    </p>

    <div v-else-if="status === 'verified' || status === 'already_verified'">
      <p role="status">
        {{ message }}
      </p>
      <NuxtLink to="/connexion">
        Se connecter
      </NuxtLink>
    </div>

    <div v-else>
      <p role="alert">
        {{ status === 'no_token' ? 'Ce lien est incomplet : il ne contient aucun jeton de confirmation.' : message }}
      </p>
    </div>

    <section v-if="canResend">
      <h2>Recevoir un nouveau lien</h2>
      <p>Le lien précédent sera alors invalidé.</p>

      <form
        novalidate
        @submit.prevent="resend"
      >
        <p>
          <label for="resendEmail">Adresse email</label>
          <input
            id="resendEmail"
            v-model="resendEmail"
            type="email"
            autocomplete="email"
            required
          >
        </p>

        <button
          type="submit"
          :disabled="resending"
        >
          {{ resending ? 'Envoi en cours…' : 'Envoyer un nouveau lien' }}
        </button>
      </form>

      <p
        v-if="resendMessage"
        role="status"
      >
        {{ resendMessage }}
      </p>
    </section>
  </main>
</template>
