import type { Redis } from "ioredis";
import { CircuitBreaker } from "../../lib/circuit-breaker.js";
import { RateLimitError } from "../../lib/errors.js";
import type { GhlContact, GhlOpportunity } from "./types.js";

const BASE_URL = "https://rest.gohighlevel.com/v1";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 32_000;

export class GhlClient {
  private readonly circuit: CircuitBreaker;

  constructor(
    private readonly apiKey: string,
    private readonly locationId: string,
    redis: Redis
  ) {
    this.circuit = new CircuitBreaker({ service: "ghl", redis });
  }

  async getContact(contactId: string): Promise<GhlContact> {
    return this.request<GhlContact>(`/contacts/${contactId}`);
  }

  async getOpportunity(opportunityId: string): Promise<GhlOpportunity> {
    return this.request<GhlOpportunity>(`/opportunities/${opportunityId}`);
  }

  private async request<T>(path: string, attempt = 0): Promise<T> {
    return this.circuit.execute(async () => {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;

        if (attempt >= MAX_RETRIES) {
          throw new RateLimitError("GHL", retryAfterMs);
        }

        const delay = Math.min(
          BASE_DELAY_MS * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4),
          MAX_DELAY_MS
        );
        await sleep(delay);
        return this.request<T>(path, attempt + 1);
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GHL API error ${res.status}: ${body}`);
      }

      return res.json() as Promise<T>;
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
