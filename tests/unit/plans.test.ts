import { describe, expect, it } from 'vitest'
import {
  BILLING_UNIT,
  HIGHLIGHTED_PLAN,
  PLANS,
  findPlan,
  formatPrice,
  planCovers,
  planFromLookupKey,
  priceInCents,
  stripeLookupKey,
} from '../../shared/utils/plans'
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

describe('planCovers', () => {
  it('fait couvrir Standard par Premium, et pas l\'inverse', () => {
    expect(planCovers('PREMIUM', 'STANDARD')).toBe(true)
    expect(planCovers('STANDARD', 'PREMIUM')).toBe(false)
  })

  it('fait qu\'une formule se couvre elle-même', () => {
    for (const plan of Object.values(Plan)) {
      expect(planCovers(plan, plan), plan).toBe(true)
    }
  })

  /**
   * Une formule ajoutée au schéma sans rang vaudrait `undefined`, et toute
   * comparaison la concernant serait fausse **dans les deux sens** : elle ne
   * couvrirait rien et rien ne la couvrirait, y compris elle-même. Le test
   * précédent l'attrape ; celui-ci dit pourquoi il est là.
   */
  it('classe chaque formule du schéma', () => {
    for (const plan of Object.values(Plan)) {
      expect(planCovers(plan, 'STANDARD') || planCovers('STANDARD', plan), plan).toBe(true)
    }
  })

  // Un ordre total, sans ex æquo : deux formules de même rang s'ouvriraient
  // mutuellement, et l'une des deux ne servirait plus à rien.
  it('établit un ordre sans égalité entre formules distinctes', () => {
    for (const a of Object.values(Plan)) {
      for (const b of Object.values(Plan)) {
        if (a === b) continue
        expect(planCovers(a, b) && planCovers(b, a), `${a}/${b}`).toBe(false)
      }
    }
  })
})

describe('stripeLookupKey', () => {
  it('donne une clé stable, distincte par formule', () => {
    const keys = PLANS.map(plan => stripeLookupKey(plan.id))

    expect(new Set(keys).size).toBe(PLANS.length)
    expect(stripeLookupKey('STANDARD')).toBe('zentime_standard_monthly')
  })

  // Le prestataire n'accepte dans une clé de recherche que des lettres, des
  // chiffres, des tirets et des tirets bas. Une formule nommée avec un accent
  // ferait échouer la synchronisation, et l'erreur arriverait du serveur du
  // prestataire plutôt que d'ici.
  it('n\'emploie que des caractères acceptés par le prestataire', () => {
    for (const plan of Object.values(Plan)) {
      expect(stripeLookupKey(plan), plan).toMatch(/^[a-z0-9_-]+$/)
    }
  })

  it('fait l\'aller-retour avec la formule', () => {
    for (const plan of Object.values(Plan)) {
      expect(planFromLookupKey(stripeLookupKey(plan)), plan).toBe(plan)
    }
  })

  it('ne reconnaît pas une clé étrangère à la grille', () => {
    expect(planFromLookupKey('promo_partenaire_2024')).toBeNull()
    expect(planFromLookupKey('')).toBeNull()
    expect(planFromLookupKey(null)).toBeNull()
    expect(planFromLookupKey(undefined)).toBeNull()
  })
})

describe('priceInCents', () => {
  it('convertit les tarifs de la grille', () => {
    expect(priceInCents(3)).toBe(300)
    expect(priceInCents(6)).toBe(600)
  })

  /**
   * `4.2 * 100` vaut 420.00000000000006 en virgule flottante, et un tarif créé
   * à cette valeur est refusé par le prestataire. Les prix sont entiers
   * aujourd'hui ; ils ne le resteront pas forcément.
   */
  it('ne laisse pas passer l\'erreur de la virgule flottante', () => {
    expect(priceInCents(4.2)).toBe(420)
    expect(priceInCents(1.15)).toBe(115)
    expect(Number.isInteger(priceInCents(4.2))).toBe(true)
  })

  it('donne un montant entier et positif pour chaque formule', () => {
    for (const plan of PLANS) {
      expect(Number.isInteger(priceInCents(plan.pricePerSeat)), plan.name).toBe(true)
      expect(priceInCents(plan.pricePerSeat), plan.name).toBeGreaterThan(0)
    }
  })
})
