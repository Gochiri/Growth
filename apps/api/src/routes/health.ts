import type { FastifyInstance } from "fastify";

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/health", async (_req, reply) => {
    try {
      await fastify.db.$queryRaw`SELECT 1`;
      await fastify.redis.ping();
      return reply.send({ status: "ok", timestamp: new Date().toISOString() });
    } catch (err) {
      fastify.log.error({ err }, "Health check failed");
      return reply.status(503).send({ status: "error", timestamp: new Date().toISOString() });
    }
  });
}
