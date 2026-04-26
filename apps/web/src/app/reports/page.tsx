import Link from "next/link";
import { getReports } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-800 text-gray-400",
  generating: "bg-blue-950 text-blue-400 animate-pulse",
  completed: "bg-green-950 text-green-400",
  failed: "bg-red-950 text-red-400",
};

export default async function ReportsPage() {
  let reports: Awaited<ReturnType<typeof getReports>>["data"] = [];
  let total = 0;
  try {
    const result = await getReports(1, 30);
    reports = result.data;
    total = result.total;
  } catch {
    // API offline — show empty state
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div>
            <h1 className="text-lg font-semibold text-white">Reports</h1>
            <p className="text-sm text-gray-400">{total} analyst reports</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/contacts" className="text-gray-400 hover:text-white transition-colors">
              Contacts
            </Link>
            <Link href="/reports" className="text-white font-medium">
              Reports
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid gap-3">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/reports/${report.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-lg px-5 py-4 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[report.status]}`}
                    >
                      {report.status}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                      {report.reportType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-white">{report.title}</p>
                </div>

                <div className="flex items-center gap-6 text-right">
                  {report.playsCount > 0 && (
                    <div>
                      <p className="text-xs text-gray-500">Plays</p>
                      <p className="text-sm font-semibold text-white">{report.playsCount}</p>
                    </div>
                  )}
                  {report.confidenceScore !== null && (
                    <div>
                      <p className="text-xs text-gray-500">Confidence</p>
                      <p className="text-sm font-semibold text-white">
                        {Math.round(report.confidenceScore * 100)}%
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-gray-600">{formatRelativeTime(report.createdAt)}</p>
                </div>
              </div>
            </Link>
          ))}

          {reports.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              <p className="text-lg">No reports yet</p>
              <p className="text-sm mt-1">
                Reports are generated automatically on deal_won events or weekly.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
