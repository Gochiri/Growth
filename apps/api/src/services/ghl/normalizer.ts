import type { NormalizedWebhookEvent } from "@growth/types";
import type { GhlWebhookPayload } from "./types.js";

export function normalizeGhlEvent(payload: GhlWebhookPayload): NormalizedWebhookEvent {
  const eventId = payload.id ?? `ghl-${payload.type}-${Date.now()}`;
  const eventType = mapGhlEventType(payload.type);

  const dealValueCents = payload.monetaryValue
    ? Math.round(payload.monetaryValue * 100)
    : 0;

  return {
    source: "ghl",
    externalId: eventId,
    eventType,
    eventTime: payload.dateAdded ? new Date(payload.dateAdded) : new Date(),
    contactIdentifiers: {
      externalId: payload.contactId,
      email: payload.email,
      phone: payload.phone,
    },
    campaignIdentifiers: {
      ghlPipelineId: payload.pipelineId,
      ghlStageId: payload.pipelineStageId,
      ghlStageName: payload.pipelineStageName,
    },
    metrics: {
      dealValueCents,
    },
    previousStageName: payload.previousPipelineStageName,
    ghlOpportunityId: payload.opportunityId,
    ghlAppointmentId: payload.appointmentId,
    ghlLocationId: payload.locationId,
    rawData: payload as Record<string, unknown>,
  };
}

function mapGhlEventType(type: string): string {
  const map: Record<string, string> = {
    ContactCreate: "contact_created",
    ContactUpdate: "contact_updated",
    AppointmentCreate: "appointment_scheduled",
    AppointmentUpdate: "appointment_completed",
    AppointmentDelete: "appointment_cancelled",
    OpportunityCreate: "pipeline_stage_changed",
    OpportunityUpdate: "pipeline_stage_changed",
    OpportunityStageUpdate: "pipeline_stage_changed",
    OpportunityStatusUpdate: "deal_won",
    NoteCreate: "contact_updated",
    TaskCreate: "contact_updated",
    FormSubmit: "form_submitted",
    SMSDelivered: "sms_sent",
    SMSIncoming: "sms_received",
    EmailDelivered: "email_sent",
    EmailOpened: "email_opened",
    OutboundCall: "call_completed",
  };
  return map[type] ?? "contact_updated";
}
