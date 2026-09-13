import type { MaybeRefOrGetter, Ref } from 'vue'

/**
 * Rappel de pause (CU-07, alternative A1).
 *
 * Le rappel est produit par le navigateur, jamais par le serveur : les
 * notifications poussées sont explicitement hors périmètre (F3), il n'existe
 * donc ni tâche planifiée ni acteur « horloge » (`cas-utilisation.md`, §3).
 * L'horloge est celle de l'utilisateur, ce qui a l'avantage de respecter son
 * heure locale sans rien avoir à stocker.
 *
 * Deux canaux, dans cet ordre : un bandeau dans l'application, qui existe
 * toujours, et une notification système, seulement si elle a été autorisée.
 * Le bandeau est le canal principal — c'est ce qui permet à l'exception E1
 * (« notifications refusées ») de ne rien casser du tout.
 */

interface ReminderPreferences {
  remindersEnabled: boolean
  reminderIntervalMin: number
  workStartHour: number
  workEndHour: number
}

/** Report d'un rappel (CU-07.1) : un quart d'heure, en une interaction. */
export const SNOOZE_MIN = 15

/** `unsupported` : le navigateur ne connaît pas l'API du tout. */
export type ReminderPermission = 'unsupported' | NotificationPermission

/** Début de la journée de travail déclarée, à la date de `reference`. */
function workdayStart(reference: Date, hour: number) {
  const start = new Date(reference)
  start.setHours(hour, 0, 0, 0)

  return start
}

/**
 * Fin de la journée de travail déclarée.
 *
 * `setHours(24, …)` bascule sur minuit du lendemain, ce qui est exactement le
 * sens de « 24 h » dans les préférences : une journée qui s'achève à minuit se
 * dit 24 h, pas 0 h (voir `profile-schemas.ts`).
 */
function workdayEnd(reference: Date, hour: number) {
  const end = new Date(reference)
  end.setHours(hour, 0, 0, 0)

  return end
}

export function useBreakReminder(options: {
  /** Horloge de la page, avancée une fois par seconde. */
  now: Ref<Date>
  /** `null` tant que les réglages n'ont pas été lus : aucun rappel d'ici là. */
  preferences: MaybeRefOrGetter<ReminderPreferences | null>
  /** Fin de la dernière pause terminée, ou `null` s'il n'y en a pas eu. */
  lastEndedAt: MaybeRefOrGetter<Date | null>
  /** Une pause en cours suspend le rappel : il est déjà suivi. */
  running: MaybeRefOrGetter<boolean>
}) {
  const { now } = options

  // L'état de l'autorisation n'est lu qu'au montage : `Notification` n'existe
  // pas côté serveur, et la valeur de départ doit être la même des deux côtés.
  const permission = ref<ReminderPermission>('default')

  onMounted(() => {
    permission.value = 'Notification' in window ? Notification.permission : 'unsupported'
  })

  const snoozedUntil = ref<Date | null>(null)

  /** Heure du prochain rappel, ou `null` si les rappels sont désactivés. */
  const dueAt = computed(() => {
    const preferences = toValue(options.preferences)

    if (!preferences?.remindersEnabled) return null

    // Le compte repart de la dernière pause, ou du début de la journée si l'on
    // n'en a pas encore pris : ce qui est mesuré est le temps passé assis sans
    // interruption, pas le temps écoulé depuis l'ouverture de l'écran.
    const start = workdayStart(now.value, preferences.workStartHour)
    const last = toValue(options.lastEndedAt)
    const base = last && last > start ? last : start

    const at = new Date(base.getTime() + preferences.reminderIntervalMin * 60_000)
    const snoozed = snoozedUntil.value

    return snoozed && snoozed > at ? snoozed : at
  })

  /**
   * Sommes-nous dans les horaires déclarés ?
   *
   * Aucun rappel n'en sort : c'est une règle de CU-07, et l'inverse — être
   * invité à souffler à 22 h — dessert le propos du produit.
   */
  const withinWorkHours = computed(() => {
    const preferences = toValue(options.preferences)

    if (!preferences) return false

    const current = now.value

    return current >= workdayStart(current, preferences.workStartHour)
      && current < workdayEnd(current, preferences.workEndHour)
  })

  /** Le rappel est-il dû, ici et maintenant ? */
  const due = computed(() => {
    const at = dueAt.value

    if (!at || toValue(options.running)) return false

    return now.value >= at && withinWorkHours.value
  })

  // Une notification par rappel, et non une par seconde : la clé retenue est
  // l'heure du rappel, si bien qu'un report en produit une nouvelle et qu'un
  // simple rafraîchissement de l'écran n'en produit aucune.
  const notified = ref<number | null>(null)

  watch([due, permission], ([isDue, state]) => {
    if (!isDue || state !== 'granted') return

    const at = dueAt.value

    if (!at || notified.value === at.getTime()) return

    notified.value = at.getTime()

    try {
      // `tag` : un rappel remplace le précédent au lieu de s'empiler.
      new Notification('Il est temps de faire une pause', {
        body: 'Quelques minutes debout suffisent à couper la position assise.',
        tag: 'zentime-pause',
      })
    }
    catch {
      // Certains navigateurs refusent la construction directe hors contexte
      // sécurisé. Le bandeau dans l'application, lui, est déjà affiché : le
      // rappel n'est pas perdu, il est seulement moins visible.
    }
  })

  /**
   * Demande l'autorisation d'afficher des notifications.
   *
   * Appelée sur clic explicite, et jamais au chargement : un navigateur qui a
   * refusé l'a refusé pour de bon, et redemander à chaque session est
   * précisément ce que l'exception E1 de CU-07 interdit.
   */
  async function requestPermission() {
    if (permission.value === 'unsupported') return

    try {
      permission.value = await Notification.requestPermission()
    }
    catch {
      permission.value = 'denied'
    }
  }

  /** Reporte le rappel d'un quart d'heure (CU-07.1). */
  function snooze() {
    snoozedUntil.value = new Date(now.value.getTime() + SNOOZE_MIN * 60_000)
  }

  return { permission, due, dueAt, withinWorkHours, requestPermission, snooze }
}
