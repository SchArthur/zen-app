import { describe, expect, it, vi } from 'vitest'
import TeamPage from '../../app/pages/equipe.vue'
import CompanyPage from '../../app/pages/entreprise.vue'
import routeMiddleware from '../../app/middleware/auth'
import { $fetch, mountAsync, navigateTo, route, router, serve, userSession } from '../helpers/vue'

/**
 * CU-12, CU-13 et CU-14 — les écrans d'encadrement.
 *
 * Ce qui est vérifié ici est ce que la personne voit **quand le seuil n'est pas
 * atteint**. Le serveur, lui, ne calcule rien — c'est déjà testé. Reste la
 * moitié qui compte pour l'utilisateur : un écran qui explique la règle plutôt
 * que de laisser croire à une panne, et qui propose une issue.
 */

const SERIES = [
  { date: '2026-08-25', breaks: 12, exercises: 5, mood: 3.4, stress: 2.8 },
  { date: '2026-08-26', breaks: 10, exercises: 4, mood: 3.6, stress: 2.6 },
]

const TOTALS = {
  breaks: 22,
  breakSec: 13_200,
  exercises: 9,
  moodAvg: 3.5,
  stressAvg: 2.7,
  declarants: 8,
}

const TRENDS = { breaks: 3, exercises: -1, mood: 0.1, stress: -0.2 }

function rapport(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    threshold: 5,
    headcount: 12,
    period: 'semaine',
    days: 7,
    series: SERIES,
    totals: TOTALS,
    trends: TRENDS,
    ...overrides,
  }
}

describe('l\'écran de climat d\'équipe (CU-12)', () => {
  it('annonce l\'effectif et la promesse de non-intrusion', async () => {
    serve('/api/team', { team: { name: 'Produit' }, ...rapport() })

    const texte = (await mountAsync(TeamPage)).text()

    expect(texte).toContain('Équipe Produit')
    expect(texte).toContain('12 personnes')
    expect(texte).toContain('aucun nom')
    expect(texte).toContain('aucun classement entre collègues')
  })

  /**
   * Alternative A1 de CU-12 : sous le seuil, aucun agrégat n'est calculé ni
   * transmis. Le message explique la règle et propose d'élargir la période, au
   * lieu de laisser croire à une panne.
   */
  it('explique le seuil au lieu d\'afficher une page vide', async () => {
    serve('/api/team', {
      team: { name: 'Produit' },
      ...rapport({ available: false, series: undefined, totals: undefined, trends: undefined }),
    })

    const wrapper = await mountAsync(TeamPage)

    expect(wrapper.text()).toContain('Pas assez de déclarations pour calculer une moyenne')
    expect(wrapper.text()).toContain('Moins de 5 personnes')
    expect(wrapper.text()).toContain('c\'est la contrepartie de ce que ZenTime promet')
  })

  it('propose d\'élargir au mois, et seulement depuis la semaine', async () => {
    serve('/api/team', { team: { name: 'Produit' }, ...rapport({ available: false }) })

    const surLaSemaine = await mountAsync(TeamPage)
    const elargir = surLaSemaine.findAll('button').find(b => b.text() === 'Élargir au mois')
    expect(elargir).toBeDefined()

    await elargir!.trigger('click')
    expect(router.push).toHaveBeenCalledWith({ query: { periode: 'mois' } })

    route.query = { periode: 'mois' }
    const surLeMois = await mountAsync(TeamPage)
    expect(surLeMois.findAll('button').find(b => b.text() === 'Élargir au mois')).toBeUndefined()
  })

  /** L'état de la période vit dans l'adresse : la vue se partage et se met en favori. */
  it('écrit la période dans l\'adresse, et retire le paramètre par défaut', async () => {
    route.query = { periode: 'mois' }
    serve('/api/team', { team: { name: 'Produit' }, ...rapport({ period: 'mois', days: 30 }) })

    const wrapper = await mountAsync(TeamPage)
    const semaine = wrapper.findAll('[role="group"] button')[0]!

    expect(semaine.attributes('aria-pressed')).toBe('false')
    await semaine.trigger('click')

    expect(router.push).toHaveBeenCalledWith({ query: {} })
  })
})

