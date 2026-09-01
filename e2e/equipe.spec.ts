import { expect, test } from '@playwright/test'
import { ACCOUNTS, signIn, visit } from './helpers'

/**
 * CU-12 — Consulter le climat de son équipe, et ce que la matrice des accès
 * interdit autour.
 *
 * **F8 exige nommément des tests d'accès refusé** pour cette vue. Les suites
 * Vitest les portent déjà au niveau de la route ; ce parcours-ci ajoute ce
 * qu'elles ne peuvent pas montrer : qu'un collaborateur qui tape l'adresse à la
 * main dans son navigateur tombe bien sur un refus, et non sur un écran qui se
 * charge à moitié avant de se vider.
 *
 * L'autre moitié de l'exigence — « ni les données d'une autre équipe » — est
 * vérifiée ici de la seule façon qui vaille au niveau du navigateur : aucun
 * identifiant d'équipe n'entre dans l'adresse, et en poser un n'y change rien.
 */

test.describe('Le manager consulte son équipe', () => {
  test('affiche des agrégats, et rien qui désigne quelqu\'un', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await visit(page, '/equipe')

    await expect(page.getByRole('heading', { name: /Équipe Produit/ })).toBeVisible()
    await expect(page.getByText(/aucun nom/)).toBeVisible()

    /**
     * Le contrôle de fond : aucun prénom de l'équipe ne figure dans la page. Il
     * porte sur le document entier, réponses réseau comprises — c'est bien là
     * qu'une fuite se verrait, et pas seulement à l'écran.
     */
    const contenu = await page.content()

    for (const prenom of ['Louis', 'Ines', 'Tomas', 'Awa', 'Hugo']) {
      expect(contenu, prenom).not.toContain(prenom)
    }
  })

  /** F7 en demande deux, et la période vit dans l'adresse : la vue se partage. */
  test('bascule entre la semaine et le mois par l\'adresse', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await visit(page, '/equipe')

    await page.getByRole('button', { name: 'Ce mois-ci' }).click()

    await expect(page).toHaveURL(/periode=mois/)
    await expect(page.getByRole('button', { name: 'Ce mois-ci' })).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * Le périmètre est **déduit** du compte, jamais reçu. Poser une équipe dans
   * l'adresse ne change donc rien : il n'y a aucun identifiant à falsifier.
   */
  test('ignore une équipe désignée dans l\'adresse', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await visit(page, '/equipe?teamId=une-autre-equipe&userId=quelquun')

    await expect(page.getByRole('heading', { name: /Équipe Produit/ })).toBeVisible()
  })

  /** Matrice des accès : CU-12 n'est ouvert qu'au manager. */
  test('refuse la vue d\'équipe à un collaborateur', async ({ page }) => {
    await signIn(page, ACCOUNTS.collaborateur)
    await visit(page, '/equipe')

    await expect(page.getByRole('heading', { name: 'Cette page ne vous est pas ouverte' })).toBeVisible()
    // Le refus ne nomme pas le rôle attendu : l'indiquer renseignerait sur
    // l'organisation interne de l'entreprise.
    await expect(page.getByText(/manager/i)).toHaveCount(0)
  })

  /** Et CU-13 n'est ouvert qu'au responsable RH — le manager n'y entre pas. */
  test('refuse la vue entreprise à un manager', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await visit(page, '/entreprise')

    await expect(page.getByRole('heading', { name: 'Cette page ne vous est pas ouverte' })).toBeVisible()
  })

  /** La navigation ne propose que ce à quoi le rôle a droit. */
  test('ne propose la vue d\'équipe qu\'à qui y a droit', async ({ page }) => {
    await signIn(page, ACCOUNTS.collaborateur)
    await expect(page.getByRole('link', { name: 'Mon équipe' })).toHaveCount(0)

    await visit(page, '/connexion')
    await signIn(page, ACCOUNTS.manager)
    await expect(page.getByRole('link', { name: 'Mon équipe' }).first()).toBeVisible()
  })
})
