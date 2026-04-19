import type { StrategicPlay, Recommendation, ReportType } from "./analyst.js";
import type { WebhookSource } from "./webhook.js";

// ─── Shared API shapes ────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

// ─── Contacts API ─────────────────────────────────────────────────────────────

export interface ContactSummary {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  lifecycleStage: string | null;
  leadScore: number;
  isCustomer: boolean;
  firstTouchSource: WebhookSource | null;
  firstTouchAt: string | null;
  createdAt: string;
}

export type TimelineEventSource = "meta" | "ghl" | "instagram";
export type TimelineEventCategory = "ad" | "crm";

export interface TimelineEvent {
  id: string;
  source: TimelineEventSource;
  category: TimelineEventCategory;
  eventType: string;
  eventTime: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  campaignId: string | null;
  campaignName: string | null;
}

export interface ContactTimelineResponse {
  contact: ContactSummary;
  events: TimelineEvent[];
  totalEvents: number;
}

// ─── Reports API ──────────────────────────────────────────────────────────────

export interface ReportSummary {
  id: string;
  reportType: ReportType;
  title: string;
  status: "pending" | "generating" | "completed" | "failed";
  playsCount: number;
  confidenceScore: number | null;
  campaignId: string | null;
  contactId: string | null;
  createdAt: string;
  generationDurationMs: number | null;
}

export interface ReportDetail extends ReportSummary {
  reportMarkdown: string | null;
  strategicPlays: StrategicPlay[];
  recommendations: Recommendation[];
  claudeModel: string | null;
  claudeInputTokens: number | null;
  claudeOutputTokens: number | null;
}

// ─── Webhook API ──────────────────────────────────────────────────────────────

export interface WebhookIngestResponse {
  received: true;
  ingestionId: string;
}
