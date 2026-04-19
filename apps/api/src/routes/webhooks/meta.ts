import crypto from "node:crypto";
import { WebhookVerificationError } from "../../lib/errors.js";

export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string,
  appSecret: string
): void {
  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;

  const sigBuffer = Buffer.from(signatureHeader, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new WebhookVerificationError("Meta HMAC-SHA256 mismatch");
  }
}

export function extractMetaIdempotencyKey(
  signatureHeader: string,
  body: unknown
): string {
  // Use SHA-256 of the signature header as the idempotency key
  // This is stable: same payload + same secret = same signature
  const hash = crypto.createHash("sha256").update(signatureHeader).digest("hex");
  return hash;
}
