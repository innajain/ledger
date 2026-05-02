import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'
import { env, isDev, isProd } from './env'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

// Prevent multiple instances in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const globalForPrismaConnection = globalThis as unknown as {
  prismaConnectionLogged: boolean | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: isDev() ? ['error', 'warn'] : ['error'],
  })

if (!globalForPrismaConnection.prismaConnectionLogged) {
  globalForPrismaConnection.prismaConnectionLogged = true
  prisma
    .$connect()
    .then(() => {
      console.log('Database connected')
    })
    .catch(error => {
      globalForPrismaConnection.prismaConnectionLogged = false
      console.error('Database connection failed', error)
    })
}

if (!isProd()) globalForPrisma.prisma = prisma
