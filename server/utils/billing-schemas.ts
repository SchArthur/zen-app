import { z } from 'zod'
import { PLANS } from '../../shared/utils/plans'
import type { Plan } from '../../lib/generated/prisma/enums.js'

/**
 * CU-15 — corps de `POST /api/billing/checkout`.
 *
 * Une seule entrée : la formule voulue. **Tout le reste se déduit** — le
 * périmètre facturé vient du compte du demandeur, le nombre de postes se compte
 * en base, le tarif se lit chez le prestataire. C'est le raisonnement de
 * `scopes.ts` appliqué à l'argent : un identifiant d'entreprise, un nombre de
 * postes ou un montant qui entreraient par la requête seraient autant de
 * valeurs à vérifier, alors qu'ils n'ont aucune raison d'être demandés.
 *
 * Les valeurs acceptées sont construites depuis `PLANS` et non recopiées : une
 * formule ajoutée à l'offre devient achetable sans qu'on y pense, et une
 * formule retirée cesse de l'être — dans les deux cas, sans second endroit à
 * corriger.
 */
export const checkoutRequestSchema = z.object({
  plan: z.enum(
    PLANS.map(plan => plan.id) as [Plan, ...Plan[]],
    'Choisissez une des formules proposées.',
  ),
})

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>

/**
 * CU-15 — corps de `POST /api/billing/confirm`.
 *
 * L'identifiant de session que le prestataire pose dans l'adresse de retour. Le
 * format est contraint dès l'entrée — préfixe et alphabet — non pas que cela
 * suffise à prouver quoi que ce soit, mais parce qu'une valeur fantaisiste doit
 * être refusée ici plutôt que partir en appel réseau chez un tiers. Ce qui
 * autorise réellement, c'est la relecture de la session **chez le prestataire**
 * et la comparaison de l'entreprise qu'elle désigne avec celle du demandeur.
 */
export const checkoutConfirmSchema = z.object({
  session: z
    .string('Session de paiement manquante.')
    .regex(/^cs_[A-Za-z0-9_]{10,255}$/, 'Session de paiement invalide.'),
})

export type CheckoutConfirm = z.infer<typeof checkoutConfirmSchema>
