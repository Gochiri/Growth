export type WebhookSource = "meta" | "ghl" | "instagram";

export interface RawWebhookJob {
  ingestionId: string;
  source: WebhookSource;
  idempotencyKey: string;
  receivedAt: string;
  payload: unknown;
}

export interface ContactIdentifiers {
  email?: string | undefined;
  phone?: string | undefined;
  externalId?: string | undefined;
  metaUserHash?: string | undefined;
}

export interface CampaignIdentifiers {
  metaCampaignId?: string | undefined;
  metaAdsetId?: string | undefined;
  metaAdId?: string | undefined;
  metaPixelId?: string | undefined;
  ghlPipelineId?: string | undefined;
  ghlStageId?: string | undefined;
  ghlStageName?: string | undefined;
}

export interface NormalizedEventMetrics {
  spendCents?: number | undefined;
  impressions?: number | undefined;
  clicks?: number | undefined;
  reach?: number | undefined;
  conversionValueCents?: number | undefined;
  dealValueCents?: number | undefined;
}

export interface NormalizedWebhookEvent {
  source: WebhookSource;
  externalId: string;
  eventType: string;
  eventTime: Date;
  contactIdentifiers: ContactIdentifiers;
  campaignIdentifiers: CampaignIdentifiers;
  metrics: NormalizedEventMetrics;
  previousStageName?: string | undefined;
  daysInPreviousStage?: number | undefined;
  ghlOpportunityId?: string | undefined;
  ghlAppointmentId?: string | undefined;
  ghlLocationId?: string | undefined;
  userEmailHash?: string | undefined;
  userPhoneHash?: string | undefined;
  userIp?: string | undefined;
  userAgent?: string | undefined;
  browserId?: string | undefined;
  clickId?: string | undefined;
  eventSourceUrl?: string | undefined;
  rawData: Record<string, unknown>;
}
