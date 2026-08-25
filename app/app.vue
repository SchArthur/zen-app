<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- Hors de la coquille : le bandeau s'adresse aussi bien au visiteur de la
         page de connexion qu'à la personne connectée (CU-04). -->
    <AppConsentBanner />
  </div>
</template>
