import fp from "fastify-plugin";
import { PrismaClient } from "@growth/db";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClient;
  }
}

export default fp(async function databasePlugin(fastify: FastifyInstance) {
  const db = new PrismaClient({
    log: fastify.log.level === "debug" ? ["query", "warn", "error"] : ["warn", "error"],
  });

  await db.$connect();
  fastify.decorate("db", db);

  fastify.addHook("onClose", async () => {
    await db.$disconnect();
  });
});
