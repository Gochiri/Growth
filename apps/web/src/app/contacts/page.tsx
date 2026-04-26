import Link from "next/link";
import { getContacts } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  let contacts: Awaited<ReturnType<typeof getContacts>>["data"] = [];
  let total = 0;
  try {
    const result = await getContacts(1, 30);
    contacts = result.data;
    total = result.total;
  } catch {
    // API offline — show empty state
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div>
            <h1 className="text-lg font-semibold text-white">Growth Intelligence</h1>
            <p className="text-sm text-gray-400">{total} contacts tracked</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/contacts" className="text-white font-medium">Contacts</Link>
            <Link href="/reports" className="text-gray-400 hover:text-white transition-colors">Reports</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid gap-3">
          {contacts.map((contact) => (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-lg px-5 py-4 hover:border-gray-600 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-300">
                    {contact.firstName?.[0] ?? contact.email?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                      {contact.firstName && contact.lastName
                        ? `${contact.firstName} ${contact.lastName}`
                        : contact.email ?? "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500">{contact.email ?? contact.phone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-right">
                  {contact.lifecycleStage && (
                    <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
                      {contact.lifecycleStage}
                    </span>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">Lead Score</p>
                    <p className={`text-sm font-semibold ${
                      contact.leadScore >= 70 ? "text-green-400" :
                      contact.leadScore >= 40 ? "text-yellow-400" : "text-gray-400"
                    }`}>
                      {contact.leadScore}
                    </p>
                  </div>
                  {contact.isCustomer && (
                    <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-1 rounded">
                      Customer
                    </span>
                  )}
                  <p className="text-xs text-gray-600 hidden sm:block">
                    {contact.firstTouchAt ? formatRelativeTime(contact.firstTouchAt) : "—"}
                  </p>
                </div>
              </div>
            </Link>
          ))}

          {contacts.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              <p className="text-lg">No contacts yet</p>
              <p className="text-sm mt-1">Contacts are created automatically when webhooks arrive.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
