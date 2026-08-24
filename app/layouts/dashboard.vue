<script setup lang="ts">
import type { Role } from '../../lib/generated/prisma/enums.js'
import { roleLabels } from '../utils/roles'

/**
 * Coquille des espaces connectés : barre latérale sur desktop, barre d'onglets
 * en bas sur mobile.
 *
 * Le layout ne porte que le chrome de navigation. Les pages fournissent leur
 * propre en-tête, titre compris : dans la maquette, « Bonjour, Camille » fait
 * partie du contenu et change d'une page à l'autre.
 */
const { user, clear } = useUserSession()
const route = useRoute()

interface NavItem {
  label: string
  to: string
  /** Libellé raccourci pour la barre d'onglets mobile, plus étroite. */
  short?: string
  /** Écarté de la barre d'onglets mobile, qui n'affiche que quatre entrées. */
  desktopOnly?: boolean
}

/**
 * Les trois jeux de navigation des maquettes. La coquille est identique d'un
 * rôle à l'autre : un seul layout, trois menus, plutôt que trois fichiers
 * quasi identiques à maintenir en parallèle.
 */
/**
 * Écrans communs aux trois rôles.
 *
 * La maquette nommait deux de ces entrées « Activité » et « Sérénité », et les
 * faisait pointer vers deux écrans distincts. Le catalogue de F4 est unique et
 * filtrable : deux écrans auraient affiché la même liste pré-filtrée, sous deux
 * noms que ni les cas d'utilisation ni le cahier des charges n'emploient. Le
 * vocabulaire de la maquette survit là où il a du sens — en raccourcis vers le
 * catalogue déjà filtré (« Respirer », « Bouger », « Méditer »).
 */
const commonNavigation: NavItem[] = [
  { label: 'Accueil', to: '/tableau-de-bord' },
  { label: 'Pauses', to: '/pauses' },
  { label: 'Exercices', to: '/exercices', desktopOnly: true },
  { label: 'Humeur', to: '/humeur' },
  { label: 'Statistiques', to: '/statistiques', short: 'Stats', desktopOnly: true },
]

/**
 * La navigation d'encadrement **s'ajoute** à la navigation commune, elle ne la
 * remplace pas.
 *
 * La maquette prévoyait quatre écrans par rôle d'encadrement, et *à la place*
 * des écrans du collaborateur. C'était deux erreurs en une : la matrice des
 * accès accorde CU-06 à CU-11 aux trois rôles et précise que « les colonnes
 * Manager et RH reprennent les droits du Collaborateur », si bien qu'un manager
 * ne pouvait atteindre ni ses pauses, ni son humeur, ni ses exercices — alors
 * qu'il y a droit, et que c'est aussi le propos du produit : un manager est un
 * collaborateur comme les autres.
 *
 * Les entrées « Tendances », « Signaux », « Départements », « Impact » et
 * « Conformité » de la maquette sont notées en évolutions futures : leurs
 * contenus n'ont pas de cas d'utilisation, et pointaient vers des écrans
 * inexistants.
 */
const navigationByRole: Record<Role, NavItem[]> = {
  COLLABORATOR: commonNavigation,
  MANAGER: [...commonNavigation, { label: 'Mon équipe', to: '/equipe', short: 'Équipe' }],
  HR: [...commonNavigation, { label: 'Entreprise', to: '/entreprise', short: 'Global' }],
}

/** Dégradés d'avatar de la maquette, une teinte par rôle. */
const avatarByRole: Record<Role, string> = {
  COLLABORATOR: 'from-avatar-mint to-avatar-sky',
  MANAGER: 'from-avatar-periwinkle to-avatar-lilac',
  HR: 'from-avatar-mauve to-avatar-periwinkle',
}

// Le layout n'est monté que derrière le middleware `auth`, mais `user` reste
// nullable le temps que la session soit hydratée : le repli évite un écran nu.
const currentRole = computed<Role>(() => user.value?.role ?? 'COLLABORATOR')

const navigation = computed(() => navigationByRole[currentRole.value])
const mobileNavigation = computed(() => navigation.value.filter(item => !item.desktopOnly))
const avatarGradient = computed(() => avatarByRole[currentRole.value])
const roleLabel = computed(() => roleLabels[currentRole.value])

// Une sous-page (/pauses/historique) doit garder son onglet parent allumé.
function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}

/**
 * Le raccourci « prendre une pause » disparaît sur l'écran du minuteur, et là
 * seulement.
 *
 * C'est le seul écran qui porte déjà le contrôle, en grand et avec l'état réel
 * de la pause. Deux boutons pour la même action, dont un qui ignore qu'une
 * pause est en cours, se contrediraient à l'usage. `/pauses/historique`, lui,
 * garde le raccourci : il n'a pas de minuteur.
 */
