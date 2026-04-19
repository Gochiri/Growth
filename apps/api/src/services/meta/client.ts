import type { Redis } from "ioredis";
import { logger } from "../../lib/logger.js";
import type { MetaAppUsage, MetaRateLimitMode, MetaRateLimitState } from "./types.js";

const RATE_LIMIT_KEY = "meta:rate_limit:state";

export class MetaClient {
  private readonly baseUrl = "https://graph.facebook.com/v21.0";

  constructor(
    private readonly accessToken: string,
    private readonly redis: Redis
  ) {}

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    await this.applyThrottle();

    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, "")}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString());
    await this.updateRateLimitState(res.headers);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta API error ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  private async applyThrottle(): Promise<void> {
    const state = await this.getRateLimitState();
    const now = Date.now();

    switch (state.mode) {
      case "slow": {
        const delayMs = (state.maxUsagePct - 75) * 200;
        await sleep(delayMs);
        break;
      }
      case "pause": {
        const elapsed = now - state.updatedAt;
        const remaining = Math.max(0, 60_000 - elapsed);
        if (remaining > 0) {
          logger.warn({ remainingMs: remaining }, "Meta API paused — rate limit");
          await sleep(remaining);
        }
        break;
      }
      case "open":
        throw new Error("Meta API circuit open — rate limit critical");
      default:
        break;
    }
  }

  private async updateRateLimitState(headers: Headers): Promise<void> {
    const raw = headers.get("x-app-usage");
    if (!raw) return;

    let usage: MetaAppUsage;
    try {
      usage = JSON.parse(raw) as MetaAppUsage;
    } catch {
      return;
    }

    const maxPct = Math.max(usage.call_count, usage.total_cputime, usage.total_time);
    const mode = this.pctToMode(maxPct);

    const state: MetaRateLimitState = { mode, maxUsagePct: maxPct, updatedAt: Date.now() };
    await this.redis.set(RATE_LIMIT_KEY, JSON.stringify(state), "EX", 300);

    if (mode === "open") {
      logger.error({ maxPct }, "Meta API rate limit CRITICAL — circuit open");
    } else if (mode === "pause") {
      logger.warn({ maxPct }, "Meta API rate limit high — pausing requests");
    }
  }

  private pctToMode(pct: number): MetaRateLimitMode {
    if (pct >= 98) return "open";
    if (pct >= 90) return "pause";
    if (pct >= 75) return "slow";
    return "normal";
  }

  private async getRateLimitState(): Promise<MetaRateLimitState> {
    const raw = await this.redis.get(RATE_LIMIT_KEY);
    if (!raw) return { mode: "normal", maxUsagePct: 0, updatedAt: Date.now() };
    try {
      return JSON.parse(raw) as MetaRateLimitState;
    } catch {
      return { mode: "normal", maxUsagePct: 0, updatedAt: Date.now() };
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
