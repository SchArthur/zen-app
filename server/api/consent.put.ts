import { ConsentType } from '../../lib/generated/prisma/enums.js'

/**
 * CU-04 — enregistrer une décision de consentement.
 *
 * PUT et non POST : le corps décrit l'état voulu des consentements, et l'envoyer
 * deux fois ne produit pas deux décisions — `recordDecision` n'écrit une ligne
 * que si l'état change réellement. Le journal reste la liste des décisions, pas
 * celle des clics.
 *
 * Route publique, comme la lecture : un visiteur doit pouvoir refuser la mesure
 * d'audience sans créer de compte. Le consentement au traitement des données de
 * bien-être, lui, suppose un compte — il n'y a pas de données de bien-être sans
 * titulaire.
 *
 * ⚠️ Limite assumée : ce point d'entrée écrit en base sans authentification. Une
 * inondation y créerait une ligne par requête, la limitation de débit du module
 * de sécurité ne pouvant être posée ici — elle compterait aussi les lectures
 * faites au rendu serveur, dont l'adresse d'origine est celle du serveur
 * lui-même, et les mettrait toutes dans le même compteur. La parade est au
 * déploiement : une limitation en amont, sur un stockage partagé, qui manque
 * déjà aux routes d'authentification en exécution sans serveur.
 */
export default defineEventHandler(async (event) => {
  const { analytics, wellbeing } = await validateBody(event, consentDecisionSchema)
  const subject = await readConsentSubject(event)

  if (wellbeing !== undefined && !subject.userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Connectez-vous pour décider du suivi de votre bien-être.',
      data: { code: 'authentication_required' },
    })
  }

  // C'est ici, et pas avant, que le visiteur reçoit une identité : au moment où
  // il prend une décision qu'il faut pouvoir lui rattacher. Le cookie est
  // reposé à chaque décision, ce qui fait courir sa validité depuis la dernière.
  const resolved = subject.userId
    ? subject
    : { userId: null, visitorId: subject.visitorId ?? generateVisitorId() }

  if (!resolved.userId) setConsentCookie(event, resolved.visitorId!)

  if (analytics !== undefined) await recordDecision(resolved, ConsentType.ANALYTICS, analytics)
  if (wellbeing !== undefined) await recordDecision(resolved, ConsentType.WELLBEING_DATA, wellbeing)

  return await consentState(resolved)
})
