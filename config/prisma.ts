import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { loadServerEnv } from './env';
import { rootDir } from './rootpath';
import path from 'path';

type PrismaClientInstance = InstanceType<typeof PrismaClient>;

loadServerEnv();


const dbPath = path.resolve(rootDir, "database/index.db");
process.env.DATABASE_URL = `file:${dbPath}`;

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });


const globalForPrisma = globalThis as typeof globalThis & {
    prisma?: PrismaClientInstance;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
