"use client";

import { useState } from "react";
import type { TimelineEvent } from "@growth/types";
import { cn } from "@/lib/utils";

type Source = TimelineEvent["source"] | "all";
type Category = TimelineEvent["category"] | "all";

interface TimelineFiltersProps {
  onFilterChange: (source: Source, category: Category) => void;
}

export function TimelineFilters({ onFilterChange }: TimelineFiltersProps) {
  const [source, setSource] = useState<Source>("all");
  const [category, setCategory] = useState<Category>("all");

  const handleSource = (s: Source) => {
    setSource(s);
    onFilterChange(s, category);
  };

  const handleCategory = (c: Category) => {
    setCategory(c);
    onFilterChange(source, c);
  };

  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
        {(["all", "meta", "ghl", "instagram"] as Source[]).map((s) => (
          <button
            key={s}
            onClick={() => handleSource(s)}
            className={cn(
              "px-3 py-1.5 transition-colors",
              source === s
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
          >
            {s === "all" ? "All Sources" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
        {(["all", "ad", "crm"] as Category[]).map((c) => (
          <button
            key={c}
            onClick={() => handleCategory(c)}
            className={cn(
              "px-3 py-1.5 transition-colors",
              category === c
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
          >
            {c === "all" ? "All Events" : c === "ad" ? "Ad Events" : "CRM Events"}
          </button>
        ))}
      </div>
    </div>
  );
}
