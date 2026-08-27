import 'dotenv/config'
import Stripe from 'stripe'
import { BILLING_UNIT, PLANS, priceInCents, stripeLookupKey } from '../shared/utils/plans'

/**
 * Publie la grille tarifaire de `shared/utils/plans.ts` chez le prestataire de
 * paiement — tâche 7.3, premier point.
 *
 * ```bash
 * npm run stripe:sync
 * ```
 *
 * **Pourquoi un script et non deux produits créés à la main dans une console.**
 * Un tarif saisi à la main est un tarif recopié : il se trompe de compte,
 * d'environnement ou de montant, et l'écart avec la page publique ne se voit
 * que sur une facture. Ici la grille a une source, ce fichier la reporte, et
 * `resolvePrice` refuse d'ouvrir un tunnel de paiement si les deux ont divergé.
 * Les trois pièces disent la même chose parce qu'elles lisent le même fichier.
 *
 * **Le script est rejouable.** Il ne crée que ce qui manque et ne touche à rien
 * d'autre — le lancer deux fois de suite ne produit pas quatre produits. C'est
 * la même exigence que pour une migration : une opération d'installation qu'on
 * n'ose pas relancer est une opération qu'on finit par faire à la main.
 *
 * ⚠️ **Les tarifs sont immuables chez le prestataire.** On ne change pas le prix
 * d'un tarif, on en crée un nouveau et on lui **transfère la clé de recherche** ;
 * l'ancien est désactivé, mais reste attaché aux abonnements en cours, qui
 * continuent d'être facturés au prix souscrit. C'est le comportement voulu : un
 * changement de grille ne s'applique pas rétroactivement aux clients existants.
 */

const secretKey = process.env.NUXT_STRIPE_SECRET_KEY

if (!secretKey) {
  console.error('NUXT_STRIPE_SECRET_KEY est absente. Renseignez-la dans app/.env avant de relancer.')
  process.exit(1)
}

// Garde-fou : ce script écrit chez le prestataire. En mode réel, il toucherait
// à la grille facturée à de vrais clients. Le mode test se reconnaît au préfixe
// de la clé, et le forçage est explicite plutôt que silencieux.
if (!secretKey.startsWith('sk_test_') && process.env.STRIPE_ALLOW_LIVE !== 'oui') {
  console.error('Cette clé n\'est pas une clé de test. Relancez avec STRIPE_ALLOW_LIVE=oui si c\'est voulu.')
  process.exit(1)
}

const stripe = new Stripe(secretKey, { apiVersion: '2026-07-29.dahlia' })

/** Identifiant de produit stable, choisi par nous : `retrieve` devient possible. */
function productId(plan: string) {
  return `zentime_${plan.toLowerCase()}`
}

async function syncPlan(offer: typeof PLANS[number]) {
  const id = productId(offer.id)
  const lookupKey = stripeLookupKey(offer.id)
  const amount = priceInCents(offer.pricePerSeat)

  // L'unité de facturation vient de la même source que la page publique : ce
  // qu'un acheteur lit sur sa facture dit mot pour mot ce qu'il a lu avant de
  // payer.
  const description = `${offer.audience} Facturation ${BILLING_UNIT}.`

  // Le produit porte un identifiant que nous choisissons, ce qui rend la
  // synchronisation triviale : soit il existe, soit on le crée. Sans cela il
  // faudrait le retrouver par son nom — et un nom se retouche.
  const product = await stripe.products.retrieve(id).catch(() => null)

  if (product) {
    await stripe.products.update(id, { name: `ZenTime ${offer.name}`, description })
    console.log(`  produit ${id} : à jour`)
  }
  else {
    await stripe.products.create({ id, name: `ZenTime ${offer.name}`, description })
    console.log(`  produit ${id} : créé`)
  }

  const { data: existing } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  const current = existing[0]

  if (current
    && current.unit_amount === amount
    && current.currency === 'eur'
    && current.recurring?.interval === 'month') {
    console.log(`  tarif ${lookupKey} : inchangé (${amount / 100} € HT)`)
    return
  }

  const price = await stripe.prices.create({
    product: id,
    currency: 'eur',
    unit_amount: amount,
    recurring: { interval: 'month' },
    // Facturation à la quantité : un poste, un exemplaire du tarif.
    lookup_key: lookupKey,
    // Reprend la clé à l'ancien tarif. Sans ce transfert, la création échoue :
    // une clé de recherche ne désigne qu'un tarif actif à la fois.
    transfer_lookup_key: true,
    metadata: { plan: offer.id },
  })

  console.log(`  tarif ${lookupKey} : ${current ? 'remplacé' : 'créé'} → ${price.id} (${amount / 100} € HT)`)

  // L'ancien tarif est désactivé pour qu'il ne puisse plus être vendu. Il n'est
  // pas supprimé : les abonnements en cours s'y adossent, et les supprimer
  // reviendrait à casser leur facturation.
  if (current) {
    await stripe.prices.update(current.id, { active: false })
    console.log(`  tarif ${current.id} : désactivé (abonnements en cours conservés)`)
  }
}

/**
 * Configuration du portail client, sans laquelle `/api/billing/portal` échoue.
 *
 * Elle est créée ici plutôt que cochée dans une console : c'est le même
 * raisonnement que pour les tarifs. Une installation qui suppose « et puis
 * quelqu'un active le portail quelque part » est une installation qui rate au
 * premier environnement neuf, et l'erreur arrive alors sous la forme la plus
 * obscure possible — un refus du prestataire au moment où un client veut
 * résilier.
 */
async function syncPortal() {
  const { data: configurations } = await stripe.billingPortal.configurations.list({ limit: 1, active: true })

  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    customer_update: { enabled: true, allowed_updates: ['address', 'tax_id', 'email'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    // Résiliation à l'échéance et non immédiate : la période déjà payée reste
    // due, et l'entreprise garde ses droits jusqu'à son terme.
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
  }

  if (configurations[0]) {
    await stripe.billingPortal.configurations.update(configurations[0].id, { features })
    console.log(`  portail client : à jour (${configurations[0].id})`)
    return
  }

  const created = await stripe.billingPortal.configurations.create({
    features,
    business_profile: { privacy_policy_url: 'https://zentime.fr/confidentialite' },
  })

  console.log(`  portail client : créé (${created.id})`)
}

console.log(`Synchronisation de la grille ZenTime (${PLANS.length} formules)`)

for (const offer of PLANS) {
  console.log(`\n${offer.name} — ${offer.pricePerSeat} € HT`)
  await syncPlan(offer)
}

console.log('')
await syncPortal()
console.log('\nTerminé.')
