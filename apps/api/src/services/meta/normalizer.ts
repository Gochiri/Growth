import crypto from "node:crypto";
import type { NormalizedWebhookEvent } from "@growth/types";

interface MetaEventPayload {
  event_id?: string;
  event_name?: string;
  event_time?: number;
  event_source_url?: string;
  user_data?: {
    em?: string[];
    ph?: string[];
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  };
  custom_data?: {
    currency?: string;
    value?: number;
  };
}

export function normalizeMetaEvent(
  payload: MetaEventPayload,
  pixelId: string,
  campaignId?: string
): NormalizedWebhookEvent {
  const eventName = payload.event_name ?? "unknown";
  const eventId = payload.event_id ?? crypto.randomUUID();

  const emailHash = payload.user_data?.em?.[0];
  const phoneHash = payload.user_data?.ph?.[0];

  const valueCents = payload.custom_data?.value
    ? Math.round(payload.custom_data.value * 100)
    : 0;

  return {
    source: "meta",
    externalId: eventId,
    eventType: mapMetaEventName(eventName),
    eventTime: new Date((payload.event_time ?? Date.now() / 1000) * 1000),
    contactIdentifiers: {
      metaUserHash: emailHash,
      email: undefined,
      phone: undefined,
    },
    campaignIdentifiers: {
      metaCampaignId: campaignId,
      metaPixelId: pixelId,
    },
    metrics: {
      conversionValueCents: valueCents,
    },
    userEmailHash: emailHash,
    userPhoneHash: phoneHash,
    userIp: payload.user_data?.client_ip_address,
    userAgent: payload.user_data?.client_user_agent,
    browserId: payload.user_data?.fbp,
    clickId: payload.user_data?.fbc,
    eventSourceUrl: payload.event_source_url,
    rawData: payload as Record<string, unknown>,
  };
}

function mapMetaEventName(name: string): string {
  const map: Record<string, string> = {
    Purchase: "purchase",
    Lead: "lead",
    CompleteRegistration: "conversion",
    AddToCart: "add_to_cart",
    InitiateCheckout: "initiate_checkout",
    ViewContent: "impression",
    PageView: "impression",
    Click: "click",
    VideoView: "video_view",
  };
  return map[name] ?? "impression";
}
