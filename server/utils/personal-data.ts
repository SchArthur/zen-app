/**
 * CU-05 — Exercer ses droits sur ses données.
 *
 * Deux opérations, et une seule définition de ce que « mes données » recouvre :
 * l'export (CU-05.1) et la suppression (CU-05.2) doivent porter sur le même
 * périmètre. Les écrire l'une sans l'autre, c'est la garantie qu'un modèle
 * ajouté plus tard entrera dans l'un et pas dans l'autre — donc qu'on exportera
 * ce qu'on n'efface pas, ou l'inverse.
 *
 * Le périmètre, modèle par modèle :
 *
 * | Modèle | Export | Suppression |
 * |---|---|---|
 * | `User`, `Preference` | oui | supprimés |
 * | `BreakSession`, `ExerciseLog`, `MoodCheckIn` | oui | supprimés en cascade |
 * | `VerificationToken` | non — condensats à usage unique, sans intérêt pour la personne | supprimés en cascade |
 * | `Consent` | oui | **conservé, dissocié** (article 7.1 — voir le modèle) |
 * | `AccessLog` | oui, les consultations faites **par** la personne | **conservé, dissocié** (engagement de F8) |
 * | `Company`, `Team`, `Exercise` | dénominations seulement | intacts — ce ne sont pas ses données |
 * | `Subscription` | non | intact — il appartient à l'entreprise |
 */

/**
 * Assemble l'export du droit d'accès et de portabilité (articles 15 et 20).
 *
 * JSON : format ouvert, structuré et lisible par une machine, ce qu'exige
 * l'article 20 — et lisible par un humain, ce que la personne attend.
 *
 * Les libellés sont dénormalisés (le titre de l'exercice, le nom de l'équipe)
 * plutôt que renvoyés par identifiant technique. Un export dans lequel il
 * faudrait résoudre `cmf3x…` pour savoir de quel exercice on parle ne rend pas
 * les données « dans un format aisément réutilisable ».
 */
export async function buildPersonalDataExport(userId: string, now: Date = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      emailVerifiedAt: true,
      company: { select: { name: true } },
      team: { select: { name: true } },
      preference: {
        select: {
          workStartHour: true,
          workEndHour: true,
          remindersEnabled: true,
          reminderIntervalMin: true,
          favoriteTypes: true,
          updatedAt: true,
        },
      },
    },
  })

  // La barrière globale a déjà vérifié que le compte existe ; ce refus couvre la
  // suppression concurrente, entre la barrière et cette lecture.
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Ce compte n\'existe plus.',
      data: { code: 'account_gone' },
    })
  }

  const [breaks, exercises, moods, consents, accesses] = await Promise.all([
    prisma.breakSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, endedAt: true, durationSec: true },
    }),
    prisma.exerciseLog.findMany({
      where: { userId },
      orderBy: { completedAt: 'asc' },
      select: { completedAt: true, exercise: { select: { slug: true, title: true, type: true } } },
    }),
    prisma.moodCheckIn.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
      select: { date: true, mood: true, stress: true, createdAt: true },
    }),
    prisma.consent.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, granted: true, version: true, createdAt: true },
    }),
    // Consultations faites **par** la personne, jamais celles qui la
    // concerneraient : les agrégats consultés ne portent sur personne en
    // particulier, et l'inverse ferait de cet export un moyen de savoir qui
    // regarde son équipe.
    prisma.accessLog.findMany({
      where: { actorRef: userId },
      orderBy: { createdAt: 'asc' },
      select: { action: true, target: true, actorRole: true, createdAt: true },
    }),
  ])

  return {
    meta: {
      produitPar: 'ZenTime',
      genereLe: now.toISOString(),
      format: 'JSON (UTF-8)',
      portee: 'Toutes les données personnelles rattachées à ce compte, à l\'exception des jetons techniques de confirmation d\'adresse.',
      contact: 'confidentialite@zentime.fr',
    },
    compte: {
      identifiant: user.id,
      email: user.email,
      prenom: user.firstName,
      nom: user.lastName,
      role: user.role,
      entreprise: user.company.name,
      equipe: user.team?.name ?? null,
      creeLe: user.createdAt.toISOString(),
      modifieLe: user.updatedAt.toISOString(),
      adresseConfirmeeLe: user.emailVerifiedAt?.toISOString() ?? null,
    },
    preferences: user.preference
      ? {
          debutJournee: user.preference.workStartHour,
          finJournee: user.preference.workEndHour,
          rappelsActifs: user.preference.remindersEnabled,
          intervalleRappelMin: user.preference.reminderIntervalMin,
          famillesPreferees: user.preference.favoriteTypes,
          modifieLe: user.preference.updatedAt.toISOString(),
        }
      : null,
    pauses: breaks.map(session => ({
      debut: session.startedAt.toISOString(),
      fin: session.endedAt?.toISOString() ?? null,
      dureeSec: session.durationSec,
    })),
    exercices: exercises.map(log => ({
      realiseLe: log.completedAt.toISOString(),
      exercice: log.exercise.title,
      identifiant: log.exercise.slug,
      famille: log.exercise.type,
    })),
    // `date` est une colonne DATE : la découper au « T » évite d'annoncer une
    // heure de minuit qui n'existe pas dans la donnée.
    humeur: moods.map(entry => ({
      journee: entry.date.toISOString().split('T')[0],
      humeur: entry.mood,
      stress: entry.stress,
      declareLe: entry.createdAt.toISOString(),
    })),
    consentements: consents.map(consent => ({
      finalite: consent.type,
      accorde: consent.granted,
      versionDesTextes: consent.version,
      decideLe: consent.createdAt.toISOString(),
    })),
    consultationsEffectuees: accesses.map(access => ({
      action: access.action,
      perimetre: access.target,
      roleAuMoment: access.actorRole,
      le: access.createdAt.toISOString(),
    })),
  }
}

/** Nom du fichier proposé au téléchargement. */
export function personalDataExportFilename(now: Date = new Date()) {
  return `zentime-mes-donnees-${now.toISOString().split('T')[0]}.json`
}

/**
 * Efface le compte et tout ce qui en dépend (article 17).
 *
 * Une seule instruction : les cascades déclarées au schéma font le reste, et
 * c'est délibéré. Énumérer les suppressions ici les ferait diverger du modèle au
 * premier ajout — un modèle rattaché à `User` sans ligne correspondante dans
 * cette fonction survivrait à son titulaire sans que personne ne s'en aperçoive.
 *
 * Ce qui **ne** disparaît pas, et pourquoi : les lignes de `Consent` et
 * d'`AccessLog` sont détachées du compte (`SET NULL`) et gardent leur référence
 * pseudonyme. La première prouve qu'un consentement avait été recueilli, la
 * seconde qu'une consultation avait été tracée ; toutes deux cessent de désigner
 * quelqu'un. Voir les commentaires des deux modèles.
 *
 * Effet de bord documenté (écart E5) : les agrégats d'équipe étant calculés à la
 * volée, une suppression réécrit rétroactivement les moyennes passées et peut
 * faire repasser une équipe sous le seuil des cinq déclarants.
 */
export async function erasePersonalData(userId: string) {
  await prisma.user.delete({ where: { id: userId }, select: { id: true } })
}
