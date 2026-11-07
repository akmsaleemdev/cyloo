// Zod validation schemas shared by API DTOs and web forms.
import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const currencySchema = z.enum(['AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'USD', 'EUR']);
export const moneyString = z.string().regex(/^-?\d{1,15}(\.\d{1,3})?$/, 'decimal string required');

export const contactCreate = z.object({
  first_name: z.string().min(1).max(80),
  last_name: z.string().max(80).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(24).optional(),
  company_id: z.string().uuid().optional(),
  job_title: z.string().max(120).optional(),
  owner_id: z.string().uuid().optional(),
});
export type ContactCreate = z.infer<typeof contactCreate>;

export const companyCreate = z.object({
  name: z.string().min(1).max(160),
  domain: z.string().max(120).optional(),
  industry: z.string().max(80).optional(),
  parent_company_id: z.string().uuid().optional(),
  trn: z.string().max(40).optional(),
});

export const customFieldDef = z.object({
  entity: z.enum(['contact', 'company', 'lead', 'opportunity']),
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().min(1).max(80),
  field_type: z.enum(['text', 'number', 'date', 'select', 'multiselect', 'boolean', 'url']),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export const leadCreate = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional(),
  phone: z.string().max(24).optional(),
  company_name: z.string().max(160).optional(),
  source_key: z.string().max(40).optional(),
  attribution: z.record(z.string(), z.string().max(200)).optional(), // utm_*, gclid…
});

export const opportunityCreate = z.object({
  pipeline_id: z.string().uuid(),
  name: z.string().min(1).max(160),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  amount: moneyString,
  currency: currencySchema.default('AED'),
  expected_close_date: z.string().date().optional(),
});

export const stageMove = z.object({
  stage_id: z.string().uuid(),
  row_version: z.number().int().optional(),
});

export const quoteCreate = z.object({
  opportunity_id: z.string().uuid().optional(),
  currency: currencySchema.default('AED'),
  discount_pct: z.number().min(0).max(100).default(0),
  lines: z.array(z.object({
    description: z.string().min(1).max(200),
    qty: z.number().positive().max(100000),
    unit_price: moneyString,
    tax_pct: z.number().min(0).max(100).default(0),
  })).min(1).max(100),
});

export const taskCreate = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(4000).optional(),
  assignee_id: z.string().uuid().optional(),
  due_at: z.string().datetime().optional(),
  related_entity: z.enum(['contact', 'company', 'lead', 'opportunity', 'ticket']).optional(),
  related_id: z.string().uuid().optional(),
}).refine((value) => Boolean(value.related_entity) === Boolean(value.related_id), {
  message: 'related_entity and related_id must be provided together',
});

export const DEFAULT_VAT_PCT: Record<string, number> = {
  AE: 5, SA: 15, QA: 10, KW: 0, BH: 10, OM: 5,
};
