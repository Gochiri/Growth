export interface MetaAppUsage {
  call_count: number;
  total_cputime: number;
  total_time: number;
}

export interface MetaWebhookEntry {
  id: string;
  time: number;
  changed_fields?: string[];
}

export interface MetaConversionEventData {
  event_name: string;
  event_time: number;
  event_id: string;
  event_source_url?: string;
  action_source?: string;
  user_data?: {
    em?: string[];
    ph?: string[];
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  };
  custom_data?: {
    currency?: string;
    value?: number;
    content_ids?: string[];
    content_type?: string;
    order_id?: string;
  };
}

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    messaging?: unknown[];
    changes?: Array<{
      field: string;
      value: unknown;
    }>;
  }>;
}

export type MetaRateLimitMode = "normal" | "slow" | "pause" | "open";

export interface MetaRateLimitState {
  mode: MetaRateLimitMode;
  maxUsagePct: number;
  updatedAt: number;
}
