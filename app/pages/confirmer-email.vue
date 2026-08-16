<script setup lang="ts">
// CU-02.1 — Confirmer son adresse. La page consomme le jeton par un POST : un
// antivirus de messagerie qui prélit le lien ne l'active donc pas, alors qu'il
// suivrait volontiers une URL en GET.
definePageMeta({ layout: 'auth' })

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
  <div>
    <h1 class="font-display text-[1.75rem]/[1.1] text-fg">
      Confirmation de votre adresse
    </h1>

    <AppAlert
      v-if="status === 'pending'"
      role="status"
      tone="info"
      class="mt-5"
    >
      Vérification du lien en cours…
    </AppAlert>

    <div v-else-if="status === 'verified' || status === 'already_verified'">
      <AppAlert
        role="status"
        tone="success"
        class="mt-5"
      >
        {{ message }}
      </AppAlert>

      <NuxtLink
        to="/connexion"
        class="mt-5 block w-full rounded-lg bg-accent px-4 py-3.5 text-center text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong"
      >
        Se connecter
      </NuxtLink>
    </div>

    <AppAlert
      v-else
      role="alert"
      tone="danger"
      class="mt-5"
    >
      {{ status === 'no_token' ? 'Ce lien est incomplet : il ne contient aucun jeton de confirmation.' : message }}
    </AppAlert>

    <section
      v-if="canResend"
      class="mt-6 border-t border-border pt-5"
    >
      <h2 class="text-label font-bold text-fg">
        Recevoir un nouveau lien
      </h2>
      <p class="mt-1 text-caption/[1.5] text-fg-muted">
        Le lien précédent sera alors invalidé.
      </p>

      <form
        novalidate
        class="mt-4 flex flex-col gap-4"
        @submit.prevent="resend"
      >
        <AppField
          id="resendEmail"
          v-model="resendEmail"
          label="Adresse email"
          type="email"
          autocomplete="email"
          required
        />

        <button
          type="submit"
          :disabled="resending"
          class="w-full rounded-lg bg-accent px-4 py-3.5 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ resending ? 'Envoi en cours…' : 'Envoyer un nouveau lien' }}
        </button>
      </form>

      <AppAlert
        v-if="resendMessage"
        role="status"
        tone="success"
        class="mt-4"
      >
        {{ resendMessage }}
      </AppAlert>
    </section>
  </div>
</template>
