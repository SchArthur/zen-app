<script setup lang="ts">
// Page protégée provisoire : elle sert pour l'instant à prouver que la session
// tient et que le middleware de route fait son office. Le vrai tableau de bord,
// avec ses statistiques, est prévu en J7.
definePageMeta({ middleware: 'auth' })

useSeoMeta({ title: 'Tableau de bord' })

const { user, clear } = useUserSession()

const roleLabels: Record<string, string> = {
  COLLABORATOR: 'Collaborateur',
  MANAGER: 'Manager',
  HR: 'Responsable RH',
}

const pending = ref(false)

async function logout() {
  pending.value = true

  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
  }
  finally {
    // `clear` vide l'état côté navigateur. Il s'exécute même si l'appel réseau
    // a échoué : rester affiché comme connecté après avoir cliqué sur
    // « Se déconnecter » serait le pire des deux résultats possibles.
    await clear()
    await navigateTo('/connexion')
  }
}
</script>

<template>
  <main>
    <h1>Tableau de bord</h1>

    <p>Bonjour {{ user?.firstName }} {{ user?.lastName }}.</p>

    <dl>
      <dt>Adresse email</dt>
      <dd>{{ user?.email }}</dd>
      <dt>Rôle</dt>
      <dd>{{ user?.role ? roleLabels[user.role] : '' }}</dd>
    </dl>

    <button
      type="button"
      :disabled="pending"
      @click="logout"
    >
      {{ pending ? 'Déconnexion en cours…' : 'Se déconnecter' }}
    </button>
  </main>
</template>
