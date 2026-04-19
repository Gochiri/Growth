export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class WebhookVerificationError extends AppError {
  constructor(message = "Webhook signature verification failed") {
    super(message, 401, "WEBHOOK_VERIFICATION_FAILED");
    this.name = "WebhookVerificationError";
  }
}

export class DuplicateEventError extends AppError {
  constructor(idempotencyKey: string) {
    super(`Duplicate event: ${idempotencyKey}`, 200, "DUPLICATE_EVENT");
    this.name = "DuplicateEventError";
  }
}

export class RateLimitError extends AppError {
  constructor(service: string, retryAfterMs?: number) {
    super(`Rate limit reached for ${service}`, 429, "RATE_LIMIT");
    this.name = "RateLimitError";
    if (retryAfterMs !== undefined) {
      this.retryAfterMs = retryAfterMs;
    }
  }
  retryAfterMs?: number;
}

export class CircuitOpenError extends AppError {
  constructor(service: string) {
    super(`Circuit breaker open for ${service}`, 503, "CIRCUIT_OPEN");
    this.name = "CircuitOpenError";
  }
}
