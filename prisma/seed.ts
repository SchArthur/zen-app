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

const exercises = [
  { slug: 'nuque-douce', title: 'Étirement de la nuque', type: ExerciseType.STRETCHING, durationMin: 2, description: 'Incliner lentement la tête vers chaque épaule, sans forcer, en gardant le dos droit.' },
  { slug: 'epaules-roulees', title: 'Rotation des épaules', type: ExerciseType.STRETCHING, durationMin: 2, description: 'Rouler les épaules vers l\'arrière puis vers l\'avant pour relâcher le haut du dos.' },
  { slug: 'dos-chat-vache', title: 'Dos rond, dos creux', type: ExerciseType.STRETCHING, durationMin: 3, description: 'Assis au bord de la chaise, alterner arrondi et cambrure du dos au rythme du souffle.' },
  { slug: 'poignets-ecran', title: 'Détente des poignets', type: ExerciseType.STRETCHING, durationMin: 2, description: 'Étirer les poignets et les doigts pour soulager la tension liée au clavier et à la souris.' },
  { slug: 'jambes-debout', title: 'Étirement des jambes', type: ExerciseType.STRETCHING, durationMin: 4, description: 'Se lever, étirer mollets et ischio-jambiers en gardant un appui stable.' },

  { slug: 'coherence-cardiaque', title: 'Cohérence cardiaque 5-5', type: ExerciseType.BREATHING, durationMin: 5, description: 'Inspirer 5 secondes, expirer 5 secondes, à un rythme régulier.' },
  { slug: 'respiration-carree', title: 'Respiration carrée', type: ExerciseType.BREATHING, durationMin: 4, description: 'Inspirer, retenir, expirer, retenir : quatre temps égaux de 4 secondes.' },
  { slug: 'souffle-4-7-8', title: 'Respiration 4-7-8', type: ExerciseType.BREATHING, durationMin: 3, description: 'Inspirer 4 secondes, retenir 7 secondes, expirer 8 secondes.' },
  { slug: 'respiration-abdominale', title: 'Respiration abdominale', type: ExerciseType.BREATHING, durationMin: 5, description: 'Une main sur le ventre, respirer en gonflant l\'abdomen plutôt que la poitrine.' },
  { slug: 'soupir-physiologique', title: 'Soupir physiologique', type: ExerciseType.BREATHING, durationMin: 2, description: 'Deux inspirations successives par le nez, puis une longue expiration par la bouche.' },

  { slug: 'scan-corporel', title: 'Scan corporel express', type: ExerciseType.MEDITATION, durationMin: 6, description: 'Parcourir mentalement le corps des pieds à la tête en relâchant chaque zone.' },
  { slug: 'ancrage-3-minutes', title: 'Ancrage en 3 minutes', type: ExerciseType.MEDITATION, durationMin: 3, description: 'Observer sa respiration, ses sensations et son environnement, une minute chacun.' },
  { slug: 'pause-sensorielle', title: 'Pause des 5 sens', type: ExerciseType.MEDITATION, durationMin: 4, description: 'Nommer cinq choses vues, quatre entendues, trois touchées, deux senties, une goûtée.' },
  { slug: 'meditation-marchee', title: 'Méditation marchée', type: ExerciseType.MEDITATION, durationMin: 8, description: 'Marcher lentement en portant l\'attention sur chaque appui du pied au sol.' },
  { slug: 'fin-de-journee', title: 'Déposer la journée', type: ExerciseType.MEDITATION, durationMin: 6, description: 'Revenir sur la journée sans la juger, puis relâcher ce qui peut attendre demain.' },
]

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
            favoriteTypes: [pick(Object.values(ExerciseType))],
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

  for (const user of users) {
    for (const day of days) {
      for (let i = 0; i < between(1, 3); i++) {
        const startedAt = at(day, between(9, 16), between(0, 59))
        const durationSec = between(5, 20) * 60
        breaks.push({
          userId: user.id,
          startedAt,
          endedAt: new Date(startedAt.getTime() + durationSec * 1000),
          durationSec,
        })
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
        logs.push({
          userId: user.id,
          exerciseId: pick(createdExercises).id,
          completedAt: at(day, between(9, 17), between(0, 59)),
        })
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
