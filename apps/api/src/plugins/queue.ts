import fp from "fastify-plugin";
import { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";

export const INGESTION_QUEUE = "webhook-ingestion";
export const ANALYST_QUEUE = "analyst";

declare module "fastify" {
  interface FastifyInstance {
    ingestionQueue: Queue;
    analystQueue: Queue;
  }
}

export default fp(async function queuePlugin(fastify: FastifyInstance) {
  const connection = fastify.redis;

  const ingestionQueue = new Queue(INGESTION_QUEUE, { connection });
  const analystQueue = new Queue(ANALYST_QUEUE, { connection });

  fastify.decorate("ingestionQueue", ingestionQueue);
  fastify.decorate("analystQueue", analystQueue);

  fastify.addHook("onClose", async () => {
    await ingestionQueue.close();
    await analystQueue.close();
  });
});
