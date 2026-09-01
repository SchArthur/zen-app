import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, expect, vi } from 'vitest'
import { createEvent, createError } from 'h3'
import type { H3Event } from 'h3'
import type { Role } from '../../lib/generated/prisma/enums.js'

/**
 * Banc d'essai des gestionnaires de `server/api/`.
 *
 * Un gestionnaire Nitro n'est pas une fonction ordinaire : il est écrit avec des
 * **importations automatiques** — `defineEventHandler`, `createError`, `prisma`,
 * `requireAuth` — que Nuxt résout à la construction. Hors de Nuxt, ces
 * identifiants restent libres et se résolvent donc sur `globalThis` à
 * l'exécution. C'est tout ce que fait ce fichier : il **publie** les mêmes noms
 * comme variables globales avant qu'un seul gestionnaire ne soit importé.
 *
 * Trois raisons de procéder ainsi plutôt que de démarrer un vrai serveur :
 *
 * 1. **On teste la route, pas la base.** Le double de Prisma rend les cas
 *    limites atteignables — une pause déjà ouverte, un compte supprimé entre
 *    deux requêtes, une entreprise de quatre déclarants — que des jeux de
 *    données réels obligeraient à fabriquer, puis à défaire.
 * 2. **La suite n'a besoin de rien.** Ni Docker, ni PostgreSQL, ni migration :
 *    elle tourne sur le poste d'un relecteur qui vient de cloner le dépôt, et en
 *    intégration continue sans service annexe.
 * 3. **Ce qui est vérifié est le contrat de la route** : code de statut, code
 *    d'erreur stable, forme de la réponse, et surtout l'**ordre** des contrôles —
 *    c'est lui qui sépare une route sûre d'une route qui laisse filtrer une
 *    information avant de refuser.
 *
 * Ce que le banc ne prouve pas, et qui est couvert ailleurs : les requêtes SQL
 * réellement émises (tenues par les migrations et par les tests de bout en
 * bout), et le hachage des mots de passe, remplacé ici par un double
 * déterministe — c'est la bibliothèque d'authentification qui en répond.
 */

/* ------------------------------------------------------------------ */
/* Double de Prisma                                                    */
/* ------------------------------------------------------------------ */

type AnyMock = ReturnType<typeof vi.fn>

/**
 * Chaque `prisma.<modèle>.<méthode>` est une fonction espionne créée à la
 * demande et **mémorisée** : `prisma.user.findUnique` rend deux fois le même
 * objet, sans quoi aucune assertion ne tiendrait.
 */
function modelDouble(record: AnyMock[]) {
  const methods = new Map<string, AnyMock>()

  return new Proxy({}, {
    get(_target, name: string) {
      if (!methods.has(name)) {
        const mock = vi.fn()
        methods.set(name, mock)
        record.push(mock)
      }

      return methods.get(name)
    },
  })
}

function prismaDouble() {
  const mocks: AnyMock[] = []
  const models = new Map<string, object>()

  /**
   * Une transaction n'en est pas une ici : le rappel reçoit le même double, et
   * une composition de promesses est simplement attendue. Ce que les
   * gestionnaires attendent de `$transaction`, c'est que leur code s'exécute et
   * que le résultat leur revienne — l'atomicité est une garantie de PostgreSQL,
   * pas une propriété du code appelant.
   */
  const transaction = vi.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(proxy)
      : Promise.all(arg as Promise<unknown>[]))

  const root: Record<string, unknown> = { $transaction: transaction }

  const proxy: Record<string, unknown> = new Proxy(root, {
    get(target, name: string) {
      if (name in target) return target[name]

      if (!models.has(name)) models.set(name, modelDouble(mocks))

      return models.get(name)
    },
  })

  return {
    client: proxy,
    reset() {
      for (const mock of mocks) mock.mockReset()

      transaction.mockClear()
    },
  }
}

const prisma = prismaDouble()

