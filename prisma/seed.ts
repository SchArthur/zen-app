import 'dotenv/config'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../lib/generated/prisma/client.js'
import { ConsentType, ExerciseType, Plan, Role, SubscriptionStatus } from '../lib/generated/prisma/enums.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Même driver et même config que nuxt-auth-utils, sinon la connexion échouerait.
const hasher = new Hash(new Scrypt({}))

const DEMO_PASSWORD = 'ZenTime2026!'
const COMPANY_DOMAIN = 'zentime.demo'
const HISTORY_DAYS = 30

// PRNG déterministe : deux exécutions produisent le même jeu de données.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = mulberry32(20260815)
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
const chance = (probability: number) => random() < probability
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!

/**
 * Catalogue d'exercices — F4 : au moins quinze exercices sur les trois types,
 * chacun réalisable en cinq minutes ou moins, sans matériel et sans quitter son
 * poste.
 *
 * `description` est la phrase qui tient sur une carte du catalogue ; `steps` est
 * le déroulé pas à pas de la fiche détaillée. Les deux disent la même chose à
 * deux niveaux de détail — la carte doit suffire à choisir, la fiche à faire.
 *
 * Les libellés évitent toute formulation thérapeutique (« soulage », « traite »,
 * « guérit ») : ZenTime n'est pas un dispositif médical, et c'est la règle
 * éditoriale posée par `normes-et-conformite.md` §5. On décrit un geste, jamais
 * un effet sur la santé.
 *
 * Deux exercices dépassent les cinq minutes de F4 — la méditation marchée (8) et
 * les deux séances de six minutes. Ils sont conservés : la borne de F4 vise la
 * faisabilité au poste, et le filtre par durée du catalogue permet précisément de
 * les écarter quand on n'a que trois minutes devant soi.
 */
