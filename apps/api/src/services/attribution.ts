import type { PrismaClient } from "@growth/db";
import { logger } from "../lib/logger.js";

export async function recomputeAttribution(
  db: PrismaClient,
  contactId: string,
  conversionCrmEventId: string
): Promise<void> {
  const conversionEvent = await db.crmEvent.findUnique({
    where: { id: conversionCrmEventId },
  });
  if (!conversionEvent) return;

  const conversionTime = conversionEvent.eventTime;
  const conversionValueCents = conversionEvent.dealValueCents;

  // Fetch all ad events for this contact before the conversion
  const adEvents = await db.adEvent.findMany({
    where: { contactId, eventTime: { lte: conversionTime } },
    orderBy: { eventTime: "asc" },
  });

  // Fetch all CRM events before conversion (excluding conversion itself)
  const crmEvents = await db.crmEvent.findMany({
    where: {
      contactId,
      eventTime: { lte: conversionTime },
      id: { not: conversionCrmEventId },
    },
    orderBy: { eventTime: "asc" },
  });

  const totalTouchpoints = adEvents.length + crmEvents.length;
  if (totalTouchpoints === 0) return;

  // Merge and sort all touchpoints
  const touchpoints = [
    ...adEvents.map((e) => ({
      id: e.id,
      type: "ad" as const,
      eventTime: e.eventTime,
      campaignId: e.campaignId,
    })),
    ...crmEvents.map((e) => ({
      id: e.id,
      type: "crm" as const,
      eventTime: e.eventTime,
      campaignId: e.campaignId,
    })),
  ].sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());

  const N = touchpoints.length;
  const conversionMs = conversionTime.getTime();

  // Delete existing touchpoints for this conversion
  await db.attributionTouchpoint.deleteMany({
    where: { contactId, conversionCrmEventId },
  });

  // Compute and insert new weights
  await db.attributionTouchpoint.createMany({
    data: touchpoints.map((tp, i) => {
      const seq = i + 1;
      const daysBeforeConversion = Math.floor(
        (conversionMs - tp.eventTime.getTime()) / 86_400_000
      );

      return {
        contactId,
        campaignId: tp.campaignId ?? null,
        adEventId: tp.type === "ad" ? tp.id : null,
        crmEventId: tp.type === "crm" ? tp.id : null,
        firstTouchWeight: seq === 1 ? 1 : 0,
        lastTouchWeight: seq === N ? 1 : 0,
        linearWeight: 1 / N,
        timeDecayWeight: computeTimeDecayWeight(daysBeforeConversion, touchpoints.length, i),
        positionWeight: computePositionWeight(seq, N),
        touchpointSequence: seq,
        totalTouchpoints: N,
        daysBeforeConversion,
        conversionCrmEventId,
        conversionType: conversionEvent.eventType,
        conversionValueCents,
        modelVersion: "v1",
      };
    }),
  });

  logger.info(
    { contactId, conversionCrmEventId, touchpoints: N },
    "Attribution recomputed"
  );
}

function computeTimeDecayWeight(
  daysBeforeConversion: number,
  total: number,
  index: number
): number {
  // Half-life of 7 days — touchpoints decay exponentially with distance from conversion
  const halfLife = 7;
  const rawWeight = Math.pow(0.5, daysBeforeConversion / halfLife);
  // Placeholder normalization (caller should normalize across all touchpoints)
  // For simplicity, return raw weight divided by total (approximate normalization)
  return rawWeight / total;
}

function computePositionWeight(seq: number, total: number): number {
  if (total === 1) return 1;
  if (seq === 1 || seq === total) return 0.4;
  // Middle touchpoints share the remaining 20%
  const middleCount = total - 2;
  return middleCount > 0 ? 0.2 / middleCount : 0;
}
