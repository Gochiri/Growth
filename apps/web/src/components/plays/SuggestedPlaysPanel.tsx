import type { StrategicPlay } from "@growth/types";
import { PlayCard } from "./PlayCard";

interface SuggestedPlaysPanelProps {
  plays: StrategicPlay[];
  reportCreatedAt?: string;
}

export function SuggestedPlaysPanel({ plays, reportCreatedAt }: SuggestedPlaysPanelProps) {
  const sorted = [...plays].sort((a, b) => {
    const order = { critical: 0, warning: 1, opportunity: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <aside className="w-80 flex-shrink-0">
      <div className="sticky top-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">AI Suggested Plays</h2>
          {reportCreatedAt && (
            <span className="text-xs text-gray-600">
              {new Date(reportCreatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
            <p className="text-sm text-gray-400">No plays yet</p>
            <p className="text-xs text-gray-600 mt-1">
              Plays are generated when the analyst runs on conversion events.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((play, i) => (
              <PlayCard key={`${play.name}-${i}`} play={play} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
