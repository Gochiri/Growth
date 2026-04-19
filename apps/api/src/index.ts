import Fastify from "fastify";
import { getEnv } from "@growth/config";
import { logger } from "./lib/logger.js";
import redisPlugin from "./plugins/redis.js";
import databasePlugin from "./plugins/database.js";
import queuePlugin from "./plugins/queue.js";
import { webhookRoutes } from "./routes/webhooks/index.js";
import { reportRoutes } from "./routes/reports/index.js";
import { contactRoutes } from "./routes/contacts/index.js";
import { healthRoutes } from "./routes/health.js";
import { startIngestionWorker } from "./workers/ingestion.worker.js";
import { startAnalystWorker, scheduleWeeklyDigest } from "./workers/analyst.worker.js";

async function main(): Promise<void> {
  const env = getEnv();

  const fastify = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      transport:
        env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // Plugins (order matters: redis → db → queue)
  await fastify.register(redisPlugin);
  await fastify.register(databasePlugin);
  await fastify.register(queuePlugin);

  // Routes
  await fastify.register(healthRoutes);
  await fastify.register(webhookRoutes);
  await fastify.register(reportRoutes);
  await fastify.register(contactRoutes);

  // Start workers
  const ingestionWorker = startIngestionWorker();
  const analystWorker = startAnalystWorker();

  // Schedule recurring analyst jobs
  await scheduleWeeklyDigest(fastify.analystQueue);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    await fastify.close();
    await ingestionWorker.close();
    await analystWorker.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await fastify.listen({ port: env.API_PORT, host: env.API_HOST });
  logger.info({ port: env.API_PORT }, "API server started");
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
