import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { ConsentType } from '../../lib/generated/prisma/enums.js'

/**
 * CU-04 — Gérer son consentement.
 *
 * La table `Consent` conserve **l'historique** des décisions : accorder puis
 * retirer produit deux lignes, et non une ligne modifiée. C'est ce qui permet de
 * prouver qu'un consentement était en vigueur à une date donnée — sans quoi la
 * charge de la preuve de l'article 7.1 du RGPD serait intenable. La décision qui
 * fait foi est donc la plus récente, jamais la première trouvée.
 *
 * Deux finalités distinctes se décident ici, et elles ne se ressemblent pas :
 *
 * - **la mesure d'audience** (`ANALYTICS`), qui relève des traceurs. La doctrine
 *   de la CNIL lui attache une durée de validité — six mois — au terme de
 *   laquelle le choix est resollicité ;
 * - **le traitement des données de bien-être** (`WELLBEING_DATA`), qui est la
 *   base légale d'un traitement au sens de l'article 6. Rien n'impose de le
 *   redemander périodiquement, et le faire expirer fermerait le formulaire de
 *   déclaration à quelqu'un qui n'a rien retiré. Sa validité ne dépend donc que
 *   de la version des textes acceptés.
 *
 * `TERMS` n'est pas décidé ici : l'acceptation des conditions est une condition
 * de l'inscription, recueillie par `POST /api/auth/register`.
 */

/**
 * Version des textes soumis au consentement.
 *
 * Elle est recopiée dans chaque ligne du journal : c'est elle qui permet
 * d'établir, deux ans plus tard, **à quoi** la personne a dit oui. La faire
 * évoluer resollicite tout le monde — c'est le but, et c'est pour cela qu'elle
 * ne change qu'avec la politique de confidentialité.
 */
export const CONSENT_POLICY_VERSION = 'v1'

/**
 * Durée de validité d'un choix de traceur, en jours.
 *
 * Six mois : l'ordre de grandeur que l'autorité retient comme bonne pratique.
 * Passé ce délai, le bandeau reparaît — y compris après un refus, sans quoi un
 * refus vaudrait pour toujours et le consentement ne serait plus une décision
 * révisable.
 */
export const CONSENT_VALIDITY_DAYS = 183

/**
 * Cookie du visiteur non connecté.
 *
 * Il ne contient qu'un identifiant opaque, tiré au hasard, qui ne désigne la
 * personne dans aucun autre système et ne sert qu'à retrouver **sa** décision.
 * C'est le cookie de consentement lui-même, celui que la CNIL exempte de
 * consentement parce qu'il est strictement nécessaire à la conservation du
 * choix.
 *
 * Il n'est déposé **qu'au moment où une décision est prise** — jamais à
 * l'affichage du bandeau. Poser un identifiant pour pouvoir enregistrer un choix
 * que la personne n'a pas encore fait serait déjà déposer un traceur sans
 * consentement, et le fait qu'il soit le nôtre n'y changerait rien.
 */
export const CONSENT_COOKIE = 'zentime_consent'

/** Types dont la personne décide elle-même, par opposition aux CGU. */
export const DECIDABLE_CONSENTS = [ConsentType.ANALYTICS, ConsentType.WELLBEING_DATA] as const

/**
 * À qui se rattache une décision : à un compte, ou à un visiteur.
 *
 * Jamais aux deux. Une personne connectée décide **pour son compte** — c'est ce
 * qui rend la décision opposable et transportable d'un navigateur à l'autre.
 */
export interface ConsentSubject {
  userId: string | null
  visitorId: string | null
}

export interface ConsentDecision {
  granted: boolean
  version: string
  createdAt: Date
}

/**
 * Sujet de la requête courante.
 *
 * La session prime sur le cookie : sur un poste partagé, la décision du visiteur
 * qui est passé avant n'est pas celle du titulaire du compte. C'est aussi
 * pourquoi la décision du visiteur n'est **pas** recopiée sur le compte à la
 * connexion — le bandeau peut reparaître une fois après la première connexion,
 * et c'est le comportement correct.
 */
