"use client";

import { useState } from "react";
import type { TimelineEvent } from "@growth/types";
import { TimelineEventCard } from "./TimelineEvent";
import { TimelineFilters } from "./TimelineFilters";

interface CustomerTimelineProps {
  events: TimelineEvent[];
}

export function CustomerTimeline({ events }: CustomerTimelineProps) {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filtered = events.filter((e) => {
    if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div>
      <TimelineFilters
        onFilterChange={(s, c) => {
          setSourceFilter(s);
          setCategoryFilter(c);
        }}
      />

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          No events match the selected filters.
        </div>
      ) : (
        <div className="relative">
          {filtered.map((event) => (
            <TimelineEventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
