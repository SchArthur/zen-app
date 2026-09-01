import { expect, test } from '@playwright/test'
import { ACCOUNTS, signIn, visit } from './helpers'

/**
 * CU-07 — Suivre une pause, du démarrage à l'historique.
 *
 * Le parcours va jusqu'à la **postcondition** du cas d'utilisation : « une pause
 * horodatée est visible dans l'historique ». Un test qui s'arrêterait au
 * démarrage du minuteur ne prouverait pas grand-chose — c'est l'écriture en base
 * et sa relecture qui font la fonction.
 *
 * Chaque exécution referme la pause qu'elle a ouverte : l'index partiel de la
 * base n'en autorise qu'une par compte, et une pause laissée ouverte ferait
 * échouer l'exécution suivante.
 */

test.describe('Prendre une pause', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.collaborateur)
    await visit(page, '/pauses')

    // Une pause oubliée par une exécution précédente est refermée d'abord.
    const arreter = page.getByRole('button', { name: 'Arrêter la pause' })

    if (await arreter.isVisible()) {
      await arreter.click()
      await expect(page.getByText('minuteur à l\'arrêt')).toBeVisible()
    }
  })

  test('démarre le minuteur, l\'arrête, et retrouve la pause dans l\'historique', async ({ page }) => {
    const avant = Number((await page.getByText(/^\d+ \/ \d+$/).first().textContent())!.split('/')[0]!.trim())

    // ── Démarrer ─────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Démarrer une pause' }).first().click()

    await expect(page.getByText('pause en cours', { exact: true })).toBeVisible()
    await expect(page.getByText('Pause démarrée')).toBeVisible()

    // Le minuteur avance : l'écoulé est repris par l'horloge du navigateur.
    await expect(page.getByText('00:02')).toBeVisible({ timeout: 5000 })

    // ── Arrêter ──────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Arrêter la pause' }).click()

    await expect(page.getByText(/Pause de .* enregistrée/)).toBeVisible()
    await expect(page.getByText('minuteur à l\'arrêt')).toBeVisible()

    // ── Postcondition : la pause est comptée, et horodatée à l'historique ────
    const apres = Number((await page.getByText(/^\d+ \/ \d+$/).first().textContent())!.split('/')[0]!.trim())
    expect(apres).toBe(avant + 1)

    await visit(page, '/pauses/historique')
    await expect(page.getByText('Aujourd\'hui').first()).toBeVisible()
  })

  /**
   * Le raccourci de la barre latérale démarre la pause **et** mène au minuteur :
   * c'est le point 2 du scénario nominal, « le système enregistre l'heure de
   * début et affiche le minuteur ».
   */
  test('démarre une pause en une interaction depuis un autre écran', async ({ page }) => {
    await visit(page, '/exercices')

    await page.getByRole('button', { name: /Prendre une pause/ }).first().click()

    await expect(page).toHaveURL(/\/pauses/)
    await expect(page.getByText('pause en cours', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Arrêter la pause' }).click()
    await expect(page.getByText('minuteur à l\'arrêt')).toBeVisible()
  })

  /**
   * Le second onglet. L'index partiel de la base rejette la seconde insertion,
   * la route traduit ce refus en 409, et l'interface mène au minuteur sans rien
   * reprocher : du point de vue de la personne, le résultat voulu est atteint.
   */
  test('ne crée pas deux pauses ouvertes depuis deux onglets', async ({ page, context }) => {
    await page.getByRole('button', { name: 'Démarrer une pause' }).first().click()
    await expect(page.getByText('pause en cours', { exact: true })).toBeVisible()

    const secondOnglet = await context.newPage()
    await visit(secondOnglet, '/exercices')
    await secondOnglet.getByRole('button', { name: /Prendre une pause/ }).first().click()

    await expect(secondOnglet).toHaveURL(/\/pauses/)
    await expect(secondOnglet.getByText('pause en cours', { exact: true })).toBeVisible()
    // Aucune erreur affichée : ce n'est pas une faute de l'utilisateur.
    await expect(secondOnglet.getByRole('alert')).toHaveCount(0)

    await secondOnglet.getByRole('button', { name: 'Arrêter la pause' }).click()
    await expect(secondOnglet.getByText('minuteur à l\'arrêt')).toBeVisible()
    await secondOnglet.close()
  })
})
