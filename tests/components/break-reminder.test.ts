import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { SNOOZE_MIN, useBreakReminder } from '../../app/composables/useBreakReminder'

/**
 * CU-07, alternative A1 — le rappel de pause, et CU-07.1 — le report.
 *
 * Le rappel est produit par le **navigateur**, jamais par le serveur : les
 * notifications poussées sont hors périmètre (F3), il n'existe donc ni tâche
 * planifiée ni acteur « horloge ». Toute la logique tient dans ce composable, et
 * elle est entièrement décidable à partir d'une horloge et de quatre réglages —
 * ce qui la rend testable sans attendre.
 *
 * Ce qui est vérifié : quand le rappel est dû, quand il ne l'est pas, et que
 * l'autorisation refusée ne casse rien (exception E1).
 */

const PREFERENCES = {
  remindersEnabled: true,
  reminderIntervalMin: 90,
  workStartHour: 9,
  workEndHour: 18,
}

/** Un instant de la journée courante, à l'heure locale voulue. */
function at(hour: number, minute = 0) {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)

  return date
}

/**
 * Monte le composable dans un composant : `onMounted` doit s'exécuter pour que
 * l'état de l'autorisation soit lu. C'est le seul moyen de l'éprouver tel qu'il
 * tourne.
 */
function monter(options: {
  now: Date
  preferences?: typeof PREFERENCES | null
  lastEndedAt?: Date | null
  running?: boolean
}) {
  const now = ref(options.now)
  let exposed: ReturnType<typeof useBreakReminder>

  const wrapper = mount(defineComponent({
    setup() {
      exposed = useBreakReminder({
        now,
        preferences: options.preferences === undefined ? PREFERENCES : options.preferences,
        lastEndedAt: options.lastEndedAt ?? null,
        running: options.running ?? false,
      })

      return () => null
    },
  }))

  return { ...exposed!, now, wrapper }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('useBreakReminder — quand le rappel est dû', () => {
  /**
   * Le compte repart de la dernière pause, ou du début de la journée si l'on
   * n'en a pas encore pris : ce qui est mesuré est le temps passé **assis sans
   * interruption**, pas le temps écoulé depuis l'ouverture de l'écran.
   */
  it('part du début de journée quand aucune pause n\'a été prise', () => {
    const { dueAt } = monter({ now: at(10) })

    expect(dueAt.value).toEqual(at(10, 30))
  })

  it('repart de la dernière pause terminée', () => {
    const { dueAt } = monter({ now: at(14), lastEndedAt: at(13, 15) })

    expect(dueAt.value).toEqual(at(14, 45))
  })

  it('ignore une pause antérieure au début de la journée', () => {
    const { dueAt } = monter({ now: at(10), lastEndedAt: at(7) })

    expect(dueAt.value).toEqual(at(10, 30))
  })

  it('devient dû une fois l\'intervalle écoulé', () => {
    expect(monter({ now: at(10) }).due.value).toBe(false)
    expect(monter({ now: at(10, 31) }).due.value).toBe(true)
  })

  /** Une pause en cours suspend le rappel : elle est déjà suivie. */
  it('se tait pendant une pause', () => {
    expect(monter({ now: at(17), running: true }).due.value).toBe(false)
  })

  /**
   * Aucun rappel ne sort des horaires déclarés : être invité à souffler à 22 h
   * dessert le propos du produit.
   */
  it('ne sort pas des horaires déclarés', () => {
    const soir = monter({ now: at(21) })

    expect(soir.withinWorkHours.value).toBe(false)
    expect(soir.due.value).toBe(false)

    const matin = monter({ now: at(7) })

    expect(matin.withinWorkHours.value).toBe(false)
    expect(matin.due.value).toBe(false)
  })

  /** « 24 h » veut dire minuit du lendemain, pas 0 h du jour même. */
  it('comprend une journée qui s\'achève à minuit', () => {
    const { withinWorkHours } = monter({
      now: at(23),
      preferences: { ...PREFERENCES, workEndHour: 24 },
    })

    expect(withinWorkHours.value).toBe(true)
  })

  it('ne rappelle rien quand les rappels sont désactivés', () => {
    const { dueAt, due } = monter({
      now: at(17),
      preferences: { ...PREFERENCES, remindersEnabled: false },
    })

    expect(dueAt.value).toBeNull()
    expect(due.value).toBe(false)
  })

  /** Tant que les réglages n'ont pas été lus, aucun rappel n'est décidé. */
  it('ne décide rien sans réglages', () => {
    const { dueAt, withinWorkHours } = monter({ now: at(14), preferences: null })

    expect(dueAt.value).toBeNull()
    expect(withinWorkHours.value).toBe(false)
  })
})

describe('useBreakReminder — reporter (CU-07.1)', () => {
  it('repousse le rappel d\'un quart d\'heure, en une interaction', () => {
    const { dueAt, snooze } = monter({ now: at(11) })

    snooze()

    expect(dueAt.value).toEqual(at(11 + Math.floor(SNOOZE_MIN / 60), SNOOZE_MIN % 60))
    expect(SNOOZE_MIN).toBe(15)
  })

  /** Un report ne peut que reculer le rappel, jamais l'avancer. */
  it('ne ramène pas un rappel plus tôt que prévu', () => {
    const { dueAt, snooze } = monter({ now: at(9, 1) })

    snooze()

    // 10 h 30 reste postérieur au report de 9 h 16.
    expect(dueAt.value).toEqual(at(10, 30))
  })
})

/**
 * Double de l'API `Notification` du navigateur.
 *
 * Une fonction constructible plutôt qu'une classe : ce qu'on remplace est un
 * constructeur global doté de deux propriétés statiques, et la fonction dit
 * exactement cela. `onCreate` reçoit les arguments de chaque notification
 * construite — c'est ce que les tests observent.
 */
function stubNotification(options: {
  permission: string
  requestPermission?: () => Promise<string>
  onCreate?: (...args: unknown[]) => void
}) {
  function Double(...args: unknown[]) {
    options.onCreate?.(...args)
  }

  Object.assign(Double, {
    permission: options.permission,
    requestPermission: options.requestPermission ?? vi.fn(),
  })

  vi.stubGlobal('Notification', Double)

  return Double
}

describe('useBreakReminder — les notifications système', () => {
  /**
   * Exception E1 de CU-07 : notifications refusées ou absentes, **rien ne
   * casse**. Le bandeau dans l'application est le canal principal ; la
   * notification n'est qu'un second canal, facultatif.
   */
  it('se contente du bandeau quand le navigateur ne connaît pas les notifications', async () => {
    const { permission, requestPermission, due } = monter({ now: at(17) })

    expect(permission.value).toBe('unsupported')
    await requestPermission()
    expect(permission.value).toBe('unsupported')
    // Le rappel, lui, reste dû : c'est ce que le bandeau affichera.
    expect(due.value).toBe(true)
  })

  it('lit l\'autorisation déjà accordée au montage', () => {
    stubNotification({ permission: 'granted' })

    expect(monter({ now: at(10) }).permission.value).toBe('granted')
  })

  /**
   * L'autorisation n'est demandée que sur clic explicite. Un navigateur qui a
   * refusé l'a refusé pour de bon, et redemander à chaque session est
   * précisément ce que l'exception E1 interdit.
   */
  it('demande l\'autorisation sur clic, et retient un refus', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied')
    stubNotification({ permission: 'default', requestPermission })

    const reminder = monter({ now: at(10) })
    await reminder.requestPermission()

    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(reminder.permission.value).toBe('denied')
  })

  it('ne se casse pas si la demande d\'autorisation échoue', async () => {
    stubNotification({
      permission: 'default',
      requestPermission: vi.fn().mockRejectedValue(new Error('refus')),
    })

    const reminder = monter({ now: at(10) })
    await reminder.requestPermission()

    expect(reminder.permission.value).toBe('denied')
  })

  /**
   * Une notification par rappel, et non une par seconde : la clé retenue est
   * l'heure du rappel, si bien qu'un rafraîchissement n'en produit aucune de
   * plus et qu'un report en produit bien une nouvelle.
   */
  it('n\'affiche qu\'une notification par rappel', async () => {
    const construite = vi.fn()
    stubNotification({ permission: 'granted', onCreate: construite })

    const reminder = monter({ now: at(10) })

    reminder.now.value = at(11)
    await reminder.wrapper.vm.$nextTick()
    reminder.now.value = at(11, 1)
    await reminder.wrapper.vm.$nextTick()

    expect(construite).toHaveBeenCalledTimes(1)
    expect(construite.mock.calls[0]![0]).toBe('Il est temps de faire une pause')
    // `tag` : un rappel remplace le précédent au lieu de s'empiler.
    expect(construite.mock.calls[0]![1]).toMatchObject({ tag: 'zentime-pause' })

    reminder.snooze()
    await reminder.wrapper.vm.$nextTick()
    reminder.now.value = at(11, 20)
    await reminder.wrapper.vm.$nextTick()

    expect(construite).toHaveBeenCalledTimes(2)
  })

  /** Certains navigateurs refusent la construction directe : le bandeau reste. */
  it('survit à un navigateur qui refuse de construire la notification', async () => {
    stubNotification({
      permission: 'granted',
      onCreate: () => {
        throw new Error('contexte non sécurisé')
      },
    })

    const reminder = monter({ now: at(10) })
    reminder.now.value = at(11)

    await expect(reminder.wrapper.vm.$nextTick()).resolves.toBeUndefined()
    expect(reminder.due.value).toBe(true)
  })
})
