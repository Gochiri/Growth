import type { TimelineEvent } from "@growth/types";
import { cn, formatRelativeTime } from "@/lib/utils";

interface TimelineEventProps {
  event: TimelineEvent;
}

const SOURCE_STYLES = {
  meta: {
    dot: "bg-blue-500",
    badge: "bg-blue-950 text-blue-400 border-blue-800",
    label: "Meta",
  },
  ghl: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-950 text-emerald-400 border-emerald-800",
    label: "GHL",
  },
  instagram: {
    dot: "bg-pink-500",
    badge: "bg-pink-950 text-pink-400 border-pink-800",
    label: "Instagram",
  },
};

const CATEGORY_ICONS = {
  ad: "↗",
  crm: "◈",
};

export function TimelineEventCard({ event }: TimelineEventProps) {
  const style = SOURCE_STYLES[event.source] ?? SOURCE_STYLES.meta;

  return (
    <div className="flex gap-4">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center">
        <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0", style.dot)} />
        <div className="w-px bg-gray-800 flex-1 mt-1" />
      </div>

      {/* Event card */}
      <div className="pb-5 flex-1 min-w-0">
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-400 text-xs">{CATEGORY_ICONS[event.category]}</span>
                <span className={cn("text-xs border rounded px-1.5 py-0.5", style.badge)}>
                  {style.label}
                </span>
                <span className="text-xs text-gray-500">{event.eventType}</span>
              </div>
              <p className="text-sm font-medium text-white truncate">{event.title}</p>
              {event.description && (
                <p className="text-xs text-gray-400 mt-0.5">{event.description}</p>
              )}
              {event.campaignName && (
                <p className="text-xs text-gray-600 mt-1">via {event.campaignName}</p>
              )}
            </div>
            <time className="text-xs text-gray-600 flex-shrink-0 mt-0.5">
              {formatRelativeTime(event.eventTime)}
            </time>
          </div>
        </div>
      </div>
    </div>
  );
}
