import type { Role } from '../../lib/generated/prisma/enums.js'

/**
 * CU-12.2 — Journaliser la consultation.
 *
 * Inclus **sans condition** par CU-12, CU-13 et CU-14 : toute consultation de
 * données de bien-être d'autrui laisse une trace, réussie comme refusée. Un
 * journal qui n'enregistrerait que les succès ne dirait rien de ce qui compte —
 * les tentatives d'accès à une équipe qui n'est pas la sienne.
 *
 * L'écriture est **attendue** avant que la réponse ne parte, et une erreur n'est
 * pas rattrapée. C'est la lecture stricte de l'engagement de F8, « 100 % des
 * consultations journalisées » : servir la donnée en sachant que la trace a
 * échoué reviendrait à annoncer une garantie qu'on n'offre pas. La consultation
 * échoue donc plutôt que de passer sans trace.
 */

/**
 * Actions journalisées. Chaînes stables : elles seront lues par des humains
 * dans un export de journal, et éventuellement par un outil de supervision.
 */
export const ACCESS_ACTIONS = {
  teamView: 'team.view',
  teamDenied: 'team.denied',
  companyView: 'company.view',
  companyExport: 'company.export',
} as const

export type AccessAction = typeof ACCESS_ACTIONS[keyof typeof ACCESS_ACTIONS]

interface Actor {
  id: string
  role: Role
}

/**
 * Enregistre une consultation.
 *
 * `target` porte le périmètre consulté — identifiant d'équipe ou d'entreprise,
 * accompagné de la période. Sans lui, le journal dirait qui a regardé sans dire
 * quoi, ce qui ne prouve rien.
 *
 * Le rôle est recopié depuis la session : c'est celui **du moment de la
 * consultation**. Le relire plus tard sur le compte donnerait le rôle actuel, et
 * un journal qui change de sens après coup n'est pas un journal.
 */
export function recordAccess(actor: Actor, action: AccessAction, target: string | null) {
  return prisma.accessLog.create({
    data: {
      action,
      target,
      actorId: actor.id,
      // Copie hors clé étrangère : c'est elle qui survit à la suppression du
      // compte, et qui garde le journal opposable (voir le modèle AccessLog).
      actorRef: actor.id,
      actorRole: actor.role,
    },
    select: { id: true },
  })
}

/** Périmètre consulté, tel qu'il est inscrit au journal : « team:abc123/semaine ». */
export function accessTarget(scope: string, id: string, period: string) {
  return `${scope}:${id}/${period}`
}
