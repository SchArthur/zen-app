<script setup lang="ts">
// CU-03 — S'authentifier.
definePageMeta({ layout: 'auth' })

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

// CU-05.2 — retour de la suppression de compte. Le message est porté par
// l'adresse et non par un état conservé : la page est atteinte après un
// changement de session, qui remet tout état applicatif à zéro.
const accountDeleted = computed(() => route.query.compte === 'supprime')

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
  <div>
    <h1 class="font-display text-[1.75rem]/[1.1] text-fg">
      Content de vous revoir
    </h1>
    <p class="mt-1.5 text-label/[1.45] font-medium text-mist-600">
      Connectez-vous pour retrouver votre tableau de bord.
    </p>

    <AppAlert
      v-if="accountDeleted"
      role="status"
      tone="success"
      class="mt-5"
    >
      Votre compte et vos déclarations ont été supprimés. Merci d'avoir essayé ZenTime.
    </AppAlert>

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

      <AppField
        id="email"
        v-model="form.email"
        label="Adresse email"
        type="email"
        autocomplete="email"
        required
        :errors="errors.email"
      />

      <AppField
        id="password"
        v-model="form.password"
        label="Mot de passe"
        type="password"
        autocomplete="current-password"
        required
        :errors="errors.password"
      />

      <button
        type="submit"
        :disabled="pending"
        class="mt-1 w-full rounded-lg bg-accent px-4 py-3.5 text-sm/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ pending ? 'Connexion en cours…' : 'Se connecter' }}
      </button>
    </form>

    <section
      v-if="notVerified"
      class="mt-5 rounded-xl bg-surface-soft px-4.5 py-4"
    >
      <h2 class="text-label font-bold text-fg">
        Adresse non confirmée
      </h2>
      <p class="mt-1 text-caption/[1.5] text-fg-muted">
        Votre compte existe mais reste inactif tant que son adresse n'est pas confirmée.
      </p>

      <button
        type="button"
        :disabled="resending"
        class="mt-3 w-full rounded-lg bg-surface px-4 py-2.75 text-caption/none font-bold text-fg-soft shadow-soft transition-colors hover:text-accent-strong disabled:opacity-60"
        @click="resend"
      >
        {{ resending ? 'Envoi en cours…' : 'Recevoir un nouveau lien de confirmation' }}
      </button>

      <AppAlert
        v-if="resendMessage"
        role="status"
        tone="success"
        class="mt-3"
      >
        {{ resendMessage }}
      </AppAlert>
    </section>

    <p class="mt-6 text-center text-label text-fg-subtle">
      Pas encore de compte ?
      <NuxtLink
        to="/inscription"
        class="font-bold text-accent-strong underline-offset-2 hover:underline"
      >
        Créer un compte
      </NuxtLink>
    </p>
  </div>
</template>
