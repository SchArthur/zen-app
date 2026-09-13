import { z } from 'zod'

/**
 * CU-05.2 — Supprimer son compte.
 *
 * La suppression demande le mot de passe. Ce n'est pas une formalité : une
 * session ouverte sur un poste non verrouillé suffirait sans cela à effacer
 * douze mois de déclarations, sans retour possible. Le même geste protège d'une
 * requête déclenchée depuis un autre site — le cookie partirait, le mot de passe
 * non.
 *
 * Aucune règle de robustesse ici, pour la raison qui vaut déjà à la connexion :
 * elles s'appliquent au **choix** d'un mot de passe, pas à sa saisie.
 */
export const deleteAccountSchema = z.object({
  password: z
    .string('Mot de passe requis pour confirmer la suppression.')
    .min(1, 'Mot de passe requis pour confirmer la suppression.'),
})

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>
