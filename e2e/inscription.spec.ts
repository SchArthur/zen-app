import { expect, test } from '@playwright/test'
import {
  ACCOUNTS,
  DEMO_PASSWORD,
  clearInbox,
  confirmationLink,
  freshEmail,
  visit,
  waitForEmail,
} from './helpers'

/**
 * CU-02 puis CU-03 — s'inscrire, confirmer son adresse, se connecter.
 *
 * **Le seul parcours du produit qu'aucun test unitaire ne peut prouver.** Le
 * double opt-in traverse quatre systèmes — le navigateur, Nitro, PostgreSQL et
 * un serveur SMTP — et ce qui peut casser vit précisément entre eux : un lien
 * mal construit, un jeton haché différemment à l'écriture et à la lecture, une
 * adresse de retour qui pointe ailleurs.
 *
 * Le courriel est relu dans Mailpit, comme le ferait la personne dans sa boîte.
 */

test.describe('Inscription et première connexion', () => {
  test('crée un compte inactif, l\'active par le lien reçu, puis connecte', async ({ page }) => {
    await clearInbox()
    const email = freshEmail()

    // ── 1. Inscription ───────────────────────────────────────────────────────
    await visit(page, '/inscription')
    await page.getByLabel('Prénom').fill('Alix')
    await page.getByLabel('Nom', { exact: true }).fill('Renaud')
    await page.getByLabel('Adresse email professionnelle').fill(email)
    await page.getByLabel('Mot de passe').fill(DEMO_PASSWORD)
    await page.getByLabel(/J'accepte les conditions/).check()
    await page.getByRole('button', { name: 'Créer mon compte' }).click()

    // Le formulaire disparaît : le seul geste utile est d'aller relever sa boîte.
    await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeVisible()
    await expect(page.locator('form')).toHaveCount(0)

    // ── 2. Le compte est créé mais **inactif** ──────────────────────────────
    await visit(page, '/connexion')
    await page.getByLabel('Adresse email').fill(email)
    await page.getByLabel('Mot de passe').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    await expect(page.getByRole('heading', { name: 'Adresse non confirmée' })).toBeVisible()
    await expect(page).toHaveURL(/\/connexion/)

    // ── 3. Le lien reçu par courriel ─────────────────────────────────────────
    const mail = await waitForEmail(email)
    expect(mail.subject).toMatch(/confirm/i)

    await visit(page, confirmationLink(mail.body))
    await expect(page.getByText(/votre compte est actif/i)).toBeVisible()

    // ── 4. La connexion passe ────────────────────────────────────────────────
    await visit(page, '/connexion')
    await page.getByLabel('Adresse email').fill(email)
    await page.getByLabel('Mot de passe').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    await expect(page).toHaveURL(/\/tableau-de-bord/)
    await expect(page.getByRole('heading', { name: /Bonjour, Alix/ })).toBeVisible()

    /**
     * ── 5. CU-05.2 — et l'on ressort par où l'on est entré ──────────────────
     *
     * Le parcours efface le compte qu'il vient de créer. Deux raisons, et la
     * seconde compte autant que la première : il ne laisse rien derrière lui
     * dans la base de démonstration — un compte de test fausserait le décompte
     * des postes facturables et les agrégats d'entreprise — et il démontre au
     * passage que le droit à l'effacement s'exerce **en autonomie**, sans écrire
     * à personne. C'est l'exigence de F10, et elle se prouve mal autrement.
     */
    await visit(page, '/mes-donnees')
    await page.getByLabel('Votre mot de passe').fill(DEMO_PASSWORD)
    await page.getByLabel(/suppression est définitive/).check()
    await page.getByRole('button', { name: 'Supprimer définitivement mon compte' }).click()

    await expect(page).toHaveURL(/\/connexion\?compte=supprime/)
    await expect(page.getByText(/vos déclarations ont été supprimés/)).toBeVisible()
  })

  /**
   * Le refus porte sur le **domaine**, jamais sur une adresse : il ne révèle
   * aucun compte. Et il dit quoi faire ensuite — sans quoi le visiteur est dans
   * un cul-de-sac dont il ne peut pas sortir seul.
   */
  test('refuse un domaine sans entreprise cliente, en indiquant la marche à suivre', async ({ page }) => {
    await visit(page, '/inscription')
    await page.getByLabel('Prénom').fill('Alix')
    await page.getByLabel('Nom', { exact: true }).fill('Renaud')
    await page.getByLabel('Adresse email professionnelle').fill('alix.renaud@entreprise-inconnue.fr')
    await page.getByLabel('Mot de passe').fill(DEMO_PASSWORD)
    await page.getByLabel(/J'accepte les conditions/).check()
    await page.getByRole('button', { name: 'Créer mon compte' }).click()

    await expect(page.getByText(/bonjour@zentime\.fr/)).toBeVisible()
  })

  /**
   * Une adresse inconnue et un mot de passe erroné doivent être indiscernables :
   * sans cela, la page de connexion devient un annuaire des salariés.
   */
  test('ne distingue pas une adresse inconnue d\'un mot de passe erroné', async ({ page }) => {
    const messages: string[] = []

    for (const [email, password] of [
      [ACCOUNTS.collaborateur, 'MauvaisMotDePasse1'],
      [`personne.inexistante@zentime.demo`, DEMO_PASSWORD],
    ]) {
      await visit(page, '/connexion')
      await page.getByLabel('Adresse email').fill(email!)
      await page.getByLabel('Mot de passe').fill(password!)
      await page.getByRole('button', { name: 'Se connecter' }).click()

      messages.push((await page.getByRole('alert').first().textContent())!.trim())
    }

    expect(messages[0]).toBe(messages[1])
  })

  /** CU-03 — la connexion mène au tableau de bord, et le nom vient de la session. */
  test('connecte un compte du jeu de démonstration', async ({ page }) => {
    await visit(page, '/connexion')
    await page.getByLabel('Adresse email').fill(ACCOUNTS.collaborateur)
    await page.getByLabel('Mot de passe').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    await expect(page).toHaveURL(/\/tableau-de-bord/)
    await expect(page.getByRole('heading', { name: /Bonjour, Louis/ })).toBeVisible()
  })
})
