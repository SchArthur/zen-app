<script setup lang="ts">
/**
 * Politique de confidentialité — articles 12 à 14 du RGPD, tâche 7.7.
 *
 * Accessible **sans compte** : l'engagement de transparence de F12 veut que les
 * garanties soient annoncées avant l'inscription, pas découvertes après. La page
 * n'a donc ni coquille d'application ni middleware d'authentification.
 *
 * Le contenu est écrit sur `docs/normes-et-conformite.md` §3.2 et §3.5 — mêmes
 * finalités, mêmes bases légales, mêmes durées. Deux textes qui divergeraient
 * feraient perdre au dossier ce qu'il a de mieux : la correspondance vérifiable
 * entre ce qu'il annonce et ce que le produit fait.
 *
 * `CONSENT_POLICY_VERSION` est la version que le journal des consentements
 * recopie dans chaque décision. Modifier cette page sans l'incrémenter ferait
 * dire au journal que les personnes ont accepté un texte qu'elles n'ont pas lu.
 */
definePageMeta({ layout: false })

useSeoMeta({
  title: 'Politique de confidentialité',
  description: 'Ce que ZenTime collecte, pourquoi, pour combien de temps, et comment exercer vos droits.',
})

const version = 'v1'
const updatedAt = '25 août 2026'

interface Purpose {
  purpose: string
  data: string
  basis: string
  retention: string
}

/**
 * Le tableau des traitements. Une ligne par **finalité**, jamais par écran : un
 * traitement se décrit par ce qu'il poursuit, et c'est ce découpage qui rend la
 * base légale et la durée vérifiables une par une.
 */
const purposes: Purpose[] = [
  {
    purpose: 'Créer et gérer votre compte, vous authentifier',
    data: 'Nom, prénom, adresse professionnelle, mot de passe (sous forme de condensat), date de confirmation',
    basis: 'Exécution du contrat de service',
    retention: 'Durée du compte, puis 12 mois d\'inactivité',
  },
  {
    purpose: 'Vous rattacher à votre entreprise et à votre équipe',
    data: 'Domaine de votre adresse, équipe d\'affectation',
    basis: 'Intérêt légitime de l\'employeur (organisation du travail)',
    retention: 'Durée du compte',
  },
  {
    purpose: 'Régler vos rappels et vos préférences',
    data: 'Horaires déclarés, fréquence des rappels, familles d\'exercices préférées',
    basis: 'Exécution du contrat de service',
    retention: 'Durée du compte',
  },
  {
    purpose: 'Suivre vos pauses et les exercices que vous réalisez',
    data: 'Début, fin et durée de chaque pause ; exercice réalisé et horodatage',
    basis: 'Votre consentement',
    retention: '12 mois glissants',
  },
  {
    purpose: 'Enregistrer vos déclarations d\'humeur et de stress',
    data: 'Deux niveaux de 1 à 5, une déclaration par jour au plus',
    basis: 'Votre consentement explicite (article 9.2.a)',
    retention: '12 mois glissants',
  },
  {
    purpose: 'Restituer un climat d\'équipe et d\'entreprise',
    data: 'Aucune donnée conservée — les agrégats sont calculés à la demande',
    basis: 'Intérêt légitime de l\'employeur, sous condition d\'anonymat effectif',
    retention: 'Sans objet',
  },
  {
    purpose: 'Prouver que votre consentement a été recueilli',
    data: 'Finalité, décision, version des textes, date',
    basis: 'Obligation légale (article 7.1)',
    retention: 'Durée du compte, puis conservation dissociée de votre identité',
  },
  {
    purpose: 'Tracer les consultations de données de bien-être',
    data: 'Auteur de la consultation, périmètre consulté, rôle, date',
    basis: 'Obligation légale et sécurité du traitement (article 32)',
    retention: '6 mois',
  },
  {
    purpose: 'Mesurer l\'audience des pages',
    data: 'Aucune donnée conservée en base',
    basis: 'Votre consentement',
    retention: 'Sans objet',
  },
]

