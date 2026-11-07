// Module A — Customer 360 CRM: companies, contacts, custom fields,
// merge/dedupe, associations, timeline, segments, CSV export.
import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Db, StoreError, badRequest, companyCreate, conflict, contactCreate, customFieldDef, nextNumber, notFound, uuidSchema } from '@crm/shared';
import { z } from 'zod';
import { CtxOf, Ctx, Public } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';
import { Inject } from '@nestjs/common';
import { emitDomainEvent } from './common/events.js';

const mergeBody = z.object({ source_id: uuidSchema, target_id: uuidSchema });
const fieldValue = z.object({ value: z.union([z.string(), z.number(), z.boolean()]) });

@Controller('api/v1')
export class CrmController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  // ---------- companies ----------
  @Post('companies')
  async createCompany(@CtxOf() ctx: Ctx, @Body(new ZodPipe(companyCreate)) body: z.infer<typeof companyCreate>) {
    this.tenancy.requirePerm(ctx, 'crm.write');
    return this.st.tx((db) => {
      if (body.parent_company_id) {
        const parent = db.tget('companies', ctx.tenantId, body.parent_company_id);
        if (!parent) throw badRequest('parent_company_id not found in this workspace');
      }
      const company = db.insert('companies', { tenant_id: ctx.tenantId, ...body });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'crm.company_created', 'company', company.id, { name: company.name });
      this.tenancy.activity(db, ctx.tenantId, 'company', company.id, 'created', { name: company.name }, ctx);
      return { company };
    });
  }

  @Get('companies')
  async listCompanies(@CtxOf() ctx: Ctx, @Query('q') q?: string) {
    this.tenancy.requirePerm(ctx, 'crm.read');
    return this.st.tx((db) => {
      const visibleContacts = this.tenancy.filterByScope(ctx, 'crm', db.tfind('contacts', ctx.tenantId, () => true));
      const visibleCompanyIds = new Set(visibleContacts.map((contact) => contact.company_id).filter(Boolean));
      const companies = db.tfind('companies', ctx.tenantId, (company) =>
        (!q || String(company.name).toLowerCase().includes(q.toLowerCase())) &&
        (visibleCompanyIds.has(company.id) || this.tenancy.filterByScope(ctx, 'crm', [company]).length > 0));
      return { companies };
    });
  }

  @Get('companies/:id')
  async getCompany(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'crm.read');
    return this.st.tx((db) => {
      const company = db.tget('companies', ctx.tenantId, id);
      if (!company) throw notFound('Company not found');
      this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
      const contacts = db.tfind('contacts', ctx.tenantId, (c) => c.company_id === id && !c.merged_into);
      const visibleContacts = this.tenancy.filterByScope(ctx, 'crm', contacts);
      if (!visibleContacts.length && !this.tenancy.filterByScope(ctx, 'crm', [company]).length) throw notFound('Company not found');
      return { company, contacts: visibleContacts, timeline: this.tenancy.timeline(db, ctx.tenantId, 'company', id) };
    });
  }

  // ---------- CSV export (declared before /contacts/:id; permission-checked, bounded) ----------
  @Get('contacts/export.csv')
  async exportCsv(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'crm.read');
    this.tenancy.requirePerm(ctx, 'crm.export');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
    const rows = await this.st.tx((db) => this.tenancy.filterByScope(ctx, 'crm', db.tfind('contacts', ctx.tenantId, (c) => !c.merged_into)));
    const header = 'first_name,last_name,email,phone,stage';
    const csv = [header, ...rows.map((c) => [c.first_name, c.last_name, c.email, c.phone, c.lifecycle_stage].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    await this.st.tx((db) => this.tenancy.audit(db, ctx.tenantId, ctx, 'crm.contacts_exported', 'contact', null, { count: rows.length }));
    return csv;
  }

  // ---------- contacts ----------
  @Post('contacts')
  async createContact(@CtxOf() ctx: Ctx, @Body(new ZodPipe(contactCreate)) body: z.infer<typeof contactCreate>) {
    this.tenancy.requirePerm(ctx, 'crm.write');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'write');
    return this.st.tx((db) => {
      if (body.email) {
        const dup = db.tone('contacts', ctx.tenantId, (c) => c.email?.toLowerCase() === body.email!.toLowerCase() && !c.merged_into);
        if (dup) throw conflict('DUPLICATE_CONTACT', `A contact with email ${body.email} already exists`, { existing_id: dup.id });
      }
      if (body.company_id) {
        const company = db.tget('companies', ctx.tenantId, body.company_id);
        if (!company) throw badRequest('company_id not found in this workspace');
        this.tenancy.requireRecordAccess(ctx, 'crm', company, 'read');
      }
      if (body.owner_id) this.tenancy.requireAssignableMember(db, ctx, body.owner_id);
      const contact = db.insert('contacts', {
        tenant_id: ctx.tenantId, lifecycle_stage: 'lead', ...body,
        owner_id: body.owner_id ?? ctx.membershipId,
      });
      this.tenancy.activity(db, ctx.tenantId, 'contact', contact.id, 'created', { name: [body.first_name, body.last_name].filter(Boolean).join(' ') }, ctx);
      this.tenancy.meter(db, ctx.tenantId, 'contacts_created', 1);
      emitDomainEvent(ctx.tenantId, 'contact.created', { contact_id: contact.id, email: contact.email, first_name: contact.first_name });
      return { status: 201 as const, contact };
    });
  }

  @Get('contacts')
  async listContacts(@CtxOf() ctx: Ctx, @Query() q: Record<string, string>) {
    this.tenancy.requirePerm(ctx, 'crm.read');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
    return this.st.tx((db) => {
      let rows = this.tenancy.filterByScope(ctx, 'crm', db.tfind('contacts', ctx.tenantId, (c) => !c.merged_into));
      if (q.stage) rows = rows.filter((c) => c.lifecycle_stage === q.stage);
      if (q.company_id) rows = rows.filter((c) => c.company_id === q.company_id);
      if (q.q) {
        const s = q.q.toLowerCase();
        rows = rows.filter((c) => `${c.first_name ?? ''} ${c.last_name ?? ''} ${c.email ?? ''}`.toLowerCase().includes(s));
      }
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;
      return { contacts: rows.slice(offset, offset + limit), total: rows.length };
    });
  }

  @Get('contacts/:id')
  async getContact(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'crm.read');
    return this.st.tx((db) => {
      const contact = db.tget('contacts', ctx.tenantId, id);
      if (!contact) throw notFound('Contact not found');
      this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
      this.tenancy.requireRecordAccess(ctx, 'crm', contact, 'read');
      const company = contact.company_id ? db.tget('companies', ctx.tenantId, contact.company_id as string) : null;
      const customFields = db.tfind('custom_field_values', ctx.tenantId, (v) => v.entity_id === id);
      return {
        contact, company,
        custom_fields: customFields,
        timeline: this.tenancy.timeline(db, ctx.tenantId, 'contact', id),
        merged: contact.merged_into ? { merged_into: contact.merged_into } : null,
      };
    });
  }

  @Patch('contacts/:id')
  async updateContact(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(contactCreate.partial())) body: Partial<z.infer<typeof contactCreate>>) {
    this.tenancy.requirePerm(ctx, 'crm.write');
    return this.st.tx((db) => {
      const contact = db.tget('contacts', ctx.tenantId, id);
      if (!contact || contact.merged_into) throw notFound('Contact not found');
      this.tenancy.requireSensitivePermission(ctx, 'customer', 'write');
      this.tenancy.requireRecordAccess(ctx, 'crm', contact, 'write');
      if (body.owner_id) this.tenancy.requireAssignableMember(db, ctx, body.owner_id);
      if (body.company_id) {
        const company = db.tget('companies', ctx.tenantId, body.company_id);
        if (!company) throw badRequest('company_id not found in this workspace');
        this.tenancy.requireRecordAccess(ctx, 'crm', company, 'read');
      }
      const updated = db.update('contacts', id, body, body ? undefined : undefined);
      this.tenancy.activity(db, ctx.tenantId, 'contact', id, 'updated', { fields: Object.keys(body) }, ctx);
      return { contact: updated };
    });
  }

  // ---------- merge (dedupe preserves history) ----------
  @Post('contacts/merge')
  async merge(@CtxOf() ctx: Ctx, @Body(new ZodPipe(mergeBody)) body: z.infer<typeof mergeBody>) {
    this.tenancy.requirePerm(ctx, 'crm.write');
    return this.st.tx((db) => {
      if (body.source_id === body.target_id) throw badRequest('Cannot merge a contact into itself');
      const source = db.tget('contacts', ctx.tenantId, body.source_id);
      const target = db.tget('contacts', ctx.tenantId, body.target_id);
      if (!source || !target || source.merged_into || target.merged_into) throw notFound('Contact not found');
      this.tenancy.requireSensitivePermission(ctx, 'customer', 'write');
      this.tenancy.requireRecordAccess(ctx, 'crm', source, 'write');
      this.tenancy.requireRecordAccess(ctx, 'crm', target, 'write');
      db.update('contacts', source.id, { merged_into: target.id, lifecycle_stage: 'other' });
      this.tenancy.activity(db, ctx.tenantId, 'contact', target.id, 'merge', { source_id: source.id }, ctx);
      this.tenancy.audit(db, ctx.tenantId, ctx, 'crm.contact_merged', 'contact', target.id, { source_id: source.id });
      return { ok: true, target_id: target.id };
    });
  }

  // ---------- custom fields ----------
  @Post('custom-fields')
  async defineField(@CtxOf() ctx: Ctx, @Body(new ZodPipe(customFieldDef)) body: z.infer<typeof customFieldDef>) {
    this.tenancy.requirePerm(ctx, 'crm.write');
    return this.st.tx((db) => {
      const def = db.insert('custom_field_definitions', { tenant_id: ctx.tenantId, ...body });
      return { definition: def };
    });
  }

  @Post('contacts/:id/fields/:defId')
  async setFieldValue(@CtxOf() ctx: Ctx, @Param('id') id: string, @Param('defId') defId: string, @Body(new ZodPipe(fieldValue)) body: { value: string | number | boolean }) {
    this.tenancy.requirePerm(ctx, 'crm.write');
    return this.st.tx((db) => {
      const contact = db.tget('contacts', ctx.tenantId, id);
      if (!contact) throw notFound('Contact not found');
      this.tenancy.requireSensitivePermission(ctx, 'customer', 'write');
      this.tenancy.requireRecordAccess(ctx, 'crm', contact, 'write');
      const def = db.tget('custom_field_definitions', ctx.tenantId, defId);
      if (!def) throw badRequest('Unknown field definition');
      if (def.required && (body.value === '' || body.value === null)) {
        throw new StoreError(422, 'FIELD_REQUIRED', `${def.label} is required`);
      }
      if (def.field_type === 'number' && typeof body.value !== 'number') throw badRequest('number expected');
      if (def.field_type === 'boolean' && typeof body.value !== 'boolean') throw badRequest('boolean expected');
      if (def.field_type === 'select' && def.options && !def.options.includes(body.value)) throw badRequest('value not in options');
      const existing = db.tone('custom_field_values', ctx.tenantId, (v) => v.definition_id === defId && v.entity_id === id);
      const row = existing
        ? db.update('custom_field_values', existing.id, { [`value_${def.field_type === 'multiselect' ? 'json' : def.field_type}`]: body.value })
        : db.insert('custom_field_values', { tenant_id: ctx.tenantId, definition_id: defId, entity_id: id, [`value_${def.field_type === 'multiselect' ? 'json' : def.field_type}`]: body.value });
      return { value: row };
    });
  }

  // ---------- segments (saved filters) ----------
  @Post('segments')
  async createSegment(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ name: z.string().min(1).max(80), filters: z.record(z.string(), z.string()) }))) body: { name: string; filters: Record<string, string> }) {
    this.tenancy.requirePerm(ctx, 'crm.read');
    return this.st.tx((db) => ({ segment: db.insert('segments', { tenant_id: ctx.tenantId, name: body.name, filters: body.filters, entity: 'contact', created_by: ctx.userId }) }));
  }

  @Get('segments/:id/members')
  async segmentMembers(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'crm.read');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
    return this.st.tx((db) => {
      const seg = db.tget('segments', ctx.tenantId, id);
      if (!seg) throw notFound('Segment not found');
      const f = seg.filters as Record<string, string>;
      const rows = this.tenancy.filterByScope(ctx, 'crm', db.tfind('contacts', ctx.tenantId, (c) =>
        !c.merged_into &&
        (!f.stage || c.lifecycle_stage === f.stage) &&
        (!f.company_id || c.company_id === f.company_id)));
      return { members: rows, count: rows.length };
    });
  }

}

@Module({
  controllers: [CrmController],
  providers: [TenancyService, { provide: STORE_TOKEN, useValue: store }],
})
export class CrmModule {}
