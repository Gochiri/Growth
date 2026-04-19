import { Worker } from "bullmq";
import IORedis from "ioredis";
import { getDb } from "@growth/db";
import { getEnv } from "@growth/config";
import { normalizeMetaEvent } from "../services/meta/normalizer.js";
import { normalizeGhlEvent } from "../services/ghl/normalizer.js";
import { recomputeAttribution } from "../services/attribution.js";
import { logger } from "../lib/logger.js";
import { INGESTION_QUEUE } from "../plugins/queue.js";
import type { RawWebhookJob } from "@growth/types";

const CONVERSION_TRIGGERS = new Set(["deal_won", "appointment_completed"]);

async function processWebhook(job: RawWebhookJob): Promise<void> {
  const db = getDb();
  const { ingestionId, source, payload } = job;

  let producedEventType: string | null = null;
  let producedEventId: string | null = null;

  try {
    let normalized;

    if (source === "meta" || source === "instagram") {
      const metaPayload = payload as {
        entry?: Array<{ id: string; changes?: Array<{ value: unknown }> }>;
      };
      const pixelId = metaPayload.entry?.[0]?.id ?? "unknown";
      const value = metaPayload.entry?.[0]?.changes?.[0]?.value ?? payload;
      normalized = normalizeMetaEvent(
        value as Parameters<typeof normalizeMetaEvent>[0],
        pixelId
      );
    } else {
      normalized = normalizeGhlEvent(
        payload as Parameters<typeof normalizeGhlEvent>[0]
      );
    }

    // Resolve or create contact
    const contact = await resolveContact(db, normalized.contactIdentifiers);

    if (source === "meta" || source === "instagram") {
      // Resolve or create campaign
      const campaign = normalized.campaignIdentifiers.metaCampaignId
        ? await db.campaign.upsert({
            where: { metaCampaignId: normalized.campaignIdentifiers.metaCampaignId },
            create: {
              source: "meta",
              metaCampaignId: normalized.campaignIdentifiers.metaCampaignId,
              metaAdsetId: normalized.campaignIdentifiers.metaAdsetId,
              metaAdId: normalized.campaignIdentifiers.metaAdId,
              name: `Campaign ${normalized.campaignIdentifiers.metaCampaignId}`,
            },
            update: {},
          })
        : null;

      const adEvent = await db.adEvent.create({
        data: {
          ingestionId,
          campaignId: campaign?.id ?? null,
          contactId: contact?.id ?? null,
          metaEventId: normalized.externalId,
          metaPixelId: normalized.campaignIdentifiers.metaPixelId ?? "unknown",
          metaCampaignId: normalized.campaignIdentifiers.metaCampaignId,
          metaAdsetId: normalized.campaignIdentifiers.metaAdsetId,
          metaAdId: normalized.campaignIdentifiers.metaAdId,
          eventType: normalized.eventType as "impression",
          eventTime: normalized.eventTime,
          conversionValueCents: normalized.metrics.conversionValueCents ?? 0,
          userEmailHash: normalized.userEmailHash,
          userPhoneHash: normalized.userPhoneHash,
          userIp: normalized.userIp,
          userAgent: normalized.userAgent,
          browserId: normalized.browserId,
          clickId: normalized.clickId,
          eventSourceUrl: normalized.eventSourceUrl,
          rawData: normalized.rawData,
        },
      });

      producedEventType = "ad_event";
      producedEventId = adEvent.id;
    } else {
      // GHL CRM event
      const campaign = normalized.campaignIdentifiers.ghlPipelineId
        ? await db.campaign.upsert({
            where: { ghlPipelineId: normalized.campaignIdentifiers.ghlPipelineId },
            create: {
              source: "ghl",
              ghlPipelineId: normalized.campaignIdentifiers.ghlPipelineId,
              name: `Pipeline ${normalized.campaignIdentifiers.ghlPipelineId}`,
            },
            update: {},
          })
        : null;

      const crmEvent = await db.crmEvent.create({
        data: {
          ingestionId,
          campaignId: campaign?.id ?? null,
          contactId: contact?.id ?? null,
          ghlEventId: normalized.externalId,
          ghlLocationId: normalized.ghlLocationId ?? "unknown",
          ghlContactId: normalized.contactIdentifiers.externalId,
          ghlPipelineId: normalized.campaignIdentifiers.ghlPipelineId,
          ghlStageId: normalized.campaignIdentifiers.ghlStageId,
          ghlStageName: normalized.campaignIdentifiers.ghlStageName,
          ghlOpportunityId: normalized.ghlOpportunityId,
          ghlAppointmentId: normalized.ghlAppointmentId,
          eventType: normalized.eventType as "contact_created",
          eventTime: normalized.eventTime,
          dealValueCents: normalized.metrics.dealValueCents ?? 0,
          previousStageName: normalized.previousStageName,
          daysInPrevStage: normalized.daysInPreviousStage,
          contactEmail: normalized.contactIdentifiers.email,
          contactPhone: normalized.contactIdentifiers.phone,
          rawData: normalized.rawData,
        },
      });

      producedEventType = "crm_event";
      producedEventId = crmEvent.id;

      // Trigger attribution recompute on conversion events
      if (CONVERSION_TRIGGERS.has(normalized.eventType) && contact) {
        await recomputeAttribution(db, contact.id, crmEvent.id);
      }

      // Update contact lifecycle stage
      if (contact && normalized.campaignIdentifiers.ghlStageName) {
        await db.contact.update({
          where: { id: contact.id },
          data: {
            lifecycleStage: normalized.campaignIdentifiers.ghlStageName,
            isCustomer: normalized.eventType === "deal_won" ? true : undefined,
          },
        });
      }
    }

    // Mark ingestion as processed
    await db.webhookIngestion.update({
      where: { id: ingestionId },
      data: {
        processedAt: new Date(),
        producedEventType,
        producedEventId,
      },
    });

    logger.info({ ingestionId, producedEventType, producedEventId }, "Webhook processed");
  } catch (err) {
    await db.webhookIngestion.update({
      where: { id: ingestionId },
      data: { processingError: String(err) },
    });
    throw err;
  }
}

async function resolveContact(
  db: ReturnType<typeof getDb>,
  identifiers: { email?: string; phone?: string; externalId?: string; metaUserHash?: string }
) {
  if (identifiers.email) {
    const existing = await db.contact.findFirst({
      where: { email: { equals: identifiers.email, mode: "insensitive" }, deletedAt: null },
    });
    if (existing) return existing;
  }

  if (identifiers.phone) {
    const existing = await db.contact.findFirst({
      where: { phone: identifiers.phone, deletedAt: null },
    });
    if (existing) return existing;
  }

  if (identifiers.externalId) {
    const existing = await db.contact.findFirst({
      where: { ghlContactId: identifiers.externalId },
    });
    if (existing) return existing;
  }

  if (!identifiers.email && !identifiers.phone && !identifiers.externalId) {
    return null;
  }

  return db.contact.create({
    data: {
      email: identifiers.email,
      phone: identifiers.phone,
      ghlContactId: identifiers.externalId,
      metaUserHash: identifiers.metaUserHash,
    },
  });
}

// Worker entry point
export function startIngestionWorker(): Worker {
  const env = getEnv();
  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker(
    INGESTION_QUEUE,
    async (job) => processWebhook(job.data as RawWebhookJob),
    {
      connection: redis,
      concurrency: env.INGESTION_WORKER_CONCURRENCY,
    }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Ingestion job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Ingestion job failed");
  });

  return worker;
}
