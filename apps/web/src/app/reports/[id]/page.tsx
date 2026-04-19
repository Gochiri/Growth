import Link from "next/link";
import { notFound } from "next/navigation";
import { getReport } from "@/lib/api";
import { PlayCard } from "@/components/plays/PlayCard";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export default async function ReportPage({ params }: PageProps) {
  let report;
  try {
    report = await getReport(params.id);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <Link
              href="/reports"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              ← Reports
            </Link>
            <span className="text-gray-700">/</span>
            <h1 className="text-sm font-semibold text-white truncate max-w-xs">{report.title}</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {report.claudeModel && <span>{report.claudeModel}</span>}
            {report.claudeInputTokens && (
              <span>
                {report.claudeInputTokens + (report.claudeOutputTokens ?? 0)} tokens
              </span>
            )}
            <span>{formatRelativeTime(report.createdAt)}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Report markdown */}
          <div className="flex-1 min-w-0">
            {report.reportMarkdown ? (
              <article className="prose prose-invert prose-sm max-w-none">
                <div
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(report.reportMarkdown) }}
                />
              </article>
            ) : (
              <div className="text-center py-20 text-gray-500">
                <p>{report.status === "generating" ? "Generating report…" : "No report content"}</p>
              </div>
            )}
          </div>

          {/* Strategic plays sidebar */}
          {report.strategicPlays.length > 0 && (
            <aside className="w-80 flex-shrink-0">
              <h2 className="text-sm font-semibold text-white mb-4">Strategic Plays</h2>
              <div className="space-y-3">
                {report.strategicPlays.map((play, i) => (
                  <PlayCard key={i} play={play} />
                ))}
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

function markdownToHtml(markdown: string): string {
  // Minimal Markdown → HTML for the report display
  // In production, use a proper library like remark/rehype
  return markdown
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul])(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}
