# Growth Intelligence Middleware — Architecture

> **Status**: Living document. Phase 1 approved, Phases 2-4 in progress.

## Purpose

Replace n8n with a proprietary Node.js infrastructure that:
1. Ingests webhooks from Meta Ads (Facebook/Instagram) and GoHighLevel CRM
2. Runs an agentic Claude analyst that produces strategic reports
3. Surfaces insights in a Next.js frontend as a **Customer Timeline** and **AI Suggested Plays**

**Three pillars**: Zero-n8n · AI-Native · Type-safe

---

## Monorepo Structure

```
/
├── apps/
│   ├── api/          # Fastify backend — ingestion, workers, agents
│   └── web/          # Next.js 15 App Router — timeline, plays panel
├── packages/
│   ├── db/           # Prisma schema + migrations (source of truth)
│   ├── types/        # Shared TypeScript interfaces (zero runtime)
│   └── config/       # Shared Zod env schema (fail-fast validation)
├── docs/
│   └── ARCHITECTURE.md
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| API Framework | Fastify 4 | Native TS, schema validation, lower overhead than Express |
| Frontend | Next.js 15 App Router | React Server Components, streaming for live report rendering |
| Monorepo | Turborepo + pnpm | Fast incremental builds, isolated deps |
| ORM | Prisma 6 | Best-in-class TypeScript codegen, typed migrations |
| Queue | BullMQ 5 + Redis 7 | Persistent jobs, dedup by ID, retries, concurrency control |
| AI Reasoning | `@anthropic-ai/sdk` + Claude claude-sonnet-4-6 | Tool use, agentic loops, structured output |
| Validation | Zod 3 | Runtime + compile-time; shared between Fastify schemas and Claude tool inputs |
| Logging | Pino | Structured JSON in production |
| UI | Shadcn/ui + Tailwind | Unstyled primitives, accessible, no bar charts needed |
| Testing | Vitest | ESM-native, fast, Turborepo-compatible |

---

## PostgreSQL Schema — Multi-Touch Attribution

### Design Principles

- **UUID PKs** via `gen_random_uuid()` — globally unique across services
- **Dual idempotency**: Redis `SETNX` (fast path) + DB unique constraint (defense in depth)
- **JSONB columns** for raw/extended metadata — no schema churn on new API fields
- **`timestamptz` everywhere** — UTC, never bare `timestamp`
- **Soft deletes** (`deleted_at`) on mutable entities (contacts, campaigns)
- **Partial indexes** for common analyst queries (conversions-only, active records only)

### Entity Relationship

```
contacts ──────────────────────────────────────────────────────┐
    │                                                           │
    ├── ad_events ──────────────────────┐                      │
    │       │                           │                      │
    ├── crm_events ─────────────────────┤                      │
    │       │                           │                      │
    └── attribution_touchpoints ────────┘ (weights per model)  │
            │                                                   │
            └── strategic_reports ──────────────────────────────┘

campaigns ──── ad_events
          └─── crm_events
          └─── attribution_touchpoints
          └─── strategic_reports

webhook_ingestions ──── ad_events
                   └─── crm_events
