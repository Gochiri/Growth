import type { StrategicPlay } from "@growth/types";
import { cn } from "@/lib/utils";

interface PlayCardProps {
  play: StrategicPlay;
}

const SEVERITY_STYLES = {
  critical: {
    border: "border-red-800",
    badge: "bg-red-950 text-red-400 border-red-800",
    dot: "bg-red-500",
    label: "Critical",
  },
  warning: {
    border: "border-amber-800",
    badge: "bg-amber-950 text-amber-400 border-amber-800",
    dot: "bg-amber-500",
    label: "Warning",
  },
  opportunity: {
    border: "border-emerald-800",
    badge: "bg-emerald-950 text-emerald-400 border-emerald-800",
    dot: "bg-emerald-500",
    label: "Opportunity",
  },
};

const PLAY_ICONS: Record<string, string> = {
  obstructed_funnel: "⚡",
  high_ctr_low_close: "↗",
  dead_pipeline: "◻",
  spend_bleed: "🔥",
  velocity_spike: "⬆",
  audience_exhaustion: "📉",
  attribution_gap: "⚠",
  reactivation_opportunity: "↩",
};

export function PlayCard({ play }: PlayCardProps) {
  const style = SEVERITY_STYLES[play.severity];
  const icon = PLAY_ICONS[play.name] ?? "◈";

  return (
    <div className={cn("bg-gray-900 border rounded-lg p-4", style.border)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{icon}</span>
          <span className={cn("text-xs border rounded px-1.5 py-0.5", style.badge)}>
            {style.label}
          </span>
        </div>
        <span className="text-xs text-gray-600">
          {Math.round(play.confidence * 100)}% confidence
        </span>
      </div>

      {/* Headline */}
      <p className="text-sm font-semibold text-white mb-2">{play.headline}</p>

      {/* Narrative */}
      <p className="text-xs text-gray-400 leading-relaxed mb-3">{play.narrative}</p>

      {/* Data points */}
      {play.dataPoints.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {play.dataPoints.map((dp, i) => (
            <span
              key={i}
              className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono"
            >
              {dp}
            </span>
          ))}
        </div>
      )}

      {/* Suggested action */}
      <div className="border-t border-gray-800 pt-3">
        <p className="text-xs text-gray-500 mb-1">Suggested action</p>
        <p className="text-xs text-white font-medium">{play.suggestedAction}</p>
      </div>
    </div>
  );
}
