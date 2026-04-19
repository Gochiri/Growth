import type { WebhookSource } from "./webhook.js";

export type AttributionModel =
  | "first_touch"
  | "last_touch"
  | "linear"
  | "time_decay"
  | "position_based";

export interface TouchpointData {
  touchpointId: string;
  sequence: number;
  totalTouchpoints: number;
  adEventId?: string | undefined;
  crmEventId?: string | undefined;
  eventType: string;
  eventTime: Date;
  source: WebhookSource;
  daysBeforeConversion?: number | undefined;
}

export interface WeightedTouchpoint extends TouchpointData {
  weight: number;
  attributedValueCents: number;
}

export interface CampaignAttribution {
  campaignId: string;
  totalWeight: number;
  attributedValueCents: number;
}

export interface AttributionResult {
  contactId: string;
  conversionEventId: string;
  conversionType: string;
  conversionValueCents: number;
  model: AttributionModel;
  touchpoints: WeightedTouchpoint[];
  campaignAttribution: CampaignAttribution[];
}
