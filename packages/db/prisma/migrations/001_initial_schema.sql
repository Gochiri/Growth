-- Growth Intelligence Middleware — Initial Schema
-- Migration: 001_initial_schema
-- Database: PostgreSQL 16+

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE "WebhookSource" AS ENUM ('meta', 'ghl', 'instagram');

CREATE TYPE "AdEventType" AS ENUM (
  'impression', 'click', 'video_view', 'lead', 'conversion',
  'purchase', 'add_to_cart', 'initiate_checkout'
);

CREATE TYPE "CrmEventType" AS ENUM (
  'contact_created', 'contact_updated',
  'appointment_scheduled', 'appointment_completed', 'appointment_cancelled',
  'pipeline_stage_changed', 'deal_won', 'deal_lost',
  'form_submitted', 'sms_sent', 'sms_received',
  'email_sent', 'email_opened', 'call_completed'
);

CREATE TYPE "AttributionModel" AS ENUM (
  'first_touch', 'last_touch', 'linear', 'time_decay', 'position_based'
);

CREATE TYPE "ReportStatus" AS ENUM ('pending', 'generating', 'completed', 'failed');

CREATE TYPE "CampaignSource" AS ENUM ('meta', 'ghl', 'unified');

-- ============================================================
-- HELPER TRIGGER: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABLE: contacts
-- Unified customer profile merging Meta pixel and GHL CRM identity.
-- ============================================================
CREATE TABLE contacts (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- GHL identity
  ghl_contact_id      TEXT          UNIQUE,
  ghl_location_id     TEXT,

  -- Meta identity
  meta_user_hash      TEXT,
  meta_pixel_id       TEXT,

  -- Core identity
  email               TEXT,
  phone               TEXT,
  first_name          TEXT,
  last_name           TEXT,

  -- Geo
  city                TEXT,
  state               TEXT,
  country             TEXT          DEFAULT 'US',
  timezone            TEXT,

  -- Attribution origin
  first_touch_source  "WebhookSource",
  first_touch_at      TIMESTAMPTZ,
  utm_source          TEXT,
  utm_medium          TEXT,
  utm_campaign        TEXT,
  utm_content         TEXT,

  -- Lifecycle
  lifecycle_stage     TEXT,
  lead_score          SMALLINT      NOT NULL DEFAULT 0
                        CHECK (lead_score BETWEEN 0 AND 100),
  is_customer         BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Raw payloads
  meta_raw            JSONB         NOT NULL DEFAULT '{}',
  ghl_raw             JSONB         NOT NULL DEFAULT '{}',

  -- Timestamps + soft delete
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_contacts_email
  ON contacts (lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_contacts_phone
  ON contacts (phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_contacts_ghl
  ON contacts (ghl_contact_id)
  WHERE ghl_contact_id IS NOT NULL;

CREATE INDEX idx_contacts_meta_hash
  ON contacts (meta_user_hash)
  WHERE meta_user_hash IS NOT NULL;

CREATE INDEX idx_contacts_first_touch  ON contacts (first_touch_at DESC NULLS LAST);
CREATE INDEX idx_contacts_lifecycle    ON contacts (lifecycle_stage) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_fullname_trgm ON contacts
  USING GIN ((coalesce(first_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops);

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE: campaigns
-- Unified campaign record covering Meta Ad Campaigns and GHL Pipelines.
-- ============================================================
CREATE TABLE campaigns (
  id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  source                  "CampaignSource" NOT NULL,

  -- External IDs
  meta_campaign_id        TEXT            UNIQUE,
  meta_adset_id           TEXT,
  meta_ad_id              TEXT,
  ghl_pipeline_id         TEXT            UNIQUE,

  name                    TEXT            NOT NULL,
  status                  TEXT            NOT NULL DEFAULT 'active',

  -- Budget & spend
  daily_budget_cents      INTEGER,
  lifetime_budget_cents   INTEGER,
  total_spend_cents       BIGINT          NOT NULL DEFAULT 0,

  -- GHL pipeline metadata
  ghl_pipeline_stages     JSONB           NOT NULL DEFAULT '[]',

  -- Targeting snapshot
  targeting_snapshot      JSONB           NOT NULL DEFAULT '{}',

  -- Dates
  started_at              TIMESTAMPTZ,
  ended_at                TIMESTAMPTZ,
  created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

CREATE INDEX idx_campaigns_status ON campaigns (status, source) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_spend  ON campaigns (total_spend_cents DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE: webhook_ingestions
-- Append-only audit log of every raw webhook received.
-- ============================================================
CREATE TABLE webhook_ingestions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  source              "WebhookSource" NOT NULL,
  idempotency_key     TEXT          NOT NULL,

  -- HTTP envelope
  raw_headers         JSONB         NOT NULL DEFAULT '{}',
  raw_body            JSONB         NOT NULL,
  content_hash        TEXT          NOT NULL,

  -- Processing lifecycle
  received_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,
  processing_error    TEXT,
  retry_count         SMALLINT      NOT NULL DEFAULT 0,
  queue_job_id        TEXT,

  -- Produced event
  produced_event_type TEXT,
  produced_event_id   UUID
);

CREATE UNIQUE INDEX idx_webhook_idempotency     ON webhook_ingestions (source, idempotency_key);
CREATE        INDEX idx_webhook_unprocessed     ON webhook_ingestions (received_at) WHERE processed_at IS NULL;
CREATE        INDEX idx_webhook_source_received ON webhook_ingestions (source, received_at DESC);
CREATE        INDEX idx_webhook_produced        ON webhook_ingestions (produced_event_type, produced_event_id)
  WHERE produced_event_id IS NOT NULL;

-- ============================================================
-- TABLE: ad_events
-- Granular events from Meta Ads (impressions, clicks, conversions).
-- ============================================================
CREATE TABLE ad_events (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source linkage
  ingestion_id            UUID          REFERENCES webhook_ingestions(id) ON DELETE SET NULL,
  campaign_id             UUID          REFERENCES campaigns(id)           ON DELETE SET NULL,
  contact_id              UUID          REFERENCES contacts(id)            ON DELETE SET NULL,

  -- Meta identifiers
  meta_event_id           TEXT          NOT NULL,
  meta_pixel_id           TEXT          NOT NULL,
  meta_campaign_id        TEXT,
  meta_adset_id           TEXT,
  meta_ad_id              TEXT,

  -- Event classification
  event_type              "AdEventType" NOT NULL,
  event_time              TIMESTAMPTZ   NOT NULL,
  received_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Metric values
  spend_cents             INTEGER       NOT NULL DEFAULT 0,
  impressions             INTEGER       NOT NULL DEFAULT 0,
  clicks                  INTEGER       NOT NULL DEFAULT 0,
  reach                   INTEGER       NOT NULL DEFAULT 0,

  -- Conversion values
  conversion_value_cents  BIGINT        NOT NULL DEFAULT 0,
  currency                TEXT          NOT NULL DEFAULT 'USD',

  -- User context (hashed for privacy)
  user_email_hash         TEXT,
  user_phone_hash         TEXT,
  user_ip                 TEXT,
  user_agent              TEXT,
  browser_id              TEXT,
  click_id                TEXT,
  event_source_url        TEXT,

  -- Custom data
  custom_data             JSONB         NOT NULL DEFAULT '{}',

  -- Meta rate limit snapshot
  app_usage_snapshot      JSONB         NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX idx_ad_events_meta_dedup  ON ad_events (meta_event_id, meta_pixel_id);
CREATE        INDEX idx_ad_events_campaign    ON ad_events (campaign_id, event_time DESC);
CREATE        INDEX idx_ad_events_contact     ON ad_events (contact_id, event_time DESC);
CREATE        INDEX idx_ad_events_type_time   ON ad_events (event_type, event_time DESC);
CREATE        INDEX idx_ad_events_pixel_time  ON ad_events (meta_pixel_id, event_time DESC);
CREATE        INDEX idx_ad_events_conversions ON ad_events (campaign_id, event_time DESC)
  WHERE event_type IN ('conversion', 'purchase', 'lead');

-- ============================================================
-- TABLE: crm_events
-- Events from GoHighLevel CRM pipeline activity.
-- ============================================================
CREATE TABLE crm_events (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source linkage
  ingestion_id          UUID           REFERENCES webhook_ingestions(id) ON DELETE SET NULL,
  campaign_id           UUID           REFERENCES campaigns(id)           ON DELETE SET NULL,
  contact_id            UUID           REFERENCES contacts(id)            ON DELETE SET NULL,

  -- GHL identifiers
  ghl_event_id          TEXT           NOT NULL,
  ghl_location_id       TEXT           NOT NULL,
  ghl_contact_id        TEXT,
  ghl_pipeline_id       TEXT,
  ghl_stage_id          TEXT,
  ghl_stage_name        TEXT,

  -- Deal / appointment references
  ghl_opportunity_id    TEXT,
  ghl_appointment_id    TEXT,

  -- Event classification
  event_type            "CrmEventType" NOT NULL,
  event_time            TIMESTAMPTZ    NOT NULL,
  received_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- Financial context
  deal_value_cents      BIGINT         NOT NULL DEFAULT 0,
  currency              TEXT           NOT NULL DEFAULT 'USD',

  -- Stage transition
  previous_stage_name   TEXT,
  days_in_prev_stage    INTEGER,

  -- Contact snapshot at event time
  contact_email         TEXT,
  contact_phone         TEXT,
  contact_name          TEXT,

  -- Raw GHL payload
  raw_data              JSONB          NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX idx_crm_events_ghl_dedup ON crm_events (ghl_event_id, ghl_location_id);
CREATE        INDEX idx_crm_events_contact   ON crm_events (contact_id, event_time DESC);
CREATE        INDEX idx_crm_events_campaign  ON crm_events (campaign_id, event_time DESC);
CREATE        INDEX idx_crm_events_type_time ON crm_events (event_type, event_time DESC);
CREATE        INDEX idx_crm_events_stage     ON crm_events (ghl_pipeline_id, ghl_stage_name, event_time DESC);
CREATE        INDEX idx_crm_events_won       ON crm_events (deal_value_cents DESC, event_time DESC)
  WHERE event_type = 'deal_won';
CREATE        INDEX idx_crm_events_velocity  ON crm_events (days_in_prev_stage DESC NULLS LAST)
  WHERE days_in_prev_stage IS NOT NULL;

-- ============================================================
-- TABLE: attribution_touchpoints
-- Links ad_events → crm_events within a contact journey.
-- Stores pre-computed weights for all 5 attribution models.
-- ============================================================
CREATE TABLE attribution_touchpoints (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id                UUID          NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id               UUID          REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Linked events
  ad_event_id               UUID          REFERENCES ad_events(id)  ON DELETE SET NULL,
  crm_event_id              UUID          REFERENCES crm_events(id) ON DELETE SET NULL,

  -- Attribution weights (0.0000 – 1.0000)
  first_touch_weight        NUMERIC(5,4)  NOT NULL DEFAULT 0,
  last_touch_weight         NUMERIC(5,4)  NOT NULL DEFAULT 0,
  linear_weight             NUMERIC(5,4)  NOT NULL DEFAULT 0,
  time_decay_weight         NUMERIC(5,4)  NOT NULL DEFAULT 0,
  position_weight           NUMERIC(5,4)  NOT NULL DEFAULT 0,

  -- Journey position metadata
  touchpoint_sequence       INTEGER       NOT NULL,
  total_touchpoints         INTEGER       NOT NULL,
  days_before_conversion    INTEGER,

  -- Conversion anchor event
  conversion_crm_event_id   UUID          REFERENCES crm_events(id) ON DELETE CASCADE,
  conversion_type           TEXT,
  conversion_value_cents    BIGINT        NOT NULL DEFAULT 0,

  -- Metadata
  model_version             TEXT          NOT NULL DEFAULT 'v1',
  computed_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attribution_contact    ON attribution_touchpoints (contact_id, touchpoint_sequence);
CREATE INDEX idx_attribution_campaign   ON attribution_touchpoints (campaign_id, first_touch_weight DESC);
CREATE INDEX idx_attribution_ad_event   ON attribution_touchpoints (ad_event_id)  WHERE ad_event_id IS NOT NULL;
CREATE INDEX idx_attribution_crm_event  ON attribution_touchpoints (crm_event_id) WHERE crm_event_id IS NOT NULL;
CREATE INDEX idx_attribution_conversion ON attribution_touchpoints (conversion_crm_event_id);
CREATE INDEX idx_attribution_linear_rev ON attribution_touchpoints (campaign_id, linear_weight)
  WHERE linear_weight > 0;

-- ============================================================
-- TABLE: strategic_reports
-- AI-generated reports produced by the Claude analyst agent.
-- ============================================================
CREATE TABLE strategic_reports (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope (NULL = account-wide)
  campaign_id             UUID          REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id              UUID          REFERENCES contacts(id)  ON DELETE SET NULL,

  -- Report identity
  report_type             TEXT          NOT NULL,
  title                   TEXT          NOT NULL,
  status                  "ReportStatus" NOT NULL DEFAULT 'pending',

  -- Analyst input snapshot
  analyst_input           JSONB         NOT NULL DEFAULT '{}',

  -- Claude output
  report_markdown         TEXT,
  strategic_plays         JSONB         NOT NULL DEFAULT '[]',
  recommendations         JSONB         NOT NULL DEFAULT '[]',
  confidence_score        NUMERIC(4,3)  CHECK (confidence_score BETWEEN 0 AND 1),

  -- Claude API metadata
  claude_model            TEXT,
  claude_input_tokens     INTEGER,
  claude_output_tokens    INTEGER,
  claude_stop_reason      TEXT,
  claude_raw_response     JSONB         NOT NULL DEFAULT '{}',

  -- Timing
  generation_started_at   TIMESTAMPTZ,
  generation_ended_at     TIMESTAMPTZ,

  error_message           TEXT,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_campaign    ON strategic_reports (campaign_id, created_at DESC) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_reports_contact     ON strategic_reports (contact_id, created_at DESC)  WHERE contact_id IS NOT NULL;
CREATE INDEX idx_reports_type_status ON strategic_reports (report_type, status, created_at DESC);
CREATE INDEX idx_reports_pending     ON strategic_reports (created_at) WHERE status = 'pending';
CREATE INDEX idx_reports_fts         ON strategic_reports
  USING GIN (to_tsvector('english', coalesce(report_markdown, '')));

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON strategic_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
