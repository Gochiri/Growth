import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@growth/db";
import type {
  AnalystInput,
  AnalystOutput,
  StrategicPlay,
  StrategicPlayName,
  PlaySeverity,
  Recommendation,
  ReportPriority,
} from "@growth/types";
import { logger } from "../lib/logger.js";
import { analystTools } from "./tools.js";
import { buildSystemPrompt } from "./prompts.js";

const MODEL = "claude-sonnet-4-6";

interface EmitPlayInput {
  name: StrategicPlayName;
  severity: PlaySeverity;
  headline: string;
  narrative: string;
  data_points: string[];
  suggested_action: string;
  affected_campaign_id?: string;
  affected_contact_id?: string;
  confidence: number;
}

interface WriteRecommendationInput {
  priority: ReportPriority;
  action: string;
  rationale: string;
  expected_impact: string;
}

export async function runAnalyst(
  db: PrismaClient,
  reportId: string,
  input: AnalystInput
): Promise<AnalystOutput> {
  const client = new Anthropic();

  const plays: StrategicPlay[] = [];
  const recommendations: Recommendation[] = [];
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: JSON.stringify(input, null, 2),
    },
  ];

  let reportMarkdown = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastStopReason: string | null = null;

  await db.strategicReport.update({
    where: { id: reportId },
    data: { status: "generating", generationStartedAt: new Date() },
  });

  // Agentic loop: continue until stop_reason is 'end_turn' (no more tool calls)
  while (true) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: buildSystemPrompt(input.lookbackDays, input.generatedAt),
      tools: analystTools,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    lastStopReason = response.stop_reason;

    // Process content blocks
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        reportMarkdown += block.text;
      } else if (block.type === "tool_use") {
        // Accumulate structured data from tool calls client-side
        if (block.name === "emit_strategic_play") {
          const inp = block.input as EmitPlayInput;
          plays.push({
            name: inp.name,
            severity: inp.severity,
            headline: inp.headline,
            narrative: inp.narrative,
            dataPoints: inp.data_points,
            suggestedAction: inp.suggested_action,
            affectedCampaignId: inp.affected_campaign_id,
            affectedContactId: inp.affected_contact_id,
            confidence: inp.confidence,
          });
        } else if (block.name === "write_recommendation") {
          const inp = block.input as WriteRecommendationInput;
          recommendations.push({
            priority: inp.priority,
            action: inp.action,
            rationale: inp.rationale,
            expectedImpact: inp.expected_impact,
          });
        }

        // Always acknowledge tool calls so Claude can continue
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "recorded",
        });
      }
    }

    // Add assistant message to history
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      break;
    }

    // Feed tool results back and continue the loop
    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }
  }

  const overallConfidence =
    plays.length > 0
      ? plays.reduce((sum, p) => sum + p.confidence, 0) / plays.length
      : 0;

  const output: AnalystOutput = {
    reportId,
    title: buildTitle(input),
    executiveSummary: extractExecutiveSummary(reportMarkdown),
    strategicPlays: plays,
    recommendations,
    reportMarkdown,
    confidence: overallConfidence,
    claudeModel: MODEL,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };

  await db.strategicReport.update({
    where: { id: reportId },
    data: {
      status: "completed",
      reportMarkdown,
      strategicPlays: plays,
      recommendations,
      confidenceScore: overallConfidence,
      claudeModel: MODEL,
      claudeInputTokens: totalInputTokens,
      claudeOutputTokens: totalOutputTokens,
      claudeStopReason: lastStopReason,
      generationEndedAt: new Date(),
    },
  });

  logger.info(
    { reportId, plays: plays.length, recommendations: recommendations.length, totalInputTokens, totalOutputTokens },
    "Analyst report completed"
  );

  return output;
}

function buildTitle(input: AnalystInput): string {
  const date = new Date(input.generatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${input.reportType === "weekly_digest" ? "Weekly Digest" : "Campaign Analysis"} — ${date}`;
}

function extractExecutiveSummary(markdown: string): string {
  // Find content after "Executive Summary" heading or return the first paragraph
  const match = /##\s*Executive Summary\s*\n+([\s\S]+?)(?=\n##|\n---|\z)/i.exec(markdown);
  if (match?.[1]) {
    return match[1].trim().split("\n\n")[0] ?? "";
  }
  return markdown.split("\n\n")[0] ?? "";
}
