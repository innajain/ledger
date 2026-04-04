import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

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
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
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

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
