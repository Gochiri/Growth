/**
 * Utility to generate the x-hub-signature-256 header for testing Meta webhooks locally.
 * Usage: npx tsx src/scripts/generate-webhook-hmac.ts <path-to-fixture.json>
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error("Usage: npx tsx generate-webhook-hmac.ts <fixture.json>");
  process.exit(1);
}

const secret = process.env["META_APP_SECRET"];
if (!secret) {
  console.error("META_APP_SECRET env var required");
  process.exit(1);
}

const body = readFileSync(resolve(fixturePath), "utf8");
const sig = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

console.log(`\nSignature header:\n  x-hub-signature-256: ${sig}`);
console.log(`\nTest command:`);
console.log(`  curl -X POST http://localhost:3001/webhooks/ingest \\`);
console.log(`    -H "x-webhook-source: meta" \\`);
console.log(`    -H "x-hub-signature-256: ${sig}" \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d @${fixturePath}`);
