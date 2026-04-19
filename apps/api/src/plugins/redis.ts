import fp from "fastify-plugin";
import IORedis from "ioredis";
import type { FastifyInstance } from "fastify";
import { getEnv } from "@growth/config";

declare module "fastify" {
  interface FastifyInstance {
    redis: IORedis.Redis;
  }
}

export default fp(async function redisPlugin(fastify: FastifyInstance) {
  const env = getEnv();
  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

  redis.on("error", (err) => {
    fastify.log.error({ err }, "Redis error");
  });

  fastify.decorate("redis", redis);

  fastify.addHook("onClose", async () => {
    await redis.quit();
  });
});
