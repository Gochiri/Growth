import type Anthropic from "@anthropic-ai/sdk";

export const analystTools: Anthropic.Tool[] = [
  {
    name: "emit_strategic_play",
    description:
      "Record a recognized strategic pattern found in the data. Call once per distinct pattern.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          enum: [
            "obstructed_funnel",
            "high_ctr_low_close",
            "dead_pipeline",
            "spend_bleed",
            "velocity_spike",
            "audience_exhaustion",
            "attribution_gap",
            "reactivation_opportunity",
          ],
          description: "Canonical play name",
        },
        severity: {
          type: "string",
          enum: ["critical", "warning", "opportunity"],
        },
        headline: {
          type: "string",
          description: "One-line summary for the UI card (max 80 chars)",
        },
        narrative: {
          type: "string",
          description: "2–3 sentence explanation of what the data shows",
        },
        data_points: {
          type: "array",
          items: { type: "string" },
          description: 'Specific numeric facts (e.g. ["CTR: 4.2%", "0 closes in 30 days"])',
        },
        suggested_action: {
          type: "string",
          description: "Single imperative sentence (max 120 chars)",
        },
        affected_campaign_id: {
          type: "string",
          description: "Campaign ID if play is campaign-specific",
        },
        affected_contact_id: {
          type: "string",
          description: "Contact ID if play is contact-specific",
        },
        confidence: {
          type: "number",
          description: "Self-assessed confidence 0.0–1.0",
        },
      },
      required: [
        "name",
        "severity",
        "headline",
        "narrative",
        "data_points",
        "suggested_action",
        "confidence",
      ],
    },
  },
  {
    name: "write_recommendation",
    description: "Record a concrete, prioritized recommendation. Call once per distinct action.",
    input_schema: {
      type: "object",
      properties: {
        priority: {
          type: "string",
          enum: ["immediate", "this_week", "this_month"],
        },
        action: {
          type: "string",
          description: "Imperative action sentence (start with a verb)",
        },
        rationale: {
          type: "string",
          description: "Why this action based on the data",
        },
        expected_impact: {
          type: "string",
          description: "Qualitative outcome if action is taken",
        },
      },
      required: ["priority", "action", "rationale", "expected_impact"],
    },
  },
];
