import { z } from 'zod'
import { PERIODS } from './stats'

/**
 * CU-11 — Consulter son tableau de bord personnel.
 *
 * Une seule entrée à filtrer : la période. F7 en demande « deux, sélectionnables »
 * — la semaine et le mois — et le schéma n'en accepte pas d'autre.
 *
 * Le vocabulaire est celui de l'interface (`semaine`, `mois`) et non celui de la
 * base : ce n'est pas une énumération du modèle, c'est un choix d'affichage.
 * L'URL reste lisible, ce qui compte pour un état que l'on partage ou que l'on
 * met en favori.
 */

export const DEFAULT_PERIOD = 'semaine' satisfies keyof typeof PERIODS

export const statsQuerySchema = z.object({
  period: z
    .enum(Object.keys(PERIODS) as [keyof typeof PERIODS], 'Période inconnue.')
    .default(DEFAULT_PERIOD),
})

export type StatsQuery = z.infer<typeof statsQuerySchema>
