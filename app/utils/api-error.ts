export interface ApiError {
  /** Message destiné à l'utilisateur. */
  message: string
  /** Messages de validation, par champ du formulaire. */
  errors: Record<string, string[]>
  /** Code stable permettant de réagir sans se fier au texte (`email_not_verified`…). */
  code?: string
}

interface ErrorPayload {
  statusMessage?: string
  message?: string
  data?: {
    errors?: Record<string, string[]>
    code?: string
  }
}

/**
 * Normalise une erreur de `$fetch` en quelque chose d'affichable.
 *
 * Nitro emballe la réponse d'erreur dans `error.data` ; une panne réseau, elle,
 * ne produit aucune enveloppe. Les deux cas doivent aboutir à un message lisible
 * plutôt qu'à un écran vide.
 */
export function toApiError(error: unknown): ApiError {
  const payload = (error as { data?: ErrorPayload } | undefined)?.data

  return {
    message: payload?.statusMessage || payload?.message || 'Une erreur est survenue. Réessayez.',
    errors: payload?.data?.errors ?? {},
    code: payload?.data?.code,
  }
}
