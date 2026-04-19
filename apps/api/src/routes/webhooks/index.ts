import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getEnv } from "@growth/config";
import { IdempotencyStore } from "../../services/idempotency.js";
import { DuplicateEventError } from "../../lib/errors.js";
import { verifyMetaSignature, extractMetaIdempotencyKey } from "./meta.js";
import { verifyGhlSignature, extractGhlIdempotencyKey } from "./ghl.js";
import type { WebhookSource } from "@growth/types";

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  const env = getEnv();

  // Capture raw body before JSON parsing (required for HMAC verification)
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      try {
        const json = JSON.parse((body as Buffer).toString("utf8")) as unknown;
        // Attach raw buffer to request for signature verification
        (req as FastifyRequest & { rawBody: Buffer }).rawBody = body as Buffer;
        done(null, json);
      } catch (err) {
        done(err as Error);
      }
    }
  );

  fastify.post(
    "/webhooks/ingest",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;
      const headers = req.headers;
      const source = headers["x-webhook-source"] as WebhookSource | undefined;

      if (!source || !["meta", "ghl", "instagram"].includes(source)) {
        return reply.status(400).send({ error: "Missing or invalid x-webhook-source header" });
      }

      // Signature verification
      try {
        if (source === "meta" || source === "instagram") {
          const sig = headers["x-hub-signature-256"] as string | undefined;
          if (!sig) throw new Error("Missing x-hub-signature-256");
          if (rawBody) verifyMetaSignature(rawBody, sig, env.META_APP_SECRET);
        } else if (source === "ghl") {
          const sig = headers["x-ghl-signature"] as string | undefined;
          if (!sig) throw new Error("Missing x-ghl-signature");
          verifyGhlSignature(sig, env.GHL_WEBHOOK_SECRET);
        }
      } catch (err) {
        fastify.log.warn({ err, source }, "Webhook signature verification failed");
        return reply.status(401).send({ error: "Signature verification failed" });
      }

      const body = req.body as Record<string, unknown>;

      // Extract idempotency key
      let idempotencyKey: string;
      if (source === "meta" || source === "instagram") {
        const sig = headers["x-hub-signature-256"] as string;
        idempotencyKey = extractMetaIdempotencyKey(sig, body);
      } else {
        idempotencyKey = extractGhlIdempotencyKey(body);
      }

      // Fast-path idempotency check (Redis SETNX)
      const idempotency = new IdempotencyStore(fastify.redis);
      const acquired = await idempotency.acquireLock(source, idempotencyKey);
      if (!acquired) {
        fastify.log.debug({ source, idempotencyKey }, "Duplicate webhook — dropping");
        return reply.status(200).send({ received: true, duplicate: true });
      }

      // Persist raw ingestion record
      const contentHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(body))
        .digest("hex");

      const ingestion = await fastify.db.webhookIngestion.create({
        data: {
          source,
          idempotencyKey,
          rawHeaders: headers as Record<string, unknown>,
          rawBody: body,
          contentHash,
        },
      });

      // Enqueue for async processing
      await fastify.ingestionQueue.add(
        "process-webhook",
        { ingestionId: ingestion.id, source, idempotencyKey, payload: body },
        {
          jobId: ingestion.id,
          attempts: 5,
          backoff: { type: "exponential", delay: 2_000 },
        }
      );

      fastify.log.info({ ingestionId: ingestion.id, source }, "Webhook ingested");

      return reply.status(200).send({ received: true, ingestionId: ingestion.id });
    }
  );

  // Meta webhook verification endpoint (GET)
  fastify.get("/webhooks/ingest", async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string>;
    if (
      query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] === getEnv().META_WEBHOOK_VERIFY_TOKEN
    ) {
      return reply.status(200).send(query["hub.challenge"]);
    }
    return reply.status(403).send({ error: "Forbidden" });
  });
}
