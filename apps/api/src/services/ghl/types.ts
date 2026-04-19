export interface GhlWebhookPayload {
  type: string;
  locationId: string;
  id?: string;
  contactId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  pipelineStageName?: string;
  previousPipelineStageName?: string;
  opportunityId?: string;
  appointmentId?: string;
  monetaryValue?: number;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  dateAdded?: string;
  [key: string]: unknown;
}

export interface GhlContact {
  id: string;
  locationId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  tags?: string[];
  customField?: Record<string, unknown>[];
}

export interface GhlOpportunity {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  monetaryValue?: number;
  contactId: string;
}