const showBreakShortcut = computed(() => route.path !== '/pauses')

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
  <div class="flex min-h-screen">
    <a
      href="#contenu"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-label focus:font-bold focus:shadow-pop"
    >
      Aller au contenu
    </a>

    <!-- Barre latérale — desktop -->
    <aside
      class="sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col border-r border-border bg-surface px-5 py-7.5 lg:flex"
    >
      <AppLogo class="mb-9 px-2" />

      <nav aria-label="Navigation principale">
        <ul class="flex flex-col gap-1.25">
          <li
            v-for="item in navigation"
            :key="item.to"
          >
            <NuxtLink
              :to="item.to"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              class="flex items-center gap-3 rounded-lg px-3.5 py-2.75 text-label transition-colors"
              :class="isActive(item.to)
                ? 'bg-accent-soft font-bold text-accent-strong'
                : 'font-semibold text-fg-subtle hover:bg-surface-soft'"
            >
              <span
                class="size-1.75 rounded-full bg-current"
                :class="{ 'opacity-40': !isActive(item.to) }"
              />
              {{ item.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <div class="mt-auto">
        <!-- CU-07, point 1 : démarrer une pause depuis n'importe quel écran, en
             une interaction. Posé dans la coquille et non dans les pages, c'est
             le seul endroit d'où « n'importe quel écran » est vrai. -->
        <AppBreakAction
          v-if="showBreakShortcut"
          class="mb-4 w-full rounded-lg bg-accent px-4 py-3 text-label/none font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        />

        <!-- Le bloc d'identité mène au profil (CU-06). Il n'a pas sa place dans
             la liste des onglets : on n'y va pas travailler, on y va se régler. -->
        <NuxtLink
          to="/profil"
          :aria-current="isActive('/profil') ? 'page' : undefined"
          class="flex items-center gap-2.75 rounded-xl p-3.5 transition-colors"
          :class="isActive('/profil') ? 'bg-accent-soft' : 'bg-surface-soft hover:bg-mist-200'"
        >
          <span
            aria-hidden="true"
            class="size-9.5 shrink-0 rounded-full bg-linear-135"
            :class="avatarGradient"
          />
          <span class="min-w-0">
            <span class="block truncate text-label font-bold text-fg">
              {{ user?.firstName }} {{ user?.lastName }}
            </span>
            <span class="block text-caption font-medium text-fg-faint">{{ roleLabel }}</span>
          </span>
        </NuxtLink>

        <!-- Absent de la maquette, mais il faut bien pouvoir sortir. Discret
             jusqu'au survol : ce n'est pas l'action que l'on vient chercher. -->
        <button
          type="button"
          :disabled="pending"
          class="mt-2 w-full rounded-lg px-3.5 py-2 text-caption font-semibold text-fg-faint transition-colors hover:bg-surface-soft hover:text-fg-muted disabled:opacity-60"
          @click="logout"
        >
          {{ pending ? 'Déconnexion…' : 'Se déconnecter' }}
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Barre du haut — mobile -->
      <header class="flex items-center justify-between px-5 py-3.5 lg:hidden">
        <AppLogo />
        <div class="flex items-center gap-2">
          <!-- Même raccourci qu'en barre latérale : sans lui, « n'importe quel
               écran » ne serait vrai que sur grand écran. Libellé raccourci,
               c'est la seule place disponible en 375 px. -->
          <AppBreakAction
            v-if="showBreakShortcut"
            label="Pause"
            class="rounded-lg bg-accent px-3 py-1.5 text-caption font-bold text-fg-onaccent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            :disabled="pending"
            class="rounded-lg px-2 py-1.5 text-caption font-semibold text-fg-faint transition-colors hover:bg-surface hover:text-fg-muted disabled:opacity-60"
            @click="logout"
          >
            {{ pending ? 'Déconnexion…' : 'Se déconnecter' }}
          </button>
          <NuxtLink
            to="/profil"
            aria-label="Mon profil"
            :aria-current="isActive('/profil') ? 'page' : undefined"
            class="block size-10.5 shrink-0 rounded-full bg-linear-135"
            :class="avatarGradient"
          />
        </div>
      </header>

      <main
        id="contenu"
        class="mx-auto w-full max-w-shell flex-1 px-5 py-5 lg:px-9 lg:py-8"
      >
        <slot />
      </main>

      <!-- Barre d'onglets — mobile. En `sticky` et non `fixed` : elle réserve
           sa place dans le flux, le bas du contenu n'est jamais masqué. -->
      <nav
        aria-label="Navigation principale"
        class="sticky bottom-0 flex justify-around border-t border-border bg-surface px-3 pt-3.5 pb-[max(1.375rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <NuxtLink
          v-for="item in mobileNavigation"
          :key="item.to"
          :to="item.to"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          class="flex flex-col items-center gap-1.5 rounded-lg px-3 py-1 transition-colors"
          :class="isActive(item.to) ? 'font-bold text-accent-strong' : 'font-semibold text-mist-400'"
        >
          <span class="size-1.75 rounded-full bg-current" />
          <span class="text-2xs">{{ item.short ?? item.label }}</span>
        </NuxtLink>
      </nav>
    </div>
  </div>
</template>
