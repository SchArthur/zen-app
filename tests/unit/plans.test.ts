import { describe, expect, it } from 'vitest'
import { BILLING_UNIT, HIGHLIGHTED_PLAN, PLANS, findPlan, formatPrice } from '../../shared/utils/plans'
import { Plan } from '../../lib/generated/prisma/enums.js'

describe('PLANS', () => {
  // Le tunnel de paiement lira cette liste pour créer les produits : une formule
  // du schéma sans offre ici deviendrait un plan qu'on peut porter en base et
  // pas acheter, et l'inverse un prix affiché sans plan pour le recevoir.
  it('couvre exactement les valeurs de l\'énumération Plan du schéma', () => {
    expect(PLANS.map(plan => plan.id).sort()).toEqual(Object.values(Plan).sort())
  })

  it('n\'annonce aucun tarif nul ou négatif', () => {
    for (const plan of PLANS) {
      expect(plan.pricePerSeat, plan.name).toBeGreaterThan(0)
    }
  })

  it('donne à chaque formule un nom, une cible et au moins une ligne de contenu', () => {
    for (const plan of PLANS) {
      expect(plan.name.length, plan.id).toBeGreaterThan(0)
      expect(plan.audience.length, plan.id).toBeGreaterThan(0)
      expect(plan.features.length, plan.id).toBeGreaterThan(0)
    }
  })

  // La formule mise en avant doit exister : la page l'utilise pour choisir un
  // style, et un identifiant inconnu passerait sans erreur en n'en désignant
  // aucune.
  it('met en avant une formule qui existe', () => {
    expect(findPlan(HIGHLIGHTED_PLAN)).not.toBeNull()
  })

  it('rend null pour une formule inconnue', () => {
    expect(findPlan('GRATUIT' as never)).toBeNull()
  })

  // L'unité de facturation est reprise mot pour mot par la page publique et par
  // les données structurées : elle doit rester une seule chaîne.
  it('énonce une unité de facturation portant sur l\'usage réel', () => {
    expect(BILLING_UNIT).toContain('collaborateur actif')
  })
})

describe('formatPrice', () => {
  // La locale française insère une espace insécable étroite avant le symbole.
  // Les blancs sont donc normalisés avant comparaison : écrire le caractère réel
  // dans le test le rendrait illisible, et le confondre avec une espace ordinaire
  // ferait échouer l'assertion pour une raison invisible.
  it('formate un entier sans décimale', () => {
    expect(formatPrice(3).replace(/\s/g, ' ')).toBe('3 €')
  })

  it('garde les décimales quand il y en a', () => {
    expect(formatPrice(4.5).replace(/\s/g, ' ')).toBe('4,50 €')
  })
})
