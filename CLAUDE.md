# Growth Intelligence Middleware — Project Brain

This file is the authoritative context document for Claude Code sessions working on this repository.

## What This System Does

Proprietary Growth Intelligence Middleware that replaces n8n. It unifies Meta Ads API and GoHighLevel (GHL) CRM data, runs an agentic Claude analyst to identify strategic patterns, and surfaces actionable insights in a Next.js command interface.

**Business goal**: Give growth teams a single OS that tells them exactly which ad to pause, which funnel step to fix, and which lead to reactivate — without manual analysis.

---

## The Three Laws (Non-Negotiable)

### 1. Zero-n8n
No n8n, no Zapier, no Make.com, no automation platform dependencies. All orchestration is native Node.js: BullMQ workers, Fastify routes, cron via BullMQ repeat jobs. If you reach for a workflow tool, stop and implement it in code.

### 2. AI-Native
Claude is the reasoning layer, not a feature. Every strategic decision flows through `apps/api/src/agents/analyst.ts`. The analyst uses `tool_use` for structured output — never string-parsing Claude's free text for structured data. Use `@anthropic-ai/sdk` exclusively (not OpenAI SDK, not LangChain).

### 3. Type-safe
- TypeScript strict mode everywhere (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Zod for all runtime validation: webhook payloads, env vars, Claude tool inputs
- Prisma for database types — never write raw SQL without a corresponding Prisma type
- No `any`, no `as unknown as X` casts without an explanatory comment

---

## Codebase Map

```
packages/db/prisma/schema.prisma  ← Single source of truth for all DB types
packages/types/src/analyst.ts     ← AnalystInput / AnalystOutput / StrategicPlay
packages/types/src/webhook.ts     ← NormalizedWebhookEvent
packages/config/src/env.ts        ← All env vars (Zod schema, fail-fast on startup)

apps/api/src/agents/analyst.ts    ← Core agentic loop (Claude SDK)
apps/api/src/agents/tools.ts      ← emit_strategic_play, write_recommendation
apps/api/src/agents/prompts.ts    ← System prompt template
apps/api/src/routes/webhooks/     ← POST /webhooks/ingest (Meta + GHL)
apps/api/src/workers/             ← BullMQ workers (ingestion + analyst)
apps/api/src/services/meta/       ← Meta Graph API client + rate limiter
apps/api/src/services/ghl/        ← GHL API client + circuit breaker
apps/api/src/services/attribution.ts ← Multi-touch attribution engine

apps/web/src/components/timeline/ ← CustomerTimeline + TimelineEvent
apps/web/src/components/plays/    ← SuggestedPlaysPanel + PlayCard
```

---

## Strategic Plays — The 8 Patterns

The Claude analyst recognizes these named patterns and emits them via `emit_strategic_play` tool calls:

| Play Name | Signal | Severity |
|---|---|---|
| `obstructed_funnel` | Contact stuck in pipeline stage > account avg days | warning → critical |
| `high_ctr_low_close` | CTR > 2%, close rate < 5%, volume ≥ 100 clicks | warning |
| `dead_pipeline` | Zero CRM movement in 14 days on active pipeline | critical |
| `spend_bleed` | Spend > $500, ROAS < 0.5, zero deal_won | critical |
| `velocity_spike` | Closes at > 2x account avg speed → scale signal | opportunity |
| `audience_exhaustion` | CTR declining > 30% WoW for 3+ consecutive weeks | warning |
| `attribution_gap` | > 20% Meta conversions unmatched in CRM | warning |
| `reactivation_opportunity` | > 60 days inactive contact shows new ad engagement | opportunity |

**Rule**: The analyst must call `emit_strategic_play` for each detected pattern before writing the narrative report. Never embed structured play data only in free text.

---

## API Workflow Rules

### Meta Ads API — Rate Limit Protocol

Parse `X-App-Usage` header on every Meta Graph API response:
```json
{"call_count": 28, "total_cputime": 25, "total_time": 25}
```

| Usage % (max of 3 fields) | Action |
|---|---|
| < 75% | Normal — pass through |
| 75–89% | Slow mode — delay `(pct - 75) * 200ms` before each call |
| 90–97% | Pause — block 60s, re-check |
| ≥ 98% | Circuit open — fail fast 5min, log CRITICAL |

Store throttle state in Redis key `meta:rate_limit:state` (shared across all worker instances).

### GHL API — Circuit Breaker Protocol

Retry on 429 with exponential backoff: base 1s, multiplier 2×, max 5 retries, cap 32s, ±20% jitter.

Circuit breaker: CLOSED → OPEN after 5 failures in 60s → HALF_OPEN after 30s → probe 1 request.

Store circuit state in Redis key `ghl:circuit:state`.

### Webhook Idempotency

Redis key pattern: `idempotency:webhook:{source}:{key}` — TTL 24h, `SETNX`.
DB fallback: unique index on `(source, idempotency_key)` in `webhook_ingestions`.
If Redis returns null on SETNX, the event is a duplicate — acknowledge and drop.

---

## Development Workflow

### Setup
```bash
pnpm install
cp .env.example .env  # fill in all values
pnpm db:migrate       # run Prisma migrations
pnpm db:generate      # generate Prisma client
```

### Running
```bash
pnpm dev              # starts all apps via Turborepo
# or individually:
cd apps/api && pnpm dev
cd apps/web && pnpm dev
```

### Testing a webhook locally
```bash
# Meta webhook (test HMAC with your META_APP_SECRET):
curl -X POST http://localhost:3001/webhooks/ingest \
  -H "x-webhook-source: meta" \
  -H "x-hub-signature-256: sha256=<computed_hmac>" \
  -H "Content-Type: application/json" \
  -d @test/fixtures/meta_conversion.json

# GHL webhook:
curl -X POST http://localhost:3001/webhooks/ingest \
  -H "x-webhook-source: ghl" \
  -H "x-ghl-signature: <GHL_WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d @test/fixtures/ghl_deal_won.json
```

### Triggering the analyst manually
```bash
cd apps/api
npx tsx src/scripts/trigger-analyst.ts --type campaign_analysis --lookback 30
```

---

## Code Style Guardrails

- No comments explaining WHAT the code does — names do that
- Comments only for non-obvious WHY: hidden constraints, workarounds, subtle invariants
- No multi-paragraph docstrings
- No `console.log` — use `logger` from `apps/api/src/lib/logger.ts` (Pino)
- Prefer `const` over `let`; never `var`
- Prefer early returns over nested conditionals
- Database queries in service files, not in route handlers or workers directly
- Workers call services; routes call workers via BullMQ (no direct DB access in routes)

---

## Key Contracts (Do Not Break)

1. **`AnalystInput` shape** — ingestion worker builds this; analyst agent consumes it; frontend displays results. Changing it requires updating all three.

2. **`NormalizedWebhookEvent`** — the contract between source-specific normalizers (meta.ts, ghl.ts) and the ingestion worker. Both sides must agree on this shape.

3. **Webhook idempotency** — never remove the Redis SETNX check. It protects against Meta's at-least-once delivery and GHL webhook retries.

4. **Attribution recompute trigger** — must fire on `deal_won` and `appointment_completed` events. If you change `crm_events` ingestion, verify this trigger still fires.
