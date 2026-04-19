import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  ContactTimelineResponse,
  TimelineEvent,
  PaginatedResponse,
  ContactSummary,
} from "@growth/types";

export async function contactRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/contacts", async (req: FastifyRequest, reply) => {
    const query = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(query["page"] ?? "1", 10));
    const pageSize = Math.min(50, parseInt(query["pageSize"] ?? "20", 10));

    const [total, contacts] = await Promise.all([
      fastify.db.contact.count({ where: { deletedAt: null } }),
      fastify.db.contact.findMany({
        where: { deletedAt: null },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const summaries: ContactSummary[] = contacts.map((c) => ({
      id: c.id,
      email: c.email,
      phone: c.phone,
      firstName: c.firstName,
      lastName: c.lastName,
      lifecycleStage: c.lifecycleStage,
      leadScore: c.leadScore,
      isCustomer: c.isCustomer,
      firstTouchSource: c.firstTouchSource as ContactSummary["firstTouchSource"],
      firstTouchAt: c.firstTouchAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }));

    const response: PaginatedResponse<ContactSummary> = {
      data: summaries,
      total,
      page,
      pageSize,
      hasNextPage: page * pageSize < total,
    };

    return reply.send(response);
  });

  fastify.get(
    "/contacts/:id/timeline",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const { id } = req.params;

      const [contact, adEvents, crmEvents, latestReport] = await Promise.all([
        fastify.db.contact.findUnique({ where: { id, deletedAt: null } }),
        fastify.db.adEvent.findMany({
          where: { contactId: id },
          include: { campaign: { select: { id: true, name: true } } },
          orderBy: { eventTime: "desc" },
          take: 100,
        }),
        fastify.db.crmEvent.findMany({
          where: { contactId: id },
          include: { campaign: { select: { id: true, name: true } } },
          orderBy: { eventTime: "desc" },
          take: 100,
        }),
        fastify.db.strategicReport.findFirst({
          where: { contactId: id, status: "completed" },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      if (!contact) return reply.status(404).send({ error: "Contact not found" });

      const adTimelineEvents: TimelineEvent[] = adEvents.map((e) => ({
        id: e.id,
        source: e.metaPixelId.startsWith("ig") ? "instagram" : "meta",
        category: "ad",
        eventType: e.eventType,
        eventTime: e.eventTime.toISOString(),
        title: formatAdEventTitle(e.eventType),
        description: e.spendCents > 0 ? `Spend: $${(e.spendCents / 100).toFixed(2)}` : null,
        metadata: {
          metaEventId: e.metaEventId,
          metaCampaignId: e.metaCampaignId,
          spendCents: e.spendCents,
          impressions: e.impressions,
          clicks: e.clicks,
          conversionValueCents: Number(e.conversionValueCents),
        },
        campaignId: e.campaignId,
        campaignName: e.campaign?.name ?? null,
      }));

      const crmTimelineEvents: TimelineEvent[] = crmEvents.map((e) => ({
        id: e.id,
        source: "ghl",
        category: "crm",
        eventType: e.eventType,
        eventTime: e.eventTime.toISOString(),
        title: formatCrmEventTitle(e.eventType, e.ghlStageName),
        description: e.ghlStageName ?? null,
        metadata: {
          ghlEventId: e.ghlEventId,
          stageName: e.ghlStageName,
          previousStageName: e.previousStageName,
          daysInPrevStage: e.daysInPrevStage,
          dealValueCents: Number(e.dealValueCents),
        },
        campaignId: e.campaignId,
        campaignName: e.campaign?.name ?? null,
      }));

      // Merge and sort by eventTime descending
      const allEvents = [...adTimelineEvents, ...crmTimelineEvents].sort(
        (a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime()
      );

      const contactSummary: ContactSummary = {
        id: contact.id,
        email: contact.email,
        phone: contact.phone,
        firstName: contact.firstName,
        lastName: contact.lastName,
        lifecycleStage: contact.lifecycleStage,
        leadScore: contact.leadScore,
        isCustomer: contact.isCustomer,
        firstTouchSource: contact.firstTouchSource as ContactSummary["firstTouchSource"],
        firstTouchAt: contact.firstTouchAt?.toISOString() ?? null,
        createdAt: contact.createdAt.toISOString(),
      };

      const response: ContactTimelineResponse = {
        contact: contactSummary,
        events: allEvents,
        totalEvents: allEvents.length,
      };

      return reply.send({
        ...response,
        latestReport: latestReport
          ? {
              id: latestReport.id,
              strategicPlays: latestReport.strategicPlays,
              reportMarkdown: latestReport.reportMarkdown,
              createdAt: latestReport.createdAt.toISOString(),
            }
          : null,
      });
    }
  );
}

function formatAdEventTitle(eventType: string): string {
  const map: Record<string, string> = {
    impression: "Ad Impression",
    click: "Ad Click",
    video_view: "Video View",
    lead: "Lead Generated",
    conversion: "Conversion",
    purchase: "Purchase",
    add_to_cart: "Add to Cart",
    initiate_checkout: "Checkout Started",
  };
  return map[eventType] ?? eventType;
}

function formatCrmEventTitle(eventType: string, stageName?: string | null): string {
  const map: Record<string, string> = {
    contact_created: "Contact Created",
    contact_updated: "Contact Updated",
    appointment_scheduled: "Appointment Scheduled",
    appointment_completed: "Appointment Completed",
    appointment_cancelled: "Appointment Cancelled",
    pipeline_stage_changed: stageName ? `Stage → ${stageName}` : "Stage Changed",
    deal_won: "Deal Won",
    deal_lost: "Deal Lost",
    form_submitted: "Form Submitted",
    sms_sent: "SMS Sent",
    sms_received: "SMS Received",
    email_sent: "Email Sent",
    email_opened: "Email Opened",
    call_completed: "Call Completed",
  };
  return map[eventType] ?? eventType;
}
