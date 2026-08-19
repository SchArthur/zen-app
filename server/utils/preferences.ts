import type { PreferencesInput } from './profile-schemas'

/**
 * Champs de préférence exposés hors du serveur. L'identifiant technique et la
 * date de mise à jour restent en base : rien ne s'en sert à l'écran, et une
 * projection unique évite qu'une route en laisse filtrer davantage.
 */
const preferenceSelect = {
  workStartHour: true,
  workEndHour: true,
  remindersEnabled: true,
  reminderIntervalMin: true,
  favoriteTypes: true,
} as const

/**
 * Préférences du compte, créées aux valeurs par défaut si elles n'existent pas
 * encore.
 *
 * Ces valeurs par défaut sont celles de `schema.prisma`, et de nulle part
 * ailleurs : les recopier en TypeScript ferait deux vérités pour un même
 * réglage, et la divergence ne se verrait qu'à l'usage.
 *
 * Le moteur de recommandation (J7) relira les préférences par cette même
 * fonction : il ne doit jamais tomber sur un compte qui n'en a pas.
 */
export function readPreferences(userId: string) {
  return prisma.preference.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: preferenceSelect,
  })
}

/** Enregistre le jeu complet de préférences. */
export function writePreferences(userId: string, values: PreferencesInput) {
  return prisma.preference.upsert({
    where: { userId },
    create: { userId, ...values },
    update: values,
    select: preferenceSelect,
  })
}
