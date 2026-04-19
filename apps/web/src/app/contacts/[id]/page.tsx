import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactTimeline } from "@/lib/api";
import { CustomerTimeline } from "@/components/timeline/CustomerTimeline";
import { SuggestedPlaysPanel } from "@/components/plays/SuggestedPlaysPanel";
import type { StrategicPlay } from "@growth/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export default async function ContactPage({ params }: PageProps) {
  let data;
  try {
    data = await getContactTimeline(params.id);
  } catch {
    notFound();
  }

  const { contact, events, latestReport } = data;

  const fullName =
    contact.firstName && contact.lastName
      ? `${contact.firstName} ${contact.lastName}`
      : contact.email ?? contact.phone ?? "Unknown Contact";

  const plays = (latestReport?.strategicPlays ?? []) as StrategicPlay[];

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Link
              href="/contacts"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              ← Contacts
            </Link>
            <span className="text-gray-700">/</span>
            <h1 className="text-sm font-semibold text-white">{fullName}</h1>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/contacts" className="text-gray-400 hover:text-white transition-colors">
              Contacts
            </Link>
            <Link href="/reports" className="text-gray-400 hover:text-white transition-colors">
              Reports
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Contact header */}
        <div className="mb-8 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-lg font-semibold text-gray-200">
                {contact.firstName?.[0] ?? contact.email?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">{fullName}</h2>
                <div className="flex items-center gap-3 mt-0.5">
                  {contact.email && <p className="text-sm text-gray-400">{contact.email}</p>}
                  {contact.phone && <p className="text-sm text-gray-500">{contact.phone}</p>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {contact.isCustomer && (
                <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-3 py-1 rounded-full">
                  Customer
                </span>
              )}
              {contact.lifecycleStage && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Stage</p>
                  <p className="text-sm text-white">{contact.lifecycleStage}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-xs text-gray-500">Lead Score</p>
                <p
                  className={`text-2xl font-bold ${
                    contact.leadScore >= 70
                      ? "text-green-400"
                      : contact.leadScore >= 40
                        ? "text-yellow-400"
                        : "text-gray-400"
                  }`}
                >
                  {contact.leadScore}
                </p>
              </div>
              {contact.firstTouchSource && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">First Touch</p>
                  <p className="text-sm text-white capitalize">{contact.firstTouchSource}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Two-column layout: Timeline + Plays Panel */}
        <div className="flex gap-8">
          {/* Timeline */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">
                Customer Timeline
                <span className="text-gray-500 font-normal ml-2">({events.length} events)</span>
              </h3>
            </div>
            <CustomerTimeline events={events} />
          </div>

          {/* AI Suggested Plays Panel */}
          <SuggestedPlaysPanel
            plays={plays}
            reportCreatedAt={latestReport?.createdAt}
          />
        </div>
      </main>
    </div>
  );
}
