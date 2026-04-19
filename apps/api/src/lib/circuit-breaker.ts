import type { Redis } from "ioredis";
import { CircuitOpenError } from "./errors.js";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  service: string;
  redis: Redis;
  failureThreshold?: number;
  windowMs?: number;
  openDurationMs?: number;
}

export class CircuitBreaker {
  private readonly stateKey: string;
  private readonly failureCountKey: string;
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly openDurationMs: number;

  constructor(private readonly opts: CircuitBreakerOptions) {
    this.stateKey = `circuit:${opts.service}:state`;
    this.failureCountKey = `circuit:${opts.service}:failures`;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.windowMs = opts.windowMs ?? 60_000;
    this.openDurationMs = opts.openDurationMs ?? 30_000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState();

    if (state === "OPEN") {
      throw new CircuitOpenError(this.opts.service);
    }

    try {
      const result = await fn();
      if (state === "HALF_OPEN") {
        await this.close();
      }
      return result;
    } catch (err) {
      await this.recordFailure();
      throw err;
    }
  }

  private async getState(): Promise<CircuitState> {
    const raw = await this.opts.redis.get(this.stateKey);
    return (raw as CircuitState | null) ?? "CLOSED";
  }

  private async recordFailure(): Promise<void> {
    const count = await this.opts.redis.incr(this.failureCountKey);
    if (count === 1) {
      await this.opts.redis.pexpire(this.failureCountKey, this.windowMs);
    }
    if (count >= this.failureThreshold) {
      await this.opts.redis.set(
        this.stateKey,
        "OPEN",
        "PX",
        this.openDurationMs
      );
      // After open duration, transition to HALF_OPEN
      setTimeout(async () => {
        const current = await this.getState();
        if (current === "OPEN") {
          await this.opts.redis.set(this.stateKey, "HALF_OPEN");
        }
      }, this.openDurationMs);
    }
  }

  private async close(): Promise<void> {
    await this.opts.redis.del(this.stateKey, this.failureCountKey);
  }
}