interface Right {
  right: string
  article: string
  how: string
}

const rights: Right[] = [
  { right: 'Accès', article: 'Article 15', how: 'Téléchargez la copie complète depuis « Mes données »' },
  { right: 'Rectification', article: 'Article 16', how: 'Corrigez votre profil ; votre déclaration du jour reste modifiable jusqu\'à minuit' },
  { right: 'Effacement', article: 'Article 17', how: 'Supprimez votre compte depuis « Mes données », sans intervention de notre part' },
  { right: 'Limitation', article: 'Article 18', how: 'Retirez votre consentement : la collecte s\'arrête, le compte demeure' },
  { right: 'Portabilité', article: 'Article 20', how: 'Le même téléchargement, au format JSON ouvert' },
  { right: 'Opposition', article: 'Article 21', how: 'L\'usage est volontaire ; les rappels se désactivent dans vos préférences' },
]
</script>

<template>
  <main class="min-h-screen bg-canvas px-5 py-10 lg:px-9 lg:py-14">
    <article class="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <AppLogo class="mb-7" />
        <h1 class="font-display text-[1.875rem]/[1.1] text-fg lg:text-[2.375rem]/[1.05]">
          Politique de confidentialité
        </h1>
        <p class="mt-2 text-sm/[1.5] font-medium text-fg-muted">
          Version {{ version }} — mise à jour le {{ updatedAt }}.
        </p>
        <p class="mt-4 text-base/[1.6] text-fg-soft">
          ZenTime traite des déclarations de ressenti au travail. C'est ce qu'un
          produit peut collecter de plus sensible, et c'est pourquoi cette page
          dit exactement ce qui est collecté, sur quel fondement, pour combien de
          temps, et qui peut le voir.
        </p>
      </header>

      <section>
        <h2 class="font-display text-xl/[1.2] text-fg">
          Qui est responsable de vos données
        </h2>
        <p class="mt-3 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          <strong class="font-bold text-fg">Votre employeur</strong> est
          responsable du traitement : c'est lui qui décide de déployer ZenTime et
          qui en détermine la finalité. Il porte l'obligation de vous informer, la
          tenue du registre des traitements et l'analyse d'impact, et il doit
          avoir consulté vos représentants du personnel avant le déploiement.
        </p>
        <p class="mt-2 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          <strong class="font-bold text-fg">ZenTime</strong> est sous-traitant au
          sens de l'article 28 : nous traitons pour le compte de votre employeur
          et sur ses instructions. L'hébergement, la base de données, l'envoi des
          courriels et le paiement sont confiés à des sous-traitants ultérieurs,
          tous situés dans l'Union européenne.
        </p>
      </section>

      <section>
        <h2 class="font-display text-xl/[1.2] text-fg">
          Ce que nous collectons, et pourquoi
        </h2>
        <p class="mt-3 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          Une ligne par finalité. Une donnée qui ne sert aucune de ces finalités
          n'est pas collectée — c'est la raison pour laquelle il n'existe aucun
          champ de commentaire libre sur la déclaration d'humeur.
        </p>

        <!-- Le tableau déborde sur petit écran : il défile dans sa propre boîte,
             sinon c'est la page entière qui défilerait de côté (NF4). -->
        <div class="mt-4 overflow-x-auto rounded-2xl bg-surface shadow-soft">
          <table class="w-full min-w-160 border-collapse text-left">
            <thead>
              <tr class="border-b border-border">
                <th
                  scope="col"
                  class="px-4 py-3 text-caption font-bold text-fg-subtle"
                >
                  Finalité
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 text-caption font-bold text-fg-subtle"
                >
                  Données
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 text-caption font-bold text-fg-subtle"
                >
                  Base légale
                </th>
                <th
                  scope="col"
                  class="px-4 py-3 text-caption font-bold text-fg-subtle"
                >
                  Conservation
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in purposes"
                :key="row.purpose"
                class="border-b border-border last:border-0"
              >
                <th
                  scope="row"
                  class="px-4 py-3 align-top text-caption/[1.5] font-bold text-fg"
                >
                  {{ row.purpose }}
                </th>
                <td class="px-4 py-3 align-top text-caption/[1.5] text-fg-muted">
                  {{ row.data }}
                </td>
                <td class="px-4 py-3 align-top text-caption/[1.5] text-fg-muted">
                  {{ row.basis }}
                </td>
                <td class="px-4 py-3 align-top text-caption/[1.5] text-fg-muted">
                  {{ row.retention }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="font-display text-xl/[1.2] text-fg">
          La confirmation de votre adresse
        </h2>
        <p class="mt-3 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          Créer un compte ne suffit pas à l'activer. Nous vous envoyons un lien de
          confirmation, valable 24 heures et utilisable une seule fois ; tant
          qu'il n'a pas été suivi, aucune connexion n'est possible. Ce double
          consentement — la demande, puis la confirmation depuis la boîte aux
          lettres — garantit que personne ne peut inscrire quelqu'un d'autre.
        </p>
        <p class="mt-2 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          Le lien n'est pas conservé en clair : seule son empreinte est stockée,
          de sorte qu'une fuite de notre base ne permettrait d'activer aucun
          compte. Si une inscription est tentée sur une adresse déjà active, c'est
          son titulaire qui en est informé, jamais l'auteur de la tentative.
        </p>
      </section>

      <section>
        <h2 class="font-display text-xl/[1.2] text-fg">
          Qui peut voir vos déclarations
        </h2>
        <p class="mt-3 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          <strong class="font-bold text-fg">Personne, individuellement.</strong>
          Ni votre manager, ni les ressources humaines, ni votre employeur n'ont
          accès à vos déclarations nominatives. Il n'existe aucun écran, aucun
          export et aucun point d'entrée qui les rende accessibles à quelqu'un
          d'autre que vous.
        </p>
        <ul class="mt-3 flex list-disc flex-col gap-2 pl-5 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          <li>
            Les vues d'encadrement n'affichent que des moyennes, et seulement
            <strong class="font-bold text-fg">à partir de cinq déclarants</strong>
            sur la période. En dessous, l'application ne renvoie rien — ni
            moyenne, ni total, ni nombre de participants.
          </li>
          <li>
            Le seuil s'applique aussi <em>jour par jour</em> : dans une équipe de
            six, une seule déclaration un mardi ferait de la « moyenne du mardi »
            le ressenti d'une personne identifiable.
          </li>
          <li>
            Chaque consultation d'un climat d'équipe est journalisée, réussie
            comme refusée. Vous retrouvez vos propres consultations dans votre
            export.
          </li>
          <li>
            Aucun score individuel, aucun classement, aucune alimentation d'une
            évaluation professionnelle. Refuser de déclarer n'a
            <strong class="font-bold text-fg">aucune conséquence</strong>.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="font-display text-xl/[1.2] text-fg">
          Vos droits, et comment les exercer
        </h2>
        <p class="mt-3 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          Tous s'exercent depuis la page
          <NuxtLink
            to="/mes-donnees"
            class="font-semibold text-accent-strong underline underline-offset-2"
          >
            « Mes données »
          </NuxtLink>, sans demande à formuler ni délai d'attente.
        </p>

        <dl class="mt-4 flex flex-col gap-3">
          <div
            v-for="row in rights"
            :key="row.right"
            class="rounded-xl bg-surface px-4.5 py-3.5 shadow-soft"
          >
            <dt class="text-label font-bold text-fg">
              {{ row.right }}
              <span class="font-semibold text-fg-faint">· {{ row.article }}</span>
            </dt>
            <dd class="mt-1 text-caption/[1.5] text-fg-muted">
              {{ row.how }}
            </dd>
          </div>
        </dl>

        <p class="mt-4 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          Retirer un consentement vaut pour l'avenir : la collecte s'arrête, mais
          ce qui a été recueilli tant qu'il était en vigueur reste licite
          (article 7.3). Pour effacer le passé, supprimez votre compte — vos
          déclarations disparaissent avec lui, et les moyennes d'équipe déjà
          affichées sont recalculées sans elles.
        </p>
        <p class="mt-2 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          Deux traces subsistent alors, détachées de votre identité : la preuve
          qu'un consentement avait été recueilli, exigée par l'article 7.1, et
          celle que les consultations d'équipe avaient été journalisées. Ni l'une
          ni l'autre ne désigne plus quiconque.
        </p>
      </section>

      <section>
        <h2 class="font-display text-xl/[1.2] text-fg">
          Cookies et mesure d'audience
        </h2>
        <ul class="mt-3 flex list-disc flex-col gap-2 pl-5 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          <li>
            <strong class="font-bold text-fg">Cookie de session</strong> — il vous
            maintient connecté pendant huit heures. Strictement nécessaire au
            service que vous demandez, il ne requiert pas votre accord et ne sert
            à rien d'autre. Il est posé dès la première page et reste vide tant
            que vous n'êtes pas connecté : il ne contient alors aucune donnée
            vous concernant.
          </li>
          <li>
            <strong class="font-bold text-fg">Cookie de consentement</strong> — il
            retient votre choix, et rien de plus : un identifiant tiré au hasard,
            qui ne vous désigne dans aucun autre système. Il n'est déposé qu'au
            moment où vous décidez, jamais à l'affichage du bandeau.
          </li>
          <li>
            <strong class="font-bold text-fg">Mesure d'audience</strong> — elle ne
            se déclenche qu'après votre acceptation. Refuser est aussi simple
            qu'accepter, et votre choix est resollicité au bout de six mois.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="font-display text-xl/[1.2] text-fg">
          Ce que ZenTime n'est pas
        </h2>
        <p class="mt-3 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          ZenTime <strong class="font-bold text-fg">n'est pas un dispositif
            médical</strong> : il n'établit aucun diagnostic, ne suit aucune
          pathologie et ne remplace aucun professionnel de santé. Il
          <strong class="font-bold text-fg">n'est pas un outil de
            surveillance</strong> : il incite à faire des pauses, il ne mesure pas
          la présence. Il ne constitue pas non plus le document unique
          d'évaluation des risques de votre employeur, et ne le dispense pas de
          traiter les causes organisationnelles de la charge de travail.
        </p>
        <p class="mt-2 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          Les suggestions d'exercices proviennent d'un jeu de règles fixes, dont
          le motif vous est toujours affiché. Aucun apprentissage automatique,
          aucune décision automatisée vous concernant au sens de l'article 22.
        </p>
      </section>

      <section>
        <h2 class="font-display text-xl/[1.2] text-fg">
          Nous écrire, ou réclamer
        </h2>
        <p class="mt-3 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          Pour toute question sur cette politique :
          <a
            href="mailto:confidentialite@zentime.fr"
            class="font-semibold text-accent-strong underline underline-offset-2"
          >confidentialite@zentime.fr</a>. Le délégué à la protection des données
          compétent est celui de votre employeur, responsable du traitement.
        </p>
        <p class="mt-2 text-label/[1.6] text-fg-soft lg:text-sm/[1.6]">
          Vous pouvez à tout moment introduire une réclamation auprès de la
          Commission nationale de l'informatique et des libertés (CNIL), 3 place
          de Fontenoy, 75007 Paris.
        </p>
      </section>

      <footer class="border-t border-border pt-6">
        <NuxtLink
          to="/connexion"
          class="text-label font-bold text-accent-strong underline underline-offset-2"
        >
          Retour à la connexion
        </NuxtLink>
      </footer>
    </article>
  </main>
</template>
