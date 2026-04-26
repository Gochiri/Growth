import IORedis from "ioredis";
import { parseArgs } from "node:util";
import { getDb } from "@growth/db";
import { getEnv } from "@growth/config";
import { Queue } from "bullmq";
import { ANALYST_QUEUE } from "../plugins/queue.js";
import { logger } from "../lib/logger.js";
import type { AnalystInput } from "@growth/types";

const { values } = parseArgs({
  options: {
    type: { type: "string", default: "campaign_analysis" },
    lookback: { type: "string", default: "30" },
    campaign: { type: "string" },
    contact: { type: "string" },
    mock: { type: "boolean", default: false },
  },
});

async function main(): Promise<void> {
  const env = getEnv();

  if (values.mock) {
    await runWithMockData(env);
  } else {
    await enqueueRealJob(env);
  }
}

async function enqueueRealJob(env: ReturnType<typeof getEnv>): Promise<void> {
  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(ANALYST_QUEUE, { connection: redis });

  const job = await queue.add("manual-trigger", {
    reportType: values.type ?? "campaign_analysis",
    campaignId: values.campaign,
    contactId: values.contact,
    lookbackDays: parseInt(values.lookback ?? "30", 10),
  });

  logger.info({ jobId: job.id }, "Analyst job enqueued");
  await queue.close();
  await redis.quit();
}

async function runWithMockData(env: ReturnType<typeof getEnv>): Promise<void> {
  const { runAnalyst } = await import("../agents/analyst.js");
  const db = getDb();

  const mockInput: AnalystInput = {
    reportType: "campaign_analysis",
    generatedAt: new Date().toISOString(),
    lookbackDays: 30,
    accountSummary: {
      totalSpendCents: 1_250_000,
      totalRevenueCents: 2_800_000,
      overallRoas: 2.24,
      totalContacts: 847,
      totalCustomers: 63,
      avgDaysToClose: 18,
    },
    campaigns: [
      {
        campaignId: "mock-camp-001",
        campaignName: "Q4 Lead Gen — Homeowners",
        source: "meta",
        totalSpendCents: 850_000,
        impressions: 420_000,
        clicks: 12_600,
        ctr: 0.03,
        cpm: 20.24,
        cpc: 6.75,
        conversions: 0,
        costPerConversionCents: 0,
        conversionValueCents: 0,
        roas: 0,
        appointments: 38,
        appointmentShowRate: 0.71,
        pipelineStage: "Proposal Sent",
        daysInCurrentStage: 22,
        dealValueCents: 95_000_00,
        closedWon: 2,
        closedLost: 14,
        closeRate: 0.125,
      },
      {
        campaignId: "mock-camp-002",
        campaignName: "Retargeting — Website Visitors",
        source: "meta",
        totalSpendCents: 220_000,
        impressions: 180_000,
        clicks: 9_900,
        ctr: 0.055,
        cpm: 12.22,
        cpc: 2.22,
        conversions: 44,
        costPerConversionCents: 500_000,
        conversionValueCents: 2_800_000,
        roas: 12.7,
        appointments: 61,
        appointmentShowRate: 0.88,
        pipelineStage: "Closed Won",
        daysInCurrentStage: 4,
        dealValueCents: 2_800_000,
        closedWon: 44,
        closedLost: 3,
        closeRate: 0.936,
      },
      {
        campaignId: "mock-camp-003",
        campaignName: "Cold Outreach — SMB Owners",
        source: "ghl",
        totalSpendCents: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpm: 0,
        cpc: 0,
        conversions: 0,
        costPerConversionCents: 0,
        conversionValueCents: 0,
        roas: 0,
        appointments: 12,
        appointmentShowRate: 0.25,
        pipelineStage: "Discovery Call",
        daysInCurrentStage: 31,
        dealValueCents: 0,
        closedWon: 0,
        closedLost: 0,
        closeRate: 0,
      },
    ],
  };

  const report = await db.strategicReport.create({
    data: {
      reportType: "campaign_analysis",
      title: "Mock Campaign Analysis",
      status: "pending",
      analystInput: mockInput as Record<string, unknown>,
    },
  });

  logger.info({ reportId: report.id }, "Running analyst with mock data...");
  const output = await runAnalyst(db, report.id, mockInput);

  logger.info(
    {
      reportId: output.reportId,
      plays: output.strategicPlays.length,
      recommendations: output.recommendations.length,
      tokens: output.inputTokens + output.outputTokens,
    },
    "Analyst complete"
  );

  console.log("\n--- EXECUTIVE SUMMARY ---\n");
  console.log(output.executiveSummary);
  console.log("\n--- STRATEGIC PLAYS ---\n");
  output.strategicPlays.forEach((p) => {
    console.log(`[${p.severity.toUpperCase()}] ${p.headline}`);
    console.log(`  → ${p.suggestedAction}\n`);
  });

  await db.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, "trigger-analyst failed");
  process.exit(1);
});