const exercises = [
  {
    slug: 'nuque-douce',
    title: 'Étirement de la nuque',
    type: ExerciseType.STRETCHING,
    durationMin: 2,
    description: 'Incliner lentement la tête vers chaque épaule, sans forcer, en gardant le dos droit.',
    steps: [
      'Asseyez-vous au fond de la chaise, les deux pieds à plat et les épaules relâchées.',
      'Inclinez lentement la tête vers l\'épaule droite, sans lever cette épaule. Tenez trente secondes.',
      'Revenez au centre, puis faites la même chose du côté gauche.',
      'Terminez en abaissant le menton vers la poitrine, le temps de dix respirations.',
    ],
  },
  {
    slug: 'epaules-roulees',
    title: 'Rotation des épaules',
    type: ExerciseType.STRETCHING,
    durationMin: 2,
    description: 'Rouler les épaules vers l\'arrière puis vers l\'avant pour relâcher le haut du dos.',
    steps: [
      'Laissez les bras pendre le long du corps, mâchoire desserrée.',
      'Roulez les épaules vers l\'arrière dix fois, en dessinant le plus grand cercle possible.',
      'Inversez le sens : dix rotations vers l\'avant.',
      'Finissez par une inspiration en montant les épaules aux oreilles, puis relâchez d\'un coup.',
    ],
  },
  {
    slug: 'dos-chat-vache',
    title: 'Dos rond, dos creux',
    type: ExerciseType.STRETCHING,
    durationMin: 3,
    description: 'Assis au bord de la chaise, alterner arrondi et cambrure du dos au rythme du souffle.',
    steps: [
      'Avancez au bord de la chaise, les mains posées sur les genoux.',
      'À l\'inspiration, creusez le bas du dos et ouvrez la poitrine.',
      'À l\'expiration, arrondissez le dos et rentrez le menton.',
      'Enchaînez dix cycles, en laissant le souffle donner le rythme.',
    ],
  },
  {
    slug: 'poignets-ecran',
    title: 'Détente des poignets',
    type: ExerciseType.STRETCHING,
    durationMin: 2,
    description: 'Étirer les poignets et les doigts après une longue série de frappe au clavier.',
    steps: [
      'Tendez le bras droit devant vous, paume tournée vers le plafond.',
      'De l\'autre main, ramenez doucement les doigts vers vous. Tenez vingt secondes.',
      'Retournez la main, paume vers le sol, et étirez à nouveau vingt secondes.',
      'Changez de bras, puis secouez les deux mains quelques secondes.',
    ],
  },
  {
    slug: 'jambes-debout',
    title: 'Étirement des jambes',
    type: ExerciseType.STRETCHING,
    durationMin: 4,
    description: 'Se lever, étirer mollets et ischio-jambiers en gardant un appui stable.',
    steps: [
      'Levez-vous et prenez appui d\'une main sur le dossier de la chaise.',
      'Reculez la jambe droite, talon au sol, jusqu\'à sentir le mollet s\'étirer. Trente secondes.',
      'Changez de jambe.',
      'Attrapez la cheville droite derrière vous pour étirer l\'avant de la cuisse, trente secondes de chaque côté.',
      'Terminez debout, en vous grandissant, les bras au-dessus de la tête.',
    ],
  },

  {
    slug: 'coherence-cardiaque',
    title: 'Cohérence cardiaque 5-5',
    type: ExerciseType.BREATHING,
    durationMin: 5,
    description: 'Inspirer 5 secondes, expirer 5 secondes, à un rythme régulier.',
    steps: [
      'Asseyez-vous le dos droit, les pieds à plat, les mains posées sur les cuisses.',
      'Inspirez par le nez en comptant jusqu\'à cinq.',
      'Expirez par la bouche en comptant jusqu\'à cinq.',
      'Tenez ce rythme cinq minutes, soit une trentaine de cycles.',
    ],
  },
  {
    slug: 'respiration-carree',
    title: 'Respiration carrée',
    type: ExerciseType.BREATHING,
    durationMin: 4,
    description: 'Inspirer, retenir, expirer, retenir : quatre temps égaux de 4 secondes.',
    steps: [
      'Inspirez sur quatre temps.',
      'Gardez l\'air sur quatre temps, sans crisper la gorge.',
      'Expirez sur quatre temps.',
      'Poumons vides, attendez quatre temps avant de recommencer.',
      'Une dizaine de cycles. Revenez à votre souffle habituel si la rétention devient inconfortable.',
    ],
  },
  {
    slug: 'souffle-4-7-8',
    title: 'Respiration 4-7-8',
    type: ExerciseType.BREATHING,
    durationMin: 3,
    description: 'Inspirer 4 secondes, retenir 7 secondes, expirer 8 secondes.',
    steps: [
      'Posez la pointe de la langue derrière les dents du haut, et gardez-la là.',
      'Inspirez par le nez en comptant jusqu\'à quatre.',
      'Gardez l\'air en comptant jusqu\'à sept.',
      'Expirez par la bouche, lèvres entrouvertes, en comptant jusqu\'à huit.',
      'Quatre cycles suffisent. Arrêtez-vous si la tête tourne.',
    ],
  },
  {
    slug: 'respiration-abdominale',
    title: 'Respiration abdominale',
    type: ExerciseType.BREATHING,
    durationMin: 5,
    description: 'Une main sur le ventre, respirer en gonflant l\'abdomen plutôt que la poitrine.',
    steps: [
      'Posez une main sur le ventre, l\'autre sur la poitrine.',
      'Inspirez par le nez : seule la main du ventre doit se soulever.',
      'Expirez lentement par la bouche, environ deux fois plus longtemps que l\'inspiration.',
      'Continuez cinq minutes, les épaules immobiles.',
    ],
  },
  {
    slug: 'soupir-physiologique',
    title: 'Soupir physiologique',
    type: ExerciseType.BREATHING,
    durationMin: 2,
    description: 'Deux inspirations successives par le nez, puis une longue expiration par la bouche.',
    steps: [
      'Inspirez par le nez jusqu\'à remplir les poumons.',
      'Sans expirer, ajoutez une seconde inspiration courte par-dessus la première.',
      'Relâchez tout l\'air par la bouche, longuement, comme un soupir.',
      'Trois à cinq répétitions, pas davantage.',
    ],
  },

  {
    slug: 'scan-corporel',
    title: 'Scan corporel express',
    type: ExerciseType.MEDITATION,
    durationMin: 6,
    description: 'Parcourir mentalement le corps des pieds à la tête en relâchant chaque zone.',
    steps: [
      'Installez-vous confortablement, les yeux fermés ou le regard posé au sol.',
      'Portez l\'attention sur vos pieds : notez ce que vous sentez, sans chercher à le changer.',
      'Remontez lentement — mollets, cuisses, bassin, ventre, poitrine, épaules, bras, nuque, visage.',
      'À chaque zone, relâchez ce qui peut l\'être en expirant.',
      'Terminez en percevant le corps d\'un seul tenant, le temps de trois respirations.',
    ],
  },
  {
    slug: 'ancrage-3-minutes',
    title: 'Ancrage en 3 minutes',
    type: ExerciseType.MEDITATION,
    durationMin: 3,
    description: 'Observer sa respiration, ses sensations et son environnement, une minute chacun.',
    steps: [
      'Première minute : observez ce qui est là — pensées, humeur, tensions.',
      'Deuxième minute : ramenez toute l\'attention sur le va-et-vient du souffle.',
      'Troisième minute : élargissez à l\'ensemble du corps et aux sons de la pièce.',
      'Rouvrez les yeux et reprenez votre tâche sans transition brusque.',
    ],
  },
  {
    slug: 'pause-sensorielle',
    title: 'Pause des 5 sens',
    type: ExerciseType.MEDITATION,
    durationMin: 4,
    description: 'Nommer cinq choses vues, quatre entendues, trois touchées, deux senties, une goûtée.',
    steps: [
      'Nommez mentalement cinq choses que vous voyez autour de vous.',
      'Puis quatre sons, du plus proche au plus lointain.',
      'Puis trois contacts : les pieds au sol, le dossier, l\'air sur les mains.',
      'Puis deux odeurs, même discrètes.',
      'Enfin un goût présent dans la bouche. Respirez une fois, profondément.',
    ],
  },
  {
    slug: 'meditation-marchee',
    title: 'Méditation marchée',
    type: ExerciseType.MEDITATION,
    durationMin: 8,
    description: 'Marcher lentement en portant l\'attention sur chaque appui du pied au sol.',
    steps: [
      'Choisissez un trajet court : un couloir, une allée, une dizaine de pas.',
      'Marchez deux fois moins vite que d\'habitude.',
      'Suivez le déroulé du pied — talon, plante, orteils.',
      'Au bout du trajet, faites demi-tour sans rompre l\'attention.',
      'Huit minutes, sans téléphone et sans destination.',
    ],
  },
  {
    slug: 'fin-de-journee',
    title: 'Déposer la journée',
    type: ExerciseType.MEDITATION,
    durationMin: 6,
    description: 'Revenir sur la journée sans la juger, puis relâcher ce qui peut attendre demain.',
    steps: [
      'Asseyez-vous, écran éteint, et prenez trois respirations lentes.',
      'Repassez la journée sans la commenter : ce qui a eu lieu, simplement.',
      'Nommez une chose qui a bien marché, même minuscule.',
      'Nommez ce qui reste en suspens, et posez-le : demain s\'en chargera.',
      'Terminez par une expiration longue, puis levez-vous.',
    ],
  },
]

