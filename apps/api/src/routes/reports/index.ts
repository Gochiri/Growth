import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ReportDetail, ReportSummary, PaginatedResponse } from "@growth/types";

export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/reports",
    async (req: FastifyRequest, reply) => {
      const query = req.query as Record<string, string>;
      const page = Math.max(1, parseInt(query["page"] ?? "1", 10));
      const pageSize = Math.min(50, parseInt(query["pageSize"] ?? "20", 10));

      const [total, reports] = await Promise.all([
        fastify.db.strategicReport.count(),
        fastify.db.strategicReport.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const summaries: ReportSummary[] = reports.map((r) => ({
        id: r.id,
        reportType: r.reportType as ReportSummary["reportType"],
        title: r.title,
        status: r.status as ReportSummary["status"],
        playsCount: Array.isArray(r.strategicPlays) ? r.strategicPlays.length : 0,
        confidenceScore: r.confidenceScore ? Number(r.confidenceScore) : null,
        campaignId: r.campaignId,
        contactId: r.contactId,
        createdAt: r.createdAt.toISOString(),
        generationDurationMs:
          r.generationStartedAt && r.generationEndedAt
            ? r.generationEndedAt.getTime() - r.generationStartedAt.getTime()
            : null,
      }));

      const response: PaginatedResponse<ReportSummary> = {
        data: summaries,
        total,
        page,
        pageSize,
        hasNextPage: page * pageSize < total,
      };

      return reply.send(response);
    }
  );

  fastify.get(
    "/reports/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const report = await fastify.db.strategicReport.findUnique({
        where: { id: req.params.id },
      });

      if (!report) return reply.status(404).send({ error: "Report not found" });

      const detail: ReportDetail = {
        id: report.id,
        reportType: report.reportType as ReportDetail["reportType"],
        title: report.title,
        status: report.status as ReportDetail["status"],
        playsCount: Array.isArray(report.strategicPlays) ? report.strategicPlays.length : 0,
        confidenceScore: report.confidenceScore ? Number(report.confidenceScore) : null,
        campaignId: report.campaignId,
        contactId: report.contactId,
        createdAt: report.createdAt.toISOString(),
        generationDurationMs:
          report.generationStartedAt && report.generationEndedAt
            ? report.generationEndedAt.getTime() - report.generationStartedAt.getTime()
            : null,
        reportMarkdown: report.reportMarkdown,
        strategicPlays: (report.strategicPlays as unknown[]) as ReportDetail["strategicPlays"],
        recommendations: (report.recommendations as unknown[]) as ReportDetail["recommendations"],
        claudeModel: report.claudeModel,
        claudeInputTokens: report.claudeInputTokens,
        claudeOutputTokens: report.claudeOutputTokens,
      };

      return reply.send(detail);
    }
  );
}
