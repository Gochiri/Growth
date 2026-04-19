import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { getDb } from "@growth/db";
import { getEnv } from "@growth/config";
import { runAnalyst } from "../agents/analyst.js";
import { logger } from "../lib/logger.js";
import { ANALYST_QUEUE } from "../plugins/queue.js";
import type { AnalystInput, CampaignMetrics, AccountSummary } from "@growth/types";

interface AnalystJob {
  reportType: AnalystInput["reportType"];
  campaignId?: string;
  contactId?: string;
  lookbackDays?: number;
}

async function buildAnalystInput(
  job: AnalystJob
): Promise<{ input: AnalystInput; reportId: string }> {
  const db = getDb();
  const lookbackDays = job.lookbackDays ?? 30;
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  // Build campaign metrics
  const campaigns = await db.campaign.findMany({
    where: { deletedAt: null, id: job.campaignId ? job.campaignId : undefined },
    include: {
      adEvents: { where: { eventTime: { gte: since } } },
      crmEvents: { where: { eventTime: { gte: since } } },
    },
  });

  const campaignMetrics: CampaignMetrics[] = campaigns.map((c) => {
    const ad = c.adEvents;
    const crm = c.crmEvents;

    const totalSpendCents = ad.reduce((s, e) => s + e.spendCents, 0);
    const impressions = ad.reduce((s, e) => s + e.impressions, 0);
    const clicks = ad.reduce((s, e) => s + e.clicks, 0);
    const conversions = ad.filter((e) => ["conversion", "purchase", "lead"].includes(e.eventType)).length;
    const conversionValueCents = Number(
      ad.reduce((s, e) => BigInt(s) + e.conversionValueCents, BigInt(0))
    );

    const appointments = crm.filter((e) => e.eventType === "appointment_scheduled").length;
    const appointmentCompleted = crm.filter((e) => e.eventType === "appointment_completed").length;
    const closedWon = crm.filter((e) => e.eventType === "deal_won").length;
    const closedLost = crm.filter((e) => e.eventType === "deal_lost").length;
    const dealValueCents = Number(
      crm.reduce((s, e) => BigInt(s) + e.dealValueCents, BigInt(0))
    );

    const latestStage = crm.sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime())[0];

    return {
      campaignId: c.id,
      campaignName: c.name,
      source: c.source as CampaignMetrics["source"],
      totalSpendCents,
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpm: impressions > 0 ? (totalSpendCents / impressions) * 1000 : 0,
      cpc: clicks > 0 ? totalSpendCents / clicks : 0,
      conversions,
      costPerConversionCents: conversions > 0 ? totalSpendCents / conversions : 0,
      conversionValueCents,
      roas: totalSpendCents > 0 ? conversionValueCents / totalSpendCents : 0,
      appointments,
      appointmentShowRate: appointments > 0 ? appointmentCompleted / appointments : 0,
      pipelineStage: latestStage?.ghlStageName ?? "Unknown",
      daysInCurrentStage: latestStage?.daysInPrevStage ?? 0,
      dealValueCents,
      closedWon,
      closedLost,
      closeRate: (closedWon + closedLost) > 0 ? closedWon / (closedWon + closedLost) : 0,
    };
  });

  const totalSpend = campaignMetrics.reduce((s, c) => s + c.totalSpendCents, 0);
  const totalRevenue = campaignMetrics.reduce((s, c) => s + c.conversionValueCents, 0);
  const totalContacts = await db.contact.count({ where: { deletedAt: null } });
  const totalCustomers = await db.contact.count({ where: { isCustomer: true, deletedAt: null } });

  const accountSummary: AccountSummary = {
    totalSpendCents: totalSpend,
    totalRevenueCents: totalRevenue,
    overallRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    totalContacts,
    totalCustomers,
    avgDaysToClose: 0, // Computed from attribution data in production
  };

  const generatedAt = new Date().toISOString();
  const input: AnalystInput = {
    reportType: job.reportType,
    generatedAt,
    lookbackDays,
    campaigns: campaignMetrics,
    accountSummary,
  };

  const report = await db.strategicReport.create({
    data: {
      reportType: job.reportType,
      title: `${job.reportType} — ${new Date().toLocaleDateString()}`,
      status: "pending",
      analystInput: input as Record<string, unknown>,
      campaignId: job.campaignId ?? null,
      contactId: job.contactId ?? null,
    },
  });

  return { input, reportId: report.id };
}

export function startAnalystWorker(): Worker {
  const env = getEnv();
  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const db = getDb();

  const worker = new Worker(
    ANALYST_QUEUE,
    async (job) => {
      const analystJob = job.data as AnalystJob;
      const { input, reportId } = await buildAnalystInput(analystJob);
      await runAnalyst(db, reportId, input);
    },
    {
      connection: redis,
      concurrency: env.ANALYST_WORKER_CONCURRENCY,
    }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Analyst job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Analyst job failed");
  });

  return worker;
}

export async function scheduleWeeklyDigest(queue: Queue): Promise<void> {
  await queue.add(
    "weekly-digest",
    { reportType: "weekly_digest", lookbackDays: 7 },
    {
      repeat: { pattern: "0 9 * * 1" }, // Every Monday at 9am
      jobId: "weekly-digest-recurring",
    }
  );
}
