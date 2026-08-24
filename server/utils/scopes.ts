/**
 * Périmètres de consultation des vues d'encadrement (CU-12, CU-13, CU-14).
 *
 * **Aucun périmètre ne se demande, il se déduit.** Ni l'équipe ni l'entreprise
 * ne figurent dans l'URL : le serveur les lit sur le compte du demandeur. Le
 * scénario de CU-12 dit « le système vérifie que le demandeur est bien le
 * responsable de l'équipe demandée » ; ne rien demander est plus fort que
 * vérifier, puisqu'il n'y a alors aucun identifiant à deviner ni à falsifier.
 * C'est le même raisonnement que pour `PATCH /api/breaks/current`.
 *
 * **Le rattachement est relu en base, jamais repris du cookie.** La session
 * recopie `teamId` à la connexion (voir `session.ts`) ; un manager muté verrait
 * donc son ancienne équipe jusqu'à sa prochaine reconnexion. Sur des données de
 * bien-être, ce délai est un accès indu.
 */

export interface Scope {
  id: string
  name: string
  /** Identifiants des personnes du périmètre. Ne sortent jamais du serveur. */
  memberIds: string[]
}

/** Équipe du manager, ou `null` s'il n'est rattaché à aucune. */
export async function readTeamScope(userId: string): Promise<Scope | null> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      team: {
        select: { id: true, name: true, members: { select: { id: true } } },
      },
    },
  })

  if (!account?.team) return null

  return {
    id: account.team.id,
    name: account.team.name,
    memberIds: account.team.members.map(member => member.id),
  }
}

/**
 * Entreprise du responsable RH.
 *
 * `companyId` n'est jamais nul dans le modèle : un compte appartient toujours à
 * une entreprise, c'est son domaine de messagerie qui l'y rattache. Le repli
 * existe malgré tout, parce qu'un compte supprimé entre la barrière et ce point
 * ne doit pas produire une erreur de programmation.
 */
export async function readCompanyScope(userId: string): Promise<Scope | null> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      company: {
        select: { id: true, name: true, users: { select: { id: true } } },
      },
    },
  })

  if (!account?.company) return null

  return {
    id: account.company.id,
    name: account.company.name,
    memberIds: account.company.users.map(member => member.id),
  }
}
