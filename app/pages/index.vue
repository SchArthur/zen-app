<script setup lang="ts">
// Page d'accueil provisoire : la vraie page publique est prévue en J10.
const { loggedIn, user } = useUserSession()

useSeoMeta({ title: 'Accueil' })
</script>

<template>
  <main>
    <h1>ZenTime</h1>
    <p>Le bien-être au travail, une pause à la fois.</p>

    <nav v-if="loggedIn">
      <p>Connecté en tant que {{ user?.firstName }} {{ user?.lastName }}.</p>
      <NuxtLink to="/tableau-de-bord">
        Mon tableau de bord
      </NuxtLink>
    </nav>

    <nav v-else>
      <ul>
        <li>
          <NuxtLink to="/connexion">
            Se connecter
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/inscription">
            Créer un compte
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </main>
</template>