export async function readConsentSubject(event: H3Event): Promise<ConsentSubject> {
  const session = await getUserSession(event)

  if (session?.user) return { userId: session.user.id, visitorId: null }

  return { userId: null, visitorId: getCookie(event, CONSENT_COOKIE) ?? null }
}

function subjectWhere(subject: ConsentSubject) {
  if (subject.userId) return { userId: subject.userId }

  return { visitorId: subject.visitorId }
}

/**
 * Décisions en vigueur, une par finalité.
 *
 * `distinct` sur le type, avec un tri d'abord par type puis par date
 * décroissante : la base remonte la ligne la plus récente de chaque finalité,
 * en suivant l'index `(userId, type, createdAt)`. Lire tout le journal pour
 * n'en garder que la dernière ligne coûterait de plus en plus cher à chaque
 * décision prise.
 */
export async function readDecisions(subject: ConsentSubject): Promise<Map<ConsentType, ConsentDecision>> {
  if (!subject.userId && !subject.visitorId) return new Map()

  const rows = await prisma.consent.findMany({
    where: subjectWhere(subject),
    orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    distinct: ['type'],
    select: { type: true, granted: true, version: true, createdAt: true },
  })

  return new Map(rows.map(row => [row.type, row]))
}

/**
 * Une décision est-elle encore celle qui fait foi ?
 *
 * Une décision prise sur une version antérieure des textes ne vaut plus : la
 * personne a consenti à autre chose. Pour les traceurs s'y ajoute la péremption
 * de six mois ; pour une base légale de traitement, non (voir l'en-tête).
 */
export function isDecisionCurrent(decision: ConsentDecision, type: ConsentType, now: Date = new Date()) {
  if (decision.version !== CONSENT_POLICY_VERSION) return false
  if (type !== ConsentType.ANALYTICS) return true

  const ageDays = (now.getTime() - decision.createdAt.getTime()) / 86_400_000

  return ageDays < CONSENT_VALIDITY_DAYS
}

/**
 * Enregistre une décision, si c'en est une.
 *
 * Rien n'est écrit quand la personne réaffirme un choix déjà en vigueur et
 * encore valide : le journal doit rester la liste des **décisions**, pas celle
 * des affichages du bandeau. Un changement d'avis, une nouvelle version des
 * textes ou une décision périmée écrivent, eux, une ligne de plus.
 */
export async function recordDecision(
  subject: ConsentSubject,
  type: ConsentType,
  granted: boolean,
  now: Date = new Date(),
) {
  const current = (await readDecisions(subject)).get(type)

  if (current && current.granted === granted && isDecisionCurrent(current, type, now)) return false

  await prisma.consent.create({
    data: {
      type,
      granted,
      version: CONSENT_POLICY_VERSION,
      userId: subject.userId,
      // Copie hors clé étrangère : c'est elle qui survit à la suppression du
      // compte et garde la preuve produisible (voir le modèle Consent).
      subjectRef: subject.userId,
      visitorId: subject.visitorId,
    },
    select: { id: true },
  })

  return true
}

/**
 * État présenté aux écrans, pour un sujet donné.
 *
 * Une seule construction, partagée par la lecture et par l'écriture : le
 * bandeau doit pouvoir se fier au fait que la réponse d'un enregistrement décrit
 * le même monde que la lecture qui l'a précédé.
 *
 * `analytics` vaut `null` tant qu'aucune décision valide n'existe — c'est ce que
 * l'interface traduit par « le bandeau doit s'afficher ». Une décision périmée
 * ou prise sur une version antérieure des textes revient donc à `null`, et non à
 * un refus : la question est reposée, elle n'est pas tranchée à la place de la
 * personne.
 */
