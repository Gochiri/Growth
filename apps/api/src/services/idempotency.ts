import type { Redis } from "ioredis";
import type { WebhookSource } from "@growth/types";

const TTL_SECONDS = 86_400; // 24 hours

export class IdempotencyStore {
  constructor(private readonly redis: Redis) {}

  async acquireLock(source: WebhookSource, key: string): Promise<boolean> {
    const redisKey = `idempotency:webhook:${source}:${key}`;
    const result = await this.redis.set(redisKey, "1", "EX", TTL_SECONDS, "NX");
    return result === "OK";
  }
}