/** Le double de Prisma installé sur `globalThis`, à programmer et à inspecter. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prismaMock = prisma.client as any

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

export interface TestUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  companyId: string
  teamId: string | null
}

const DEFAULT_USER: TestUser = {
  id: 'usr_collab',
  email: 'sofia.nakamura@zentime.demo',
  firstName: 'Sofia',
  lastName: 'Nakamura',
  role: 'COLLABORATOR',
  companyId: 'cmp_1',
  teamId: 'team_1',
}

let currentSession: { user: TestUser, loggedInAt: string } | null = null

/** Ouvre une session pour la durée du test. Sans argument : une collaboratrice. */
export function signIn(overrides: Partial<TestUser> = {}) {
  currentSession = {
    user: { ...DEFAULT_USER, ...overrides },
    loggedInAt: '2026-08-27T08:00:00.000Z',
  }

  return currentSession.user
}

/** Referme la session : les routes protégées doivent alors répondre 401. */
export function signOut() {
  currentSession = null
}

/** Ce que le gestionnaire a demandé à la session. */
export const sessionCalls = {
  clear: vi.fn(),
  set: vi.fn(),
  replace: vi.fn(),
}

/* ------------------------------------------------------------------ */
/* Configuration d'exécution                                           */
/* ------------------------------------------------------------------ */

/** Reprend `nuxt.config.ts`, secrets de paiement compris — vides par défaut. */
export const runtimeConfig = {
  session: { maxAge: 60 * 60 * 8 },
  stripe: { secretKey: '', webhookSecret: '' },
  mail: {
    host: 'localhost',
    port: 1025,
    secure: false,
    user: '',
    password: '',
    from: 'ZenTime <bonjour@zentime.fr>',
  },
  public: { appUrl: 'http://localhost:3000', analytics: { host: '', domain: '' } },
}

/* ------------------------------------------------------------------ */
/* Fabrique d'évènement                                                */
/* ------------------------------------------------------------------ */

export interface EventOptions {
  method?: string
  path?: string
  body?: unknown
  /** Corps transmis tel quel, pour la route qui lit les octets reçus. */
  rawBody?: string
  headers?: Record<string, string>
  /** Segments dynamiques de l'URL : `{ slug: 'souffle-4-7-8' }`. */
  params?: Record<string, string>
}

/**
 * Un **vrai** évènement h3, construit sur une requête et une réponse Node.
 *
 * Les auxiliaires de h3 sont alors les vrais et non des imitations : la chaîne
 * de requête est analysée comme en production, un corps mal formé échoue comme
 * en production, et un en-tête posé par le gestionnaire se relit sur la réponse.
 */
export function testEvent(options: EventOptions = {}): H3Event {
  const request = new IncomingMessage(new Socket())

  request.method = options.method ?? 'GET'
  request.url = options.path ?? '/api/test'
  request.headers = { host: 'localhost:3000', ...options.headers }

  const raw = options.rawBody
    ?? (options.body === undefined ? undefined : JSON.stringify(options.body))

  if (raw !== undefined) {
    request.headers['content-type'] ??= 'application/json'
    request.headers['content-length'] = String(Buffer.byteLength(raw))
    request.push(raw)
  }

  request.push(null)

  const event = createEvent(request, new ServerResponse(request))

  if (options.params) event.context.params = options.params

  return event
}

/** Le code de statut effectivement posé sur la réponse. */
export function responseStatus(event: H3Event) {
  return event.node.res.statusCode
}

/** Les en-têtes effectivement posés sur la réponse. */
export function responseHeaders(event: H3Event) {
  return event.node.res.getHeaders()
}

/* ------------------------------------------------------------------ */
/* Assertions                                                          */
/* ------------------------------------------------------------------ */

interface ThrownApiError {
  statusCode: number
  statusMessage: string
  data?: { code?: string, errors?: Record<string, string[]> }
}

/**
 * Attend un refus, et le rend pour inspection.
 *
 * Le code de statut **et** le code stable sont vérifiés ensemble : c'est le
 * couple que l'interface consomme (`toApiError`), et vérifier l'un sans l'autre
 * laisserait passer un renommage silencieux.
 */
