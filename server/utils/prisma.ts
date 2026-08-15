import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../lib/generated/prisma/client.js'

// En dev, Nitro recharge les modules à chaque changement : sans ce cache,
// chaque rechargement ouvrirait un nouveau pool de connexions.
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient }

export const prisma
  = globalForPrisma.prisma
    ?? new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    })

if (import.meta.dev) globalForPrisma.prisma = prisma
