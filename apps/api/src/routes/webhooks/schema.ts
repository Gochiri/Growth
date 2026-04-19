import { z } from "zod";

export const webhookSourceSchema = z.enum(["meta", "ghl", "instagram"]);

export const webhookHeadersSchema = z.object({
  "x-webhook-source": webhookSourceSchema,
  "x-hub-signature-256": z.string().optional(),
  "x-ghl-signature": z.string().optional(),
});

export type WebhookHeaders = z.infer<typeof webhookHeadersSchema>;
