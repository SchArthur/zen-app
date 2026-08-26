import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../lib/generated/prisma/client.js'
import { Role } from '../lib/generated/prisma/enums.js'

/**
 * Ouverture d'un compte entreprise, et désignation de son responsable RH.
 *
 * ```bash
 * npm run company -- ouvrir --nom "Enzavia" --domaine enzavia.fr
 * npm run company -- role --email schmitt.arthur.pro@enzavia.fr --role HR
 * ```
 *
 * **Pourquoi un outil d'exploitation et non un écran.**
 *
 * L'inscription rattache une personne à son entreprise par le **domaine de son
 * adresse professionnelle** (RG4) : l'employeur ne transmet aucune liste
 * nominative de salariés, et c'est la personne qui s'inscrit. Cette règle est
 * une mesure de minimisation revendiquée (`normes-et-conformite.md` §3.3), et
 * c'est elle qui rend le consentement valide — mais elle a une conséquence que
 * le dossier n'avait pas écrite : **rien ne crée jamais d'entreprise**. Un
 * prospect ne pouvait donc pas devenir client, et personne ne pouvait devenir le
 * responsable RH qui souscrit.
 *
 * La réponse n'est pas d'ouvrir l'auto-inscription. Laisser le premier arrivant
 * sur un domaine inconnu créer l'entreprise **et** s'en désigner responsable
 * reviendrait à lui offrir la vue consolidée de tous ceux qui s'inscriront
 * ensuite, et ferait de `gmail.com` une entreprise cliente. La réponse est
 * qu'ouvrir un compte entreprise est un **acte commercial de l'éditeur**, pas
 * une fonction du logiciel — ce que `cas-utilisation.md` §2.5 dit déjà du
 * donneur d'ordre, qui « intervient dans la décision d'achat, non dans le
 * logiciel ».
 *
 * **Ce que le script ne fait pas, et c'est le point important : il ne crée aucun
 * compte.** Il ouvre l'entreprise ; la personne s'inscrit ensuite elle-même par
 * le formulaire, avec son double opt-in, et c'est seulement une fois son adresse
 * confirmée qu'on peut la désigner responsable. Créer le compte à sa place
 * défairait la propriété que tout le produit défend — l'inscription est
 * volontaire et personnelle.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

/**
 * Domaines de messagerie grand public, refusés comme domaine d'entreprise.
 *
 * Sur RG4, le domaine **est** l'entreprise : ouvrir `gmail.com` ferait de
 * chaque titulaire d'une adresse Gmail un collègue de tous les autres, et le
 * seuil d'anonymat de cinq déclarants protégerait alors des inconnus les uns des
 * autres — c'est-à-dire personne. La liste est courte et ne prétend pas être
 * exhaustive : elle attrape la faute d'inattention, pas l'obstination.
 */
const PUBLIC_DOMAINS = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com',
  'hotmail.fr', 'live.fr', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.fr',
  'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'bbox.fr',
  'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'gmx.fr', 'gmx.com',
]

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`)

  return index === -1 ? undefined : process.argv[index + 1]
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/** Domaine normalisé : sans arobase, sans protocole, sans casse ni espaces. */
function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^@/, '').replace(/\/.*$/, '')
}

async function ouvrir() {
  const name = arg('nom')
  const rawDomain = arg('domaine')

  if (!name || !rawDomain) {
    fail('Usage : npm run company -- ouvrir --nom "Enzavia" --domaine enzavia.fr')
  }

  const emailDomain = normalizeDomain(rawDomain)

  // Un point et deux libellés au minimum. Le contrôle est sommaire à dessein :
  // il attrape « enzavia » ou « @enzavia.fr » saisis à la va-vite, et laisse
  // passer tout ce qui ressemble à un domaine — vérifier qu'il existe vraiment
  // demanderait une résolution DNS, donc du réseau, dans un outil qui doit
  // pouvoir tourner sur une base de recette hors ligne.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(emailDomain)) {
    fail(`« ${emailDomain} » ne ressemble pas à un domaine.`)
  }

  if (PUBLIC_DOMAINS.includes(emailDomain)) {
    fail(`« ${emailDomain} » est un domaine de messagerie grand public : il ne peut pas désigner une entreprise (voir RG4).`)
  }

  const existing = await prisma.company.findUnique({
    where: { emailDomain },
    select: { name: true },
  })

  if (existing) {
    fail(`Le domaine « ${emailDomain} » est déjà rattaché à « ${existing.name} ».`)
  }

  const company = await prisma.company.create({ data: { name, emailDomain } })

  console.log(`Entreprise « ${company.name} » ouverte pour le domaine ${emailDomain}.`)
  console.log('')
  console.log('Suite, dans cet ordre :')
  console.log(`  1. la personne s'inscrit elle-même sur /inscription avec son adresse @${emailDomain},`)
  console.log('  2. elle confirme son adresse par le lien reçu,')
  console.log(`  3. npm run company -- role --email <son adresse> --role HR`)
}

async function role() {
  const email = arg('email')?.trim().toLowerCase()
  const wanted = arg('role')?.trim().toUpperCase()

  if (!email || !wanted) {
    fail('Usage : npm run company -- role --email camille@enzavia.fr --role HR')
  }

  if (!Object.values(Role).includes(wanted as Role)) {
    fail(`Rôle inconnu : « ${wanted} ». Attendu : ${Object.values(Role).join(', ')}.`)
  }

  const account = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, emailVerifiedAt: true, company: { select: { name: true } } },
  })

  if (!account) fail(`Aucun compte pour ${email}. La personne doit d'abord s'inscrire elle-même.`)

  /**
   * Une adresse non confirmée ne se voit pas confier un rôle d'encadrement.
   *
   * Le double opt-in prouve que le titulaire de l'adresse est bien celui qui
   * s'est inscrit ; désigner responsable RH un compte qui n'a pas franchi cette
   * étape reviendrait à ouvrir la vue consolidée de l'entreprise à une adresse
   * que personne n'a vérifiée — et le rôle est justement ce qui la déverrouille.
   */
  if (!account.emailVerifiedAt) {
    fail(`${email} n'a pas encore confirmé son adresse. Le rôle ne s'attribue qu'à un compte confirmé.`)
  }

  if (account.role === wanted) {
    console.log(`${email} est déjà ${wanted} chez « ${account.company.name} ». Rien à faire.`)
    return
  }

  await prisma.user.update({ where: { id: account.id }, data: { role: wanted as Role } })

  console.log(`${email} passe de ${account.role} à ${wanted} chez « ${account.company.name} ».`)

  // Le rôle est recopié dans la session à la connexion (`session.ts`) : il ne
  // prend donc effet qu'à la prochaine. Le dire ici évite de chercher pourquoi
  // l'écran ne change pas.
  console.log('⚠️ Le rôle est repris dans la session à la connexion : la personne doit se reconnecter.')
}

const command = process.argv[2]

try {
  if (command === 'ouvrir') await ouvrir()
  else if (command === 'role') await role()
  else {
    fail([
      'Usage :',
      '  npm run company -- ouvrir --nom "Enzavia" --domaine enzavia.fr',
      '  npm run company -- role --email camille@enzavia.fr --role HR',
    ].join('\n'))
  }
}
finally {
  await prisma.$disconnect()
}
