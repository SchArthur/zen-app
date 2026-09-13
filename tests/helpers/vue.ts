import * as vue from 'vue'
import { config, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, vi } from 'vitest'
import type { Component } from 'vue'

/**
 * Banc d'essai des composants de `app/`.
 *
 * Même principe que le banc des routes : un composant Nuxt s'écrit avec des
 * **importations automatiques** — `ref`, `computed`, `$fetch`, `navigateTo`,
 * `toApiError` — qui n'existent pas hors de Nuxt. Elles sont publiées ici sur
 * `globalThis`, et les composants se montent alors avec `@vue/test-utils` seul.
 *
 * Le choix se paie d'une dépendance de plus (le greffon Vue de Vite) et se
 * rembourse en secondes : monter l'application Nuxt complète pour vérifier
 * qu'une échelle d'humeur n'a aucun niveau pré-coché coûterait une construction
 * entière à chaque exécution, et rendrait la suite trop lente pour être lancée
 * pendant qu'on code.
 *
 * Ce qui est vérifié ici est ce que la personne voit et fait : le texte affiché,
 * les attributs d'accessibilité, ce qui part sur le réseau au clic, ce qui
 * s'affiche quand cet appel échoue. Ce qui ne l'est pas : le style — Tailwind
 * n'est pas exécuté, les classes sont lues comme des chaînes.
 */

/* ------------------------------------------------------------------ */
/* Doubles pilotables par les tests                                    */
/* ------------------------------------------------------------------ */

/**
 * Ce que le composant envoie au serveur. À programmer test par test.
 *
 * `raw` est la variante qui rend la réponse entière plutôt que son corps : les
 * écrans s'en servent quand ils ont besoin des en-têtes, comme l'export CSV qui
 * lit le nom de fichier posé par le serveur.
 */
export const $fetch = Object.assign(vi.fn(), { raw: vi.fn() })

/** Les navigations demandées par le composant. */
export const navigateTo = vi.fn()

/** La session de qui consulte la page. Fermée par défaut. */
export const userSession = {
  loggedIn: vue.ref(false),
  user: vue.ref<Record<string, unknown> | null>(null),
  clear: vi.fn(),
  fetch: vi.fn(),
}

/** La route courante, modifiable avant le montage. */
function deriveFullPath(path: string, query: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue

    const values = Array.isArray(value) ? value : [value]

    for (const item of values) {
      search.append(key, item)
    }
  }

  const searchString = search.toString()
  return searchString ? `${path}?${searchString}` : path
}

export const route = vue.reactive({
  path: '/',
  query: {} as Record<string, string | string[] | undefined>,
  params: {} as Record<string, string>,
})

Object.defineProperty(route, 'fullPath', {
  get() {
    return deriveFullPath(route.path, route.query)
  },
  set(value: string) {
    const [path, search = ''] = value.split('?')
    route.path = path || '/'

    const params = new URLSearchParams(search)
    const nextQuery: Record<string, string | string[] | undefined> = {}

    for (const key of new Set(params.keys())) {
      const values = params.getAll(key)
      nextQuery[key] = values.length > 1 ? values : values[0]
    }

    route.query = nextQuery
  },
  enumerable: true,
  configurable: true,
})

/** Les navigations demandées au routeur (filtres d'URL notamment). */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
}

/**
 * Réponses servies par `useFetch`, par chemin d'API.
 *
 * Les pages appellent `useFetch` au plus haut niveau de leur `setup`, avant
 * toute autre chose : leur fournir la réponse ici revient à les placer devant un
 * serveur qui a déjà répondu, ce qui est l'état dans lequel elles s'affichent.
 */
export const fetchResponses = new Map<string, unknown>()

/** Programme la réponse de `useFetch` pour une route donnée. */
function buildFetchKey(path: string, options?: { key?: string; query?: Record<string, unknown> }) {
  if (typeof options?.key === 'string' && options.key.length > 0) {
    return options.key
  }

  const query = options?.query ?? {}
  const entries = Object.entries(query)

  if (entries.length === 0) {
    return path
  }

  const search = new URLSearchParams()

  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue

    const values = Array.isArray(value) ? value : [value]

    for (const item of values) {
      search.append(key, String(item))
    }
  }

  const searchString = search.toString()
  return searchString ? `${path}${path.includes('?') ? '&' : '?'}${searchString}` : path
}

export function serve(path: string, payload: unknown) {
  fetchResponses.set(buildFetchKey(path), payload)
}

function useFetch(path: string | (() => string), options?: { key?: string; query?: Record<string, unknown> }) {
  const resolved = typeof path === 'function' ? path() : path
  const key = buildFetchKey(resolved, options)

  return Promise.resolve({
    data: vue.ref(fetchResponses.get(key) ?? fetchResponses.get(resolved) ?? null),
    error: vue.ref(null),
    status: vue.ref('success'),
    refresh: vi.fn(),
    execute: vi.fn(),
  })
}

/* ------------------------------------------------------------------ */
/* Publication des importations automatiques                           */
/* ------------------------------------------------------------------ */

const h3 = await import('h3')

