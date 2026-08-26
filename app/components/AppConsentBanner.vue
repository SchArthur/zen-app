<script setup lang="ts">
/**
 * CU-04 — Bandeau de consentement à la mesure d'audience.
 *
 * **Refus par défaut, et ce n'est pas qu'une formulation** : tant qu'aucune
 * décision n'est prise, rien n'est déposé et rien n'est mesuré. Le bandeau ne
 * demande donc pas l'autorisation d'annuler quelque chose de déjà fait — il
 * demande l'autorisation de commencer.
 *
 * Les deux boutons portent **exactement** les mêmes classes. La recommandation
 * de la CNIL demande que refuser soit aussi simple qu'accepter, et l'exigence
 * F10 le reprend mot pour mot ; un refus grisé, plus petit ou repoussé en
 * dessous respecterait la lettre du « un seul clic » en trahissant le reste.
 * Ce n'est pas un oubli de style : c'est la mesure elle-même.
 *
 * Le bandeau ne bloque pas la page. Une fenêtre modale forcerait la décision
 * pour atteindre le contenu, ce qui rendrait le consentement moins libre — et
 * poserait au passage un piège à clavier sur toutes les pages du produit.
 *
 * Il ne recouvre rien non plus, et c'est ce que `--bottom-bar` sert à garantir :
 * posé bas sur mobile, il recouvrait intégralement la barre d'onglets — 169 px
 * de bandeau sur 68 px de barre, mesuré. Naviguer aurait alors supposé d'avoir
 * décidé, ce qui est une autre manière de forcer la décision. La variable est
 * déclarée par la coquille `dashboard` sur le corps du document et vaut zéro
 * partout ailleurs : le bandeau n'a pas à savoir dans quel écran il s'affiche.
 */

const { loggedIn } = useUserSession()

// État partagé : la mesure d'audience lit le même objet, ce qui interdit qu'un
// script se charge alors que le bandeau demande encore (voir `useConsent`).
const { data, refresh } = await useConsent()

// La décision de compte n'est pas celle du visiteur : à la connexion comme à la
// déconnexion, l'état est relu. Sans cela, quelqu'un qui vient de se connecter
// verrait le choix fait avant sa connexion, sur un poste peut-être partagé.
watch(loggedIn, () => refresh())

const pending = ref(false)
const failed = ref(false)

// `null` = aucune décision valide : jamais prise, périmée, ou prise sur une
// version antérieure des textes. Les trois appellent la même chose — la question.
const visible = computed(() => data.value?.analytics === null)

async function decide(granted: boolean) {
  pending.value = true
  failed.value = false

  try {
    data.value = await $fetch('/api/consent', { method: 'PUT', body: { analytics: granted } })
  }
  catch {
    // Le refus d'enregistrement ne referme pas le bandeau : le laisser
    // disparaître laisserait croire que le choix est pris alors qu'il n'est
    // consigné nulle part.
    failed.value = true
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <section
    v-if="visible"
    aria-labelledby="consent-title"
    class="fixed inset-x-0 bottom-[var(--bottom-bar)] z-40 border-t border-border bg-surface px-5 py-4 shadow-pop lg:px-9"
  >
    <div class="mx-auto flex max-w-shell flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div>
        <h2
          id="consent-title"
          class="text-label font-bold text-fg"
        >
          Mesure d'audience
        </h2>
        <p class="mt-1 text-caption/[1.5] text-fg-muted">
          ZenTime souhaite mesurer la fréquentation de ses pages pour les améliorer.
          Rien n'est mesuré tant que vous n'avez pas accepté, et refuser ne change
          rien à ce que l'application vous propose.
          <NuxtLink
            to="/confidentialite"
            class="font-semibold text-accent-strong underline underline-offset-2"
          >
            Politique de confidentialité
          </NuxtLink>
        </p>

        <p
          v-if="failed"
          role="alert"
          class="mt-1.5 text-caption/[1.5] font-semibold text-danger-strong"
        >
          Votre choix n'a pas pu être enregistré. Réessayez dans un instant.
        </p>
      </div>

      <!-- Deux boutons, mêmes classes, même largeur. Voir l'en-tête du fichier. -->
      <div class="flex shrink-0 gap-2.5">
        <button
          type="button"
          :disabled="pending"
          class="min-w-[7.5rem] flex-1 rounded-lg border border-border-strong bg-surface-soft px-5 py-2.75 text-label/none font-bold text-fg transition-colors hover:bg-mist-200 disabled:cursor-not-allowed disabled:opacity-60 lg:flex-none"
          @click="decide(false)"
        >
          Refuser
        </button>
        <button
          type="button"
          :disabled="pending"
          class="min-w-[7.5rem] flex-1 rounded-lg border border-border-strong bg-surface-soft px-5 py-2.75 text-label/none font-bold text-fg transition-colors hover:bg-mist-200 disabled:cursor-not-allowed disabled:opacity-60 lg:flex-none"
          @click="decide(true)"
        >
          Accepter
        </button>
      </div>
    </div>
  </section>
</template>