```

### Tables

#### `contacts`
Unified customer profile. A contact may be known via GHL CRM (`ghl_contact_id`), Meta pixel (`meta_user_hash`), or both. Email/phone dedup happens on normalized, case-insensitive values.

Key fields: `ghl_contact_id`, `meta_user_hash`, `email`, `phone`, `first_touch_source`, `first_touch_at`, `utm_*`, `lead_score`, `lifecycle_stage`, `is_customer`

#### `campaigns`
Unified campaign record spanning Meta Ad Campaigns and GHL Pipelines. One row per leaf-level entity (Meta ad or GHL pipeline). The `source` enum distinguishes them.

Key fields: `source`, `meta_campaign_id`, `meta_adset_id`, `meta_ad_id`, `ghl_pipeline_id`, `total_spend_cents`, `ghl_pipeline_stages` (JSONB array of stage names)

#### `webhook_ingestions`
Append-only audit log — every raw webhook payload received, regardless of outcome. The `idempotency_key` unique constraint is the DB layer of dedup (Redis SETNX is the fast path).

Key fields: `source`, `idempotency_key`, `raw_body`, `content_hash`, `processed_at`, `retry_count`, `produced_event_type`, `produced_event_id`

#### `ad_events`
Granular events from Meta CAPI/pixel. One row per Meta event. The `(meta_event_id, meta_pixel_id)` unique constraint enforces Meta's event deduplication requirements.

Key fields: `event_type`, `event_time`, `spend_cents`, `impressions`, `clicks`, `conversion_value_cents`, `user_email_hash`, `user_phone_hash`, `click_id` (fbc), `browser_id` (fbp)

#### `crm_events`
Events from GHL webhooks — pipeline movements, appointments, deals. The `days_in_prev_stage` column is computed at ingestion time and powers funnel velocity analysis.

Key fields: `event_type`, `ghl_stage_name`, `previous_stage_name`, `days_in_prev_stage`, `deal_value_cents`, `ghl_opportunity_id`

#### `attribution_touchpoints`
The heart of multi-touch attribution. Links `ad_events` → `crm_events` within a contact's journey and pre-computes weights for **all 5 models** in a single row. This avoids recomputation at query time.

Models stored:
- `first_touch_weight` — 1.0 on the first touchpoint, 0 elsewhere
- `last_touch_weight` — 1.0 on the last touchpoint before conversion
- `linear_weight` — 1/N across all touchpoints
- `time_decay_weight` — Exponential decay; touchpoints closer to conversion get more credit
- `position_weight` — 40% first + 40% last + 20% distributed across middle

Key fields: `touchpoint_sequence`, `total_touchpoints`, `days_before_conversion`, `conversion_crm_event_id`, `conversion_value_cents`

#### `strategic_reports`
AI-generated reports. Stores the full `analyst_input` snapshot for reproducibility, the `report_markdown` for display, and structured `strategic_plays` / `recommendations` as JSONB arrays for the frontend plays panel.

Key fields: `status`, `analyst_input`, `report_markdown`, `strategic_plays`, `recommendations`, `claude_model`, `claude_input_tokens`, `confidence_score`

---

## Universal Ingestion Layer

### Data Flow

```
Meta Webhook ──►
GHL Webhook  ──►  POST /webhooks/ingest
Instagram    ──►       │
                       │ 1. Buffer raw body (before JSON parse — HMAC needs raw bytes)
                       │ 2. Verify signature (HMAC-SHA256 for Meta; shared secret for GHL)
                       │ 3. Redis SETNX idempotency check (24h TTL)
                       │ 4. INSERT webhook_ingestions (raw audit log)
                       │ 5. Enqueue BullMQ job → return 200 immediately
                       │
              BullMQ "webhook-ingestion" queue
                       │
              ingestion.worker.ts
                       │
                       ├── Normalize payload (source-specific normalizer)
                       ├── Resolve/upsert contact (email+phone dedup)
                       ├── INSERT ad_event or crm_event
                       ├── Update campaign.total_spend_cents (ad events)
                       └── Trigger attribution recompute (on deal_won / appointment_completed)
                                  │
                       attribution_touchpoints UPSERT
                                  │
                       Analyst trigger decision
                       (if deal_won OR 6h cron)
                                  │
                       analyst.worker.ts → analyst.ts (Claude SDK)
```

### Signature Verification

**Meta**: HMAC-SHA256 of the raw request body bytes using `META_APP_SECRET`. The raw body buffer must be captured before Fastify's JSON parsing — use `addContentTypeParser` with `parseAs: 'buffer'`.

**GHL**: Shared secret sent in `x-ghl-signature` header. Constant-time comparison (`crypto.timingSafeEqual`) prevents timing attacks.

### Idempotency

Redis key: `idempotency:webhook:{source}:{key}` with 24h TTL.

Meta idempotency key: SHA-256 of `x-hub-signature-256` header value.
GHL idempotency key: GHL event ID from payload (`data.id` or `event_id`).

---

## Agentic Analyst — Claude SDK Design

### Reasoning Flow

```
analyst.worker.ts builds AnalystInput
    │
    ├── Query: last 30d spend, CTR, ROAS per campaign
    ├── Query: GHL funnel velocity (avg days_in_prev_stage per stage)
    ├── Query: close rates, appointment show rates
    └── Query: attribution breakdowns
         │
         ▼
analyst.ts — Claude claude-sonnet-4-6 with tool_use
    │
    ├── System prompt: Growth Intelligence Analyst persona + play definitions
    ├── User message: serialized AnalystInput JSON
    │
    │  Agentic loop (until stop_reason = 'end_turn'):
    │  ┌─────────────────────────────────────────────────────┐
    │  │  Claude reasons over data                           │
    │  │  → calls emit_strategic_play (per pattern found)   │
    │  │  → calls write_recommendation (per action)         │
    │  │  ← tool results: success acknowledgements          │
    │  └─────────────────────────────────────────────────────┘
    │
    └── Final assistant text = report_markdown
         │
         ▼
