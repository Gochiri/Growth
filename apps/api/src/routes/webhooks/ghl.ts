import crypto from "node:crypto";
import { WebhookVerificationError } from "../../lib/errors.js";

export function verifyGhlSignature(
  signatureHeader: string,
  webhookSecret: string
): void {
  const secretBuffer = Buffer.from(webhookSecret, "utf8");
  const headerBuffer = Buffer.from(signatureHeader, "utf8");

  if (
    secretBuffer.length !== headerBuffer.length ||
    !crypto.timingSafeEqual(secretBuffer, headerBuffer)
  ) {
    throw new WebhookVerificationError("GHL shared-secret mismatch");
  }
}

export function extractGhlIdempotencyKey(body: Record<string, unknown>): string {
  // GHL sends an event ID in the payload
  const eventId =
    (body["id"] as string | undefined) ??
    (body["event_id"] as string | undefined);

  if (eventId) return eventId;

  // Fallback: hash the body
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
}
