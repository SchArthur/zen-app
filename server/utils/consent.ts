import { createError } from 'h3'
import { ConsentType } from '../../lib/generated/prisma/enums.js'

/**
 * Consentement au traitement des données de bien-être.
 *
 * C'est la précondition de CU-09 (« consentement au traitement des données de
 * bien-être recueilli ») et la condition de son exception E1 (« consentement
 * retiré : le formulaire n'est plus proposé »).
 *
 * La table `Consent` conserve **l'historique** des décisions : accorder puis
 * retirer produit deux lignes, et non une ligne modifiée. C'est ce qui permet de
 * prouver qu'un consentement était en vigueur à une date donnée — sans quoi la
 * charge de la preuve de l'article 7.1 du RGPD serait intenable. La décision qui
 * fait foi est donc la plus récente, jamais la première trouvée.
 */

/** Dernière décision connue, ou `null` si la question n'a jamais été posée. */
export async function readWellbeingConsent(userId: string) {
  return await prisma.consent.findFirst({
    where: { userId, type: ConsentType.WELLBEING_DATA },
    orderBy: { createdAt: 'desc' },
    select: { granted: true, createdAt: true, version: true },
  })
}

/**
 * Refuse l'écriture d'une donnée de bien-être si le consentement a été retiré.
 *
 * L'absence de décision est tolérée, et c'est un écart assumé et **temporaire** :
 * l'inscription n'enregistre aujourd'hui que le consentement aux CGU, le recueil
 * du consentement bien-être appartient au bandeau de consentement de CU-04. Tant
 * qu'il n'existe pas, exiger une décision fermerait le formulaire à tous les
 * comptes créés par le parcours réel — y compris ceux qui n'ont jamais eu
 * l'occasion de dire oui.
 *
 * TODO (J9) : une fois CU-04 livré, l'absence de décision doit valoir refus.
 * Retirer la tolérance ci-dessous et recueillir le consentement à l'inscription
 * ou au premier accès. Le retrait, lui, est **déjà** opposable : c'est la moitié
 * de la règle qui protège l'utilisateur, et elle n'a pas de raison d'attendre.
 */
export async function assertWellbeingConsent(userId: string) {
  const consent = await readWellbeingConsent(userId)

  if (consent && !consent.granted) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Vous avez retiré votre consentement au suivi de votre bien-être.',
      data: { code: 'wellbeing_consent_withdrawn' },
    })
  }

  return consent
}
