import type {
  ContactTimelineResponse,
  PaginatedResponse,
  ContactSummary,
  ReportSummary,
  ReportDetail,
} from "@growth/types";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function getContacts(
  page = 1,
  pageSize = 20
): Promise<PaginatedResponse<ContactSummary>> {
  return apiFetch(`/contacts?page=${page}&pageSize=${pageSize}`);
}

export async function getContactTimeline(id: string): Promise<ContactTimelineResponse & {
  latestReport: {
    id: string;
    strategicPlays: unknown[];
    reportMarkdown: string | null;
    createdAt: string;
  } | null;
}> {
  return apiFetch(`/contacts/${id}/timeline`);
}

export async function getReports(
  page = 1,
  pageSize = 20
): Promise<PaginatedResponse<ReportSummary>> {
  return apiFetch(`/reports?page=${page}&pageSize=${pageSize}`);
}

export async function getReport(id: string): Promise<ReportDetail> {
  return apiFetch(`/reports/${id}`);
}
