import { PrismaClient } from "./generated/index.js";

export * from "./generated/index.js";

let prisma: PrismaClient;

export function getDb(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env["NODE_ENV"] === "development" ? ["query", "warn", "error"] : ["warn", "error"],
    });
  }
  return prisma;
}

export { PrismaClient };