UPDATE strategic_reports SET status='completed', plays=[...], markdown=...
```

### Claude Tools

#### `emit_strategic_play`
Captures a recognized pattern with structured fields: `name` (canonical play name), `severity`, `headline`, `narrative`, `data_points[]`, `suggested_action`, `confidence`.

#### `write_recommendation`
Captures a prioritized action: `priority` (immediate/this_week/this_month), `action`, `rationale`, `expected_impact`.

### The 8 Strategic Plays

| Play | Signal | Threshold |
|---|---|---|
| `obstructed_funnel` | Contact stuck in pipeline stage | > account avg days per stage |
| `high_ctr_low_close` | Ad clicks not converting to CRM closes | CTR > 2%, close rate < 5%, volume ≥ 100 clicks |
| `dead_pipeline` | Zero CRM movement | No events in 14 days on active pipeline |
| `spend_bleed` | High spend, zero funnel penetration | > $500 spend, ROAS < 0.5, zero deal_won |
| `velocity_spike` | Unusually fast closes | Close speed > 2x account average |
| `audience_exhaustion` | Declining CTR on same creative | > 30% CTR drop WoW for 3+ consecutive weeks |
| `attribution_gap` | Meta conversions without CRM matches | > 20% of conversion events unmatched |
| `reactivation_opportunity` | Cold contact re-engages with ad | > 60 days inactive, new click/view event |

---

## API Rate Limit Handling

### Meta Ads API — Usage-Based Throttling

Every Meta Graph API response includes `X-App-Usage`:
```json
{"call_count": 28, "total_cputime": 25, "total_time": 25}
```

State machine thresholds (stored in Redis for shared state across workers):

| Usage % | Mode | Behavior |
|---|---|---|
| 0–74% | Normal | Pass through |
| 75–89% | Slow | Delay = `(max_usage - 75) * 200ms` per call |
| 90–97% | Pause | Block all non-critical calls for 60s, then re-check |
| 98–100% | Circuit Open | Fail fast for 5 minutes, alert |

### GHL API — Circuit Breaker + Exponential Backoff

**Backoff on 429**:
- Base: 1s, Multiplier: 2×, Max retries: 5, Cap: 32s
- Jitter: ±20% to prevent thundering herd

**Circuit Breaker (3 states)**:
- **CLOSED** → Normal operation
- **OPEN** → Fail fast for 30s after 5 failures in a 60s window
- **HALF_OPEN** → Probe 1 request; success → CLOSED, failure → OPEN

Circuit state stored in Redis so all worker instances share the same view.

---

## Frontend — Command Interface

### Design Philosophy
No bar chart dashboards. Two primary surfaces:

### Customer Timeline (`/contacts/[id]`)
Vertical chronological feed merging `ad_events` + `crm_events` ordered by `event_time`. Each event card is color-coded by source (Meta = blue, GHL = green, Instagram = purple). Filters by source and date range.

### AI Suggested Plays Panel (sidebar)
Cards populated from `strategic_reports.strategic_plays[]` for the selected contact or account. Each card shows: severity badge, headline, narrative (2-3 sentences), data points, and a single CTA button for the suggested action.

Severity colors: critical = red, warning = amber, opportunity = emerald.

### Routes
- `/` → redirect to `/contacts`
- `/contacts` — Contact list with lead score, lifecycle stage
- `/contacts/[id]` — Timeline + Plays Panel
- `/reports` — Reports list with status and generation time
- `/reports/[id]` — Full Markdown report rendered

---

## Environment Variables

See `.env.example` at the repo root for all required variables and documentation.

Critical variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection (BullMQ + rate limit state + idempotency)
- `ANTHROPIC_API_KEY` — Claude API key (must start with `sk-ant-`)
- `META_APP_SECRET` — Used for HMAC-SHA256 webhook verification
- `GHL_WEBHOOK_SECRET` — Used for GHL signature verification

---

## Verification Checklist

- [ ] `prisma migrate dev` — all 7 tables + indexes created without errors
- [ ] `prisma generate` — TypeScript types generated in `packages/db/src/generated/`
- [ ] Send Meta CAPI webhook → `webhook_ingestions` row created, `ad_events` row produced
- [ ] Send GHL webhook → `crm_events` row created, contact upserted
- [ ] Send duplicate webhook → only 1 row in each table (idempotency working)
- [ ] Call `analyst.ts` with mock input → `strategic_plays` array populated, `report_markdown` non-empty
- [ ] `next dev` → `/contacts/[id]` renders Timeline in chronological order
- [ ] Plays Panel shows cards from `strategic_reports.strategic_plays[]`
- [ ] Mock `X-App-Usage: {"call_count": 91}` → Meta client enters slow mode
