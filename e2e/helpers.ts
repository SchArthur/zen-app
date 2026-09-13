import { expect, type Page } from '@playwright/test'

/**
 * Ce dont les trois parcours ont besoin, et rien de plus.
 *
 * Les comptes sont ceux du jeu de démonstration (`prisma/seed.ts`) : c'est la
 * même entreprise, les mêmes équipes et le même mot de passe qu'en soutenance.
 * Fabriquer un jeu de données propre aux tests aurait produit un second monde à
 * maintenir, et c'est celui de la démonstration qu'il faut savoir en état.
 */

export const DEMO_PASSWORD = 'ZenTime2026!'
export const DEMO_DOMAIN = 'zentime.demo'

export const ACCOUNTS = {
  collaborateur: `louis.marchand@${DEMO_DOMAIN}`,
  manager: `sofia.nakamura@${DEMO_DOMAIN}`,
  rh: `camille.perrot@${DEMO_DOMAIN}`,
}

/** Interface de Mailpit, le serveur SMTP de développement. */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'

/**
 * Attend que Vue ait repris la main sur le HTML rendu par le serveur.
 *
 * Sans cette attente, un clic parti trop tôt est traité par le navigateur seul :
 * le formulaire part en envoi natif — `@submit.prevent` n'est pas encore
 * branché — et la page se recharge sur `/connexion?`, champs vidés. C'est
 * l'écueil propre au rendu serveur, et il ne se voit qu'à l'exécution.
 *
 * Vue pose `__vue_app__` sur son élément racine au moment du montage : c'est le
 * signal le plus direct, et il ne dépend d'aucun détail de nos écrans.
 */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() =>
    '__vue_app__' in (document.querySelector('#__nuxt') ?? {}))
}

/**
 * Ouvre une adresse et attend que la page soit vivante.
 *
 * Employé partout à la place de `page.goto` : l'oubli ne se voit pas — le test
 * passe tant que la machine est rapide — et se manifeste plus tard par un échec
 * qu'on croira intermittent.
 */
export async function visit(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

/** Ouvre une session par le vrai formulaire, jamais en posant un cookie à la main. */
export async function signIn(page: Page, email: string) {
  await page.goto('/connexion')
  await waitForHydration(page)
  await page.getByLabel('Adresse email').fill(email)
  await page.getByLabel('Mot de passe').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: /connexion|se connecter/i }).click()
  await page.waitForURL(/\/tableau-de-bord/)
}

/** Vide la boîte de réception partagée avant un parcours qui attend un courriel. */
export async function clearInbox() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}

interface MailpitMessage {
  ID: string
  To: { Address: string }[]
  Subject: string
}

/**
 * Attend le courriel adressé à `address`, et rend son corps en texte.
 *
 * L'envoi est asynchrone côté serveur : la réponse HTTP de l'inscription ne
 * l'attend pas. D'où la boucle — c'est le seul endroit du dépôt où l'on scrute,
 * et c'est parce qu'on observe un système extérieur.
 */
export async function waitForEmail(address: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT}/api/v1/messages?limit=50`)
    const { messages } = await response.json() as { messages: MailpitMessage[] }
    const found = messages.find(message =>
      message.To.some(recipient => recipient.Address.toLowerCase() === address.toLowerCase()))

    if (found) {
      const detail = await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)
      const { Text, HTML } = await detail.json() as { Text: string, HTML: string }

      return { subject: found.Subject, body: `${Text}\n${HTML}` }
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  throw new Error(`Aucun courriel reçu pour ${address} en ${timeoutMs} ms.`)
}

/** Extrait le lien de confirmation d'un corps de courriel. */
export function confirmationLink(body: string) {
  const found = /https?:\/\/[^\s"<>]*\/confirmer-email\?token=[A-Za-z0-9_-]+/.exec(body)

  expect(found, 'le courriel doit porter un lien de confirmation').not.toBeNull()

  return found![0]
}

/** Une adresse jamais inscrite, sur le domaine de l'entreprise cliente. */
export function freshEmail() {
  return `e2e.${Date.now()}.${Math.floor(Math.random() * 1000)}@${DEMO_DOMAIN}`
}