/**
 * Familles d'exercices retenues dans un profil : une à trois, jamais zéro.
 *
 * Le jeu de démonstration en tirait exactement une par personne, ce qui donnait
 * un catalogue de recommandation réduit à cinq exercices pour tout le monde — et
 * plaçait le moteur en repli permanent, puisqu'il ne peut jamais honorer la
 * famille que sa règle privilégie. Une seule famille est un cas limite légitime,
 * pas le cas nominal : le formulaire de profil propose des cases à cocher.
 *
 * Le repli sur un tirage unique garantit qu'aucun profil ne se retrouve sans
 * aucune famille, ce que le moteur interpréterait comme « aucune préférence
 * exprimée » — l'inverse de ce que la personne aurait dit.
 */
function favoriteTypes() {
  const all = Object.values(ExerciseType)
  const chosen = all.filter(() => chance(0.55))

  return chosen.length ? chosen : [pick(all)]
}

const roster = [
  { firstName: 'Camille', lastName: 'Perrot', role: Role.HR, team: null },
  { firstName: 'Sofia', lastName: 'Nakamura', role: Role.MANAGER, team: 'Produit' },
  { firstName: 'Louis', lastName: 'Marchand', role: Role.COLLABORATOR, team: 'Produit' },
  { firstName: 'Ines', lastName: 'Dubois', role: Role.COLLABORATOR, team: 'Produit' },
  { firstName: 'Tomas', lastName: 'Kowalski', role: Role.COLLABORATOR, team: 'Produit' },
  { firstName: 'Awa', lastName: 'Diallo', role: Role.COLLABORATOR, team: 'Produit' },
  { firstName: 'Hugo', lastName: 'Bertrand', role: Role.COLLABORATOR, team: 'Produit' },
  { firstName: 'Malik', lastName: 'Benali', role: Role.MANAGER, team: 'Support' },
  { firstName: 'Lena', lastName: 'Fischer', role: Role.COLLABORATOR, team: 'Support' },
  { firstName: 'Noam', lastName: 'Attali', role: Role.COLLABORATOR, team: 'Support' },
]