Object.assign(globalThis, {
  ...vue,

  $fetch,
  navigateTo,
  useFetch,
  useLazyFetch: useFetch,
  useRoute: () => route,
  useRouter: () => router,
  useUserSession: () => userSession,
  defineNuxtRouteMiddleware: <T>(middleware: T) => middleware,
  defineNuxtPlugin: <T>(plugin: T) => plugin,
  useRuntimeConfig: () => ({ public: { appUrl: 'http://localhost:3000', analytics: { host: '', domain: '' } } }),
  useState: <T>(_key: string, init?: () => T) => vue.ref(init?.()),
  useCookie: <T>(_name: string, options?: { default?: () => T }) => vue.ref(options?.default?.()),
  useSeoMeta: () => {},
  useHead: () => {},
  definePageMeta: () => {},
  refreshNuxtData: vi.fn(),
  createError: h3.createError,
  clearError: vi.fn(),

  /**
   * Les auxiliaires de `@nuxtjs/seo`. Ils ne produisent rien de visible dans la
   * page : ce qu'ils déclarent — image de partage, données structurées — se
   * vérifie sur le site rendu, pas sur un composant monté hors de Nuxt.
   */
  defineOgImage: () => {},
  useSchemaOrg: () => {},
  defineSoftwareApp: <T>(input: T) => input,
  defineOrganization: <T>(input: T) => input,
  defineWebSite: <T>(input: T) => input,
  defineWebPage: <T>(input: T) => input,
})

/**
 * Les utilitaires et composables de `app/` sont publiés à leur tour — c'est ce
 * que fait Nuxt. Le glob les prend tous : en omettre un se verrait à la première
 * exécution, et en publier un de trop ne coûte rien.
 */
const modules = {
  ...import.meta.glob<Record<string, unknown>>('../../app/utils/*.ts', { eager: true }),
  ...import.meta.glob<Record<string, unknown>>('../../app/composables/*.ts', { eager: true }),
}

const autoImports: Record<string, unknown> = {}

for (const module of Object.values(modules)) {
  for (const [name, value] of Object.entries(module)) {
    if (name === 'default') continue

    autoImports[name] = value
    ;(globalThis as Record<string, unknown>)[name] = value
  }
}

/**
 * Les mêmes noms sont aussi posés en propriétés globales de l'application.
 *
 * Un identifiant employé **dans un gabarit** — `{{ plural(n, 'compte') }}` — est
 * compilé en `_ctx.plural` et cherché sur l'instance du composant, pas sur
 * `globalThis`. Sans cette seconde publication, une fonction utilisée seulement
 * au gabarit reste introuvable là où la même, utilisée dans le script, se
 * résout.
 */
config.global.config = { globalProperties: autoImports }

/* ------------------------------------------------------------------ */
/* Substituts de composants                                            */
/* ------------------------------------------------------------------ */

/**
 * Les composants de `app/components/` sont enregistrés globalement — c'est ce
 * que fait Nuxt. Un écran monte alors ses vraies cartes, ses vrais champs et son
 * vrai bandeau, et non des coquilles vides qui ne prouveraient rien.
 */
const components = import.meta.glob<{ default: Component }>('../../app/components/*.vue', { eager: true })

config.global.components = Object.fromEntries(
  Object.entries(components).map(([path, module]) => [
    path.split('/').pop()!.replace('.vue', ''),
    module.default,
  ]),
)

config.global.stubs = {
  /**
   * `NuxtLink` est remplacé par une vraie ancre : les tests vérifient l'adresse
   * de destination, qui est ce que la personne suit. Le préchargement et la
   * détection de lien externe appartiennent à Nuxt, pas à nos écrans.
   */
  NuxtLink: {
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  },

  /**
   * Le seul composant remplacé par une coquille : il dessine dans un `<canvas>`,
   * que l'environnement de test n'implémente pas. Ce qu'il reçoit est vérifié
   * par les tests du composant qui l'alimente ; ce qu'il en dessine relève de
   * Chart.js.
   */
  AppChart: { template: '<div data-test="chart" />' },

  /**
   * `ClientOnly` rend son contenu : le test **est** le navigateur. Ce que ce
   * composant protège est le rendu serveur, qui n'a pas lieu ici.
   */
  ClientOnly: { template: '<div><slot /></div>' },
}

/* ------------------------------------------------------------------ */
/* Montage                                                             */
/* ------------------------------------------------------------------ */

/**
 * Monte un composant dont le `setup` est asynchrone — c'est le cas de tout écran
 * qui appelle `useFetch` au plus haut niveau. Vue exige alors une frontière
 * `Suspense`, que Nuxt pose lui-même autour des pages.
 */
export async function mountAsync(component: Component, options: Record<string, unknown> = {}) {
  const wrapper = mount(
    vue.defineComponent({
      components: { Sujet: component },
      setup: () => ({ attrs: options.props ?? {} }),
      template: '<Suspense><Sujet v-bind="attrs" /></Suspense>',
    }),
    { ...options, props: undefined },
  )

  // `Suspense` ne montre son contenu qu'une fois le `setup` asynchrone résolu.
  // Vider la file des promesses **puis** rendre : un simple `nextTick` laisserait
  // parfois la coquille vide, selon l'ordre des microtâches.
  await flushPromises()
  await vue.nextTick()

  return wrapper
}

/* ------------------------------------------------------------------ */
/* Remise à zéro entre deux tests                                      */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  $fetch.mockReset()
  $fetch.raw.mockReset()
  navigateTo.mockReset()
  router.push.mockReset()
  router.replace.mockReset()
  fetchResponses.clear()
  route.path = '/'
  route.query = {}
  route.params = {}
  userSession.loggedIn.value = false
  userSession.user.value = null
  userSession.fetch.mockReset()
  userSession.clear.mockReset()
})