export async function expectApiError(
  promise: Promise<unknown>,
  expected: { statusCode: number, code?: string },
) {
  let thrown: ThrownApiError | undefined

  try {
    await promise
  }
  catch (error) {
    thrown = error as ThrownApiError
  }

  expect(thrown, 'la route aurait dû refuser').toBeDefined()
  expect(thrown!.statusCode).toBe(expected.statusCode)

  if (expected.code) expect(thrown!.data?.code).toBe(expected.code)

  return thrown!
}

/* ------------------------------------------------------------------ */
/* Publication des importations automatiques                           */
/* ------------------------------------------------------------------ */

const h3 = await import('h3')

Object.assign(globalThis, {
  // h3 — les vrais auxiliaires, à une exception près.
  ...h3,

  /**
   * `defineEventHandler` est réduit à l'identité : le module exporte alors la
   * fonction elle-même, qu'un test appelle avec son évènement. L'enveloppe de h3
   * n'ajouterait ici que ses propres crochets, qui ne sont pas l'objet du test.
   */
  defineEventHandler: <T>(handler: T) => handler,

  useRuntimeConfig: () => runtimeConfig,

  prisma: prisma.client,

  // nuxt-auth-utils.
  requireUserSession: async (_event: H3Event, options?: { message?: string }) => {
    if (!currentSession) {
      throw createError({
        statusCode: 401,
        statusMessage: options?.message ?? 'Unauthorized',
        data: { code: 'unauthenticated' },
      })
    }

    return currentSession
  },
  getUserSession: async () => currentSession ?? {},
  setUserSession: async (_event: H3Event, data: unknown) => {
    sessionCalls.set(data)
    currentSession = { ...currentSession!, ...(data as object) } as typeof currentSession
  },
  replaceUserSession: async (_event: H3Event, data: unknown) => {
    sessionCalls.replace(data)
    currentSession = data as typeof currentSession
  },
  clearUserSession: async () => {
    sessionCalls.clear()
    currentSession = null
  },

  /**
   * Hachage remplacé par un double **déterministe et lisible**. Le vrai coûte
   * quelques centaines de millisecondes par appel — de quoi rendre la suite
   * inutilisable — et ce qu'il garantit relève de la bibliothèque, pas des
   * routes. Ce que les routes font de son verdict, en revanche, est exactement
   * ce qui est testé ici.
   */
  hashPassword: async (password: string) => `scrypt$${password}`,
  /**
   * Le préfixe désigne les paramètres de hachage, le reste le mot de passe :
   * `legacy$…` se vérifie donc comme `scrypt$…`, et seul `passwordNeedsReHash`
   * les distingue. C'est bien ce que fait le vrai — un condensat obsolète reste
   * valide, il demande seulement à être réécrit.
   */
  verifyPassword: async (hash: string, password: string) =>
    hash.replace(/^[a-z]+\$/, '') === password,
  /** Un condensat « hérité » est celui qu'il faut réécrire à la connexion. */
  passwordNeedsReHash: (hash: string) => hash.startsWith('legacy$'),
})

/**
 * Les utilitaires de `server/utils/` sont publiés à leur tour — c'est ce que
 * fait Nitro. Ils sont chargés **après** les globales ci-dessus, dont plusieurs
 * se servent.
 *
 * `prisma.ts` est le seul exclu : il ouvre un vrai pool de connexions dès son
 * chargement. Sa place est prise par le double.
 */
const utils = {
  ...import.meta.glob<Record<string, unknown>>('../../shared/utils/*.ts', { eager: true }),
  ...import.meta.glob<Record<string, unknown>>('../../server/utils/*.ts', { eager: true }),
}

for (const [path, module] of Object.entries(utils)) {
  if (path.endsWith('/prisma.ts')) continue

  for (const [name, value] of Object.entries(module)) {
    if (name === 'default') continue

    ;(globalThis as Record<string, unknown>)[name] = value
  }
}

/* ------------------------------------------------------------------ */
/* Remise à zéro entre deux tests                                      */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  prisma.reset()
  sessionCalls.clear.mockClear()
  sessionCalls.set.mockClear()
  sessionCalls.replace.mockClear()
  currentSession = null
  runtimeConfig.stripe.secretKey = ''
  runtimeConfig.stripe.webhookSecret = ''
})