export async function consentState(subject: ConsentSubject, now: Date = new Date()) {
  const decisions = await readDecisions(subject)
  const analytics = decisions.get(ConsentType.ANALYTICS) ?? null
  const wellbeing = decisions.get(ConsentType.WELLBEING_DATA) ?? null
  const analyticsIsCurrent = analytics ? isDecisionCurrent(analytics, ConsentType.ANALYTICS, now) : false
  const wellbeingState = subject.userId ? wellbeingConsentState(wellbeing) : null

  return {
    policyVersion: CONSENT_POLICY_VERSION,
    analytics: analyticsIsCurrent ? analytics!.granted : null,
    analyticsDecidedAt: analyticsIsCurrent ? analytics!.createdAt.toISOString() : null,
    // Un visiteur n'a pas de données de bien-être : la question ne se pose pas
    // encore pour lui, et `null` la distingue d'une décision à prendre.
    wellbeing: wellbeingState,
    wellbeingDecidedAt: wellbeingState === 'granted' || wellbeingState === 'withdrawn'
      ? wellbeing!.createdAt.toISOString()
      : null,
  }
}

/** Identifiant de visiteur : 128 bits, sans aucun sens hors de notre table. */
export function generateVisitorId() {
  return randomBytes(16).toString('base64url')
}

/**
 * Dépose le cookie de consentement, une fois la décision prise.
 *
 * `httpOnly` : le choix est lu par le serveur, jamais par un script de page —
 * ce qui met le contenu du cookie hors de portée d'un script injecté. La durée
 * du cookie est celle de la validité du choix : à son expiration, la question
 * est reposée d'elle-même.
 */
export function setConsentCookie(event: H3Event, visitorId: string) {
  setCookie(event, CONSENT_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: CONSENT_VALIDITY_DAYS * 86_400,
  })
}

/** Dernière décision connue sur les données de bien-être, ou `null`. */
export async function readWellbeingConsent(userId: string) {
  return (await readDecisions({ userId, visitorId: null })).get(ConsentType.WELLBEING_DATA) ?? null
}

/**
 * État du consentement bien-être, tel que les écrans doivent le présenter.
 *
 * Trois états et non deux : « jamais décidé » n'est pas « refusé ». Le refus
 * ferme le formulaire en le disant (exception E1 de CU-09) ; l'absence de
 * décision, elle, doit poser la question — c'est le seul chemin par lequel
 * quelqu'un peut dire oui.
 */
export type WellbeingConsentState = 'granted' | 'withdrawn' | 'unknown'

export function wellbeingConsentState(decision: ConsentDecision | null): WellbeingConsentState {
  if (!decision) return 'unknown'
  if (!decision.granted) return 'withdrawn'
  if (!isDecisionCurrent(decision, ConsentType.WELLBEING_DATA)) return 'unknown'

  return 'granted'
}

/**
 * Refuse l'écriture d'une donnée de bien-être sans consentement en vigueur.
 *
 * **L'absence de décision vaut refus depuis le lot 7**, et c'est la fermeture de
 * la tolérance que le lot 4 s'était accordée. Elle existait pour une raison
 * précise : le recueil du consentement appartenait à CU-04, non livré, et exiger
 * une décision aurait fermé le formulaire à tous les comptes créés par le
 * parcours réel — y compris à ceux qui n'avaient jamais eu l'occasion de dire
 * oui. CU-04 étant livré, la raison a disparu : l'écran de déclaration pose
 * désormais la question, et `/mes-donnees` permet d'y revenir à tout moment.
 *
 * Le refus distingue les deux cas par son code. Ce n'est pas un détail
 * d'affichage : « vous avez retiré votre consentement » et « nous ne vous
 * l'avons jamais demandé » n'appellent pas la même réponse de l'interface.
 */
export async function assertWellbeingConsent(userId: string) {
  const decision = await readWellbeingConsent(userId)
  const state = wellbeingConsentState(decision)

  if (state === 'granted') return decision

  throw createError({
    statusCode: 403,
    statusMessage: state === 'withdrawn'
      ? 'Vous avez retiré votre consentement au suivi de votre bien-être.'
      : 'Votre consentement au suivi de votre bien-être n\'a pas encore été recueilli.',
    data: { code: state === 'withdrawn' ? 'wellbeing_consent_withdrawn' : 'wellbeing_consent_missing' },
  })
}