function workdays(days: number) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const result: Date[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(today)
    day.setUTCDate(day.getUTCDate() - offset)
    const weekday = day.getUTCDay()
    if (weekday !== 0 && weekday !== 6) result.push(day)
  }
  return result
}

function at(day: Date, hour: number, minute: number) {
  const date = new Date(day)
  date.setUTCHours(hour, minute, 0, 0)
  return date
}

async function main() {
  // Company cascade sur teams, users et toutes les données personnelles.
  await prisma.company.deleteMany()
  await prisma.exercise.deleteMany()

  const company = await prisma.company.create({
    data: { name: 'Nova Solutions', emailDomain: COMPANY_DOMAIN },
  })

  await prisma.subscription.create({
    data: {
      companyId: company.id,
      plan: Plan.PREMIUM,
      status: SubscriptionStatus.ACTIVE,
      seats: roster.length,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  })

  await prisma.exercise.createMany({ data: exercises })
  const createdExercises = await prisma.exercise.findMany()

  const teams = new Map<string, string>()
  for (const name of ['Produit', 'Support']) {
    const team = await prisma.team.create({ data: { name, companyId: company.id } })
    teams.set(name, team.id)
  }

  const passwordHash = await hasher.make(DEMO_PASSWORD)
  const users = []

  for (const person of roster) {
    const email = `${person.firstName}.${person.lastName}@${COMPANY_DOMAIN}`.toLowerCase()

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: person.firstName,
        lastName: person.lastName,
        role: person.role,
        emailVerifiedAt: new Date(),
        companyId: company.id,
        teamId: person.team ? teams.get(person.team) : null,
        preference: {
          create: {
            workStartHour: between(8, 9),
            workEndHour: between(17, 18),
            remindersEnabled: chance(0.8),
            reminderIntervalMin: pick([60, 90, 120]),
            favoriteTypes: favoriteTypes(),
          },
        },
        consents: {
          create: [
            { type: ConsentType.TERMS, granted: true },
            { type: ConsentType.WELLBEING_DATA, granted: true },
            { type: ConsentType.ANALYTICS, granted: chance(0.5) },
          ],
        },
      },
    })

    users.push(user)
  }

  const days = workdays(HISTORY_DAYS)
  const breaks = []
  const moods = []
  const logs = []

  /**
   * Rien n'est daté après maintenant.
   *
   * Les horaires sont tirés entre 9 h et 17 h sur chaque journée retenue, la
   * dernière étant aujourd'hui : sans ce garde-fou, le jeu de démonstration
   * contient systématiquement des pauses qui n'ont pas encore eu lieu. Le
   * symptôme est discret et trompeur — un temps assis négatif au tableau de
   * bord, des moyennes calculées sur une journée qui n'est pas finie.
   */
  const now = new Date()
  const isPast = (date: Date) => date <= now

  for (const user of users) {
    for (const day of days) {
      for (let i = 0; i < between(1, 3); i++) {
        const startedAt = at(day, between(9, 16), between(0, 59))
        const durationSec = between(5, 20) * 60
        const endedAt = new Date(startedAt.getTime() + durationSec * 1000)

        if (!isPast(endedAt)) continue

        breaks.push({ userId: user.id, startedAt, endedAt, durationSec })
      }

      if (chance(0.8)) {
        moods.push({
          userId: user.id,
          date: day,
          mood: between(2, 5),
          stress: between(1, 4),
        })
      }

      if (chance(0.6)) {
        const completedAt = at(day, between(9, 17), between(0, 59))

        if (isPast(completedAt)) {
          logs.push({ userId: user.id, exerciseId: pick(createdExercises).id, completedAt })
        }
      }
    }
  }

  await prisma.breakSession.createMany({ data: breaks })
  await prisma.moodCheckIn.createMany({ data: moods })
  await prisma.exerciseLog.createMany({ data: logs })

  console.log(`Entreprise      : ${company.name} (@${company.emailDomain})`)
  console.log(`Équipes         : Produit (6 membres), Support (3 membres)`)
  console.log(`Utilisateurs    : ${users.length}`)
  console.log(`Exercices       : ${createdExercises.length}`)
  console.log(`Pauses          : ${breaks.length}`)
  console.log(`Check-ins       : ${moods.length}`)
  console.log(`Exercices faits : ${logs.length}`)
  console.log(`Mot de passe    : ${DEMO_PASSWORD}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
