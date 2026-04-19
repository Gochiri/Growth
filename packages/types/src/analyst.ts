export type StrategicPlayName =
  | "obstructed_funnel"
  | "high_ctr_low_close"
  | "dead_pipeline"
  | "spend_bleed"
  | "velocity_spike"
  | "audience_exhaustion"
  | "attribution_gap"
  | "reactivation_opportunity";

export type PlaySeverity = "critical" | "warning" | "opportunity";

export interface StrategicPlay {
  name: StrategicPlayName;
  severity: PlaySeverity;
  headline: string;
  narrative: string;
  dataPoints: string[];
  suggestedAction: string;
  affectedCampaignId?: string | undefined;
  affectedContactId?: string | undefined;
  confidence: number;
}

export type ReportPriority = "immediate" | "this_week" | "this_month";

export interface Recommendation {
  priority: ReportPriority;
  action: string;
  rationale: string;
  expectedImpact: string;
}

export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  source: "meta" | "ghl" | "unified";
  // Meta metrics
  totalSpendCents: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  costPerConversionCents: number;
  conversionValueCents: number;
  roas: number;
  // GHL metrics
  appointments: number;
  appointmentShowRate: number;
  pipelineStage: string;
  daysInCurrentStage: number;
  dealValueCents: number;
  closedWon: number;
  closedLost: number;
  closeRate: number;
}

export interface ContactJourneyMetrics {
  contactId: string;
  firstTouchSource: "meta" | "ghl" | "instagram";
  firstTouchAt: string;
  totalTouchpoints: number;
  adTouchpoints: number;
  crmTouchpoints: number;
  daysSinceFirstTouch: number;
  currentPipelineStage?: string | undefined;
  daysInCurrentStage?: number | undefined;
  dealValueCents?: number | undefined;
  isCustomer: boolean;
}

export interface AccountSummary {
  totalSpendCents: number;
  totalRevenueCents: number;
  overallRoas: number;
  totalContacts: number;
  totalCustomers: number;
  avgDaysToClose: number;
}

export type ReportType = "campaign_analysis" | "contact_journey" | "weekly_digest";

export interface AnalystInput {
  reportType: ReportType;
  generatedAt: string;
  lookbackDays: number;
  campaigns: CampaignMetrics[];
  contacts?: ContactJourneyMetrics[] | undefined;
  accountSummary: AccountSummary;
}

export interface AnalystOutput {
  reportId: string;
  title: string;
  executiveSummary: string;
  strategicPlays: StrategicPlay[];
  recommendations: Recommendation[];
  reportMarkdown: string;
  confidence: number;
  claudeModel: string;
  inputTokens: number;
  outputTokens: number;
}