describe('l\'écran des indicateurs d\'entreprise (CU-13, CU-14)', () => {
  it('applique les mêmes garanties que la vue d\'équipe', async () => {
    serve('/api/company', { company: { name: 'Atelier Voisin' }, ...rapport() })

    const texte = (await mountAsync(CompanyPage)).text()

    expect(texte).toContain('Atelier Voisin')
    expect(texte).toContain('le même seuil de 5 déclarants')
  })

  /**
   * L'export porte exactement les mêmes agrégats que l'écran : sous le seuil, il
   * n'a pas plus de raison d'exister, et le bouton disparaît.
   */
  it('retire le bouton d\'export sous le seuil, et le dit', async () => {
    serve('/api/company', {
      company: { name: 'Atelier Voisin' },
      ...rapport({ available: false }),
    })

    const wrapper = await mountAsync(CompanyPage)

    expect(wrapper.findAll('button').find(b => b.text().includes('Exporter'))).toBeUndefined()
    expect(wrapper.text()).toContain('L\'export est également indisponible')
  })

  /**
   * Le fichier est récupéré par `fetch` plutôt que par un lien : c'est ce qui
   * permet d'afficher un refus lisible — seuil non atteint, session expirée — là
   * où un lien direct ouvrirait un onglet sur une page d'erreur JSON.
   *
   * Le nom vient du serveur, qui l'a construit avec l'entreprise et la période :
   * le recomposer ici ferait deux vérités pour un même fichier.
   */
  it('télécharge l\'export sous le nom donné par le serveur', async () => {
    serve('/api/company', { company: { name: 'Atelier Voisin' }, ...rapport() })

    /**
     * Le clic est intercepté sur le prototype plutôt qu'en remplaçant
     * `createElement` : Vue s'en sert lui aussi pour rendre la page, et le
     * détourner ferait échouer le montage avant même l'export.
     */
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:zentime'),
      revokeObjectURL: vi.fn(),
    })

    $fetch.raw.mockResolvedValue({
      headers: { get: () => 'attachment; filename="zentime-atelier-voisin-semaine-2026-08-27.csv"' },
      _data: 'Journée;Pauses prises\n',
    })

    const wrapper = await mountAsync(CompanyPage)
    await wrapper.findAll('button').find(b => b.text().includes('Exporter'))!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(clic).toHaveBeenCalled()
    // Sans révocation, le blob reste en mémoire jusqu'au rechargement de la page.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:zentime')
    expect(wrapper.text()).toContain('zentime-atelier-voisin-semaine-2026-08-27.csv')

    clic.mockRestore()
  })

  it('affiche un refus lisible plutôt qu\'une page d\'erreur', async () => {
    serve('/api/company', { company: { name: 'Atelier Voisin' }, ...rapport() })

    $fetch.raw.mockRejectedValue({
      data: {
        statusMessage: 'Moins de 5 personnes ont déclaré sur cette période.',
        data: { code: 'below_anonymity_threshold' },
      },
    })

    const wrapper = await mountAsync(CompanyPage)
    await wrapper.findAll('button').find(b => b.text().includes('Exporter'))!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="alert"]').text()).toContain('Moins de 5 personnes')
  })
})

describe('le middleware de route', () => {
  /**
   * Il ne protège que l'affichage — il s'exécute dans le navigateur, où tout se
   * contourne. La protection réelle est celle de `server/middleware/auth.ts`.
   * Ce qu'il doit garantir : renvoyer là où l'on peut agir, sans perdre la page
   * demandée.
   */
  it('renvoie à la connexion en gardant la page demandée', () => {
    routeMiddleware({ fullPath: '/equipe?periode=mois' } as never, {} as never)

    expect(navigateTo).toHaveBeenCalledWith({
      path: '/connexion',
      query: { suite: '/equipe?periode=mois' },
    })
  })

  it('laisse passer une personne connectée', () => {
    userSession.loggedIn.value = true

    expect(routeMiddleware({ fullPath: '/equipe' } as never, {} as never)).toBeUndefined()
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
