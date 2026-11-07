// Phase 4 — Workflow Engine (module K).
// Versioned definition DAGs triggered by domain events. Semantics (ADR-0010):
//   • at-least-once execution with idempotency keys (replay → no second run)
//   • bounded retries per step, then dead-letter + run 'failed'
//   • steps bind to the workflow VERSION that started the run
//   • dry-run produces the execution plan with zero side effects
//   • every run/step is auditable; inline execution here, BullMQ at cutover
import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { Db, badRequest, conflict, notFound } from '@crm/shared';
import { z } from 'zod';
import { Ctx, CtxOf } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';
import { DomainEvent, onDomainEvent } from './common/events.js';

const stepSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  type: z.enum(['condition', 'notify_user', 'create_task', 'update_contact', 'wait', 'webhook_out']),
  when: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(), // must reference a condition step
  config: z.record(z.string(), z.unknown()).default({}),
});
const definitionSchema = z.object({
  trigger: z.string().regex(/^[a-z0-9_.]{3,60}$/),
  steps: z.array(stepSchema).min(1).max(30),
});
type Definition = z.infer<typeof definitionSchema>;

const CONDITION_OPS = ['exists', 'equals', 'gt', 'lt'] as const;

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj);
}
function evalCondition(config: any, event: { payload: Record<string, unknown> }): boolean {
  const field = String(config.field ?? '');
  const op = String(config.op ?? 'exists');
  const actual = getPath({ payload: event.payload }, field);
  switch (op) {
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'equals': return String(actual) === String(config.value);
    case 'gt': return Number(actual) > Number(config.value);
    case 'lt': return Number(actual) < Number(config.value);
    default: return false;
  }
}

@Injectable()
export class WorkflowService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  latestDefinition(db: Db, tenantId: string, workflowId: string) {
    const wf = db.tget('workflows', tenantId, workflowId);
    if (!wf) throw notFound('Workflow not found');
    const version = db.tone('workflow_versions', tenantId, (v) => v.workflow_id === workflowId && v.version === wf.active_version)
      ?? db.tone('workflow_versions', tenantId, (v) => v.workflow_id === workflowId && v.version === wf.version);
    if (!version) throw notFound('Workflow version not found');
    return { wf, version };
  }

  // Execute (or plan) a workflow run for an event. Idempotent by key.
  execute(db: Db, tenantId: string, workflowId: string, event: { key: string; payload: Record<string, unknown> }, idempotencyKey: string, dryRun = false): { run_id?: string; duplicate?: boolean; status?: string; plan?: unknown[]; steps?: number } {
    const { wf, version } = this.latestDefinition(db, tenantId, workflowId);
    const def = version.definition as Definition;
    if (def.trigger !== event.key) throw badRequest(`Workflow triggers on "${def.trigger}", got "${event.key}"`, 'TRIGGER_MISMATCH');

    const dup = db.tone('workflow_runs', tenantId, (r) => r.idempotency_key === idempotencyKey);
    if (dup) return { run_id: dup.id, duplicate: true, status: dup.status as string };

    const plan: Array<Record<string, unknown>> = [];
    const conditionPassed = new Map<string, boolean>();

    if (dryRun) {
      for (const s of def.steps) {
        const gated = s.when ? conditionPassed.get(s.when) !== false : true; // plan assumes conditions pass
        plan.push({ step: s.id, type: s.type, would_execute: s.type === 'condition' ? undefined : gated });
        if (s.type === 'condition') conditionPassed.set(s.id, true); // optimistic plan
      }
      return { plan, steps: def.steps.length };
    }

    const run = db.insert('workflow_runs', {
      tenant_id: tenantId, workflow_id: workflowId, workflow_version: version.version,
      trigger: { key: event.key, payload: event.payload }, status: 'running', idempotency_key: idempotencyKey,
    });

    for (const s of def.steps) {
      if (s.when !== undefined && conditionPassed.get(s.when) === false) {
        db.insert('workflow_steps', { tenant_id: tenantId, run_id: run.id, node_id: s.id, kind: s.type, status: 'skipped' });
        continue;
      }
      let done = false;
      let lastError = '';
      for (let attempt = 1; attempt <= 2 && !done; attempt++) {
        try {
          plan.push({ step: s.id, type: s.type, attempt });
          switch (s.type) {
            case 'condition': {
              const ok = evalCondition(s.config, event);
              conditionPassed.set(s.id, ok);
              db.insert('workflow_steps', { tenant_id: tenantId, run_id: run.id, node_id: s.id, kind: s.type, status: ok ? 'succeeded' : 'skipped', output: { passed: ok } });
              done = true;
              break;
            }
            case 'notify_user': {
              const userId = (s.config.user_id as string) || this.ownerId(db, tenantId);
              db.insert('notifications', { tenant_id: tenantId, user_id: userId, kind: 'workflow_notify', payload: { run_id: run.id, workflow: wf.name, event: event.key } });
              done = true;
              break;
            }
            case 'create_task': {
              db.insert('tasks', { tenant_id: tenantId, title: String(s.config.title ?? `Workflow: ${wf.name}`), status: 'open', related_entity: 'workflow_run', related_id: run.id });
              done = true;
              break;
            }
            case 'update_contact': {
              const contactId = String(event.payload.contact_id ?? '');
              const patch: Record<string, unknown> = {};
              if (s.config.lifecycle_stage) patch.lifecycle_stage = s.config.lifecycle_stage;
              if (!contactId || !Object.keys(patch).length) throw new Error('update_contact requires payload.contact_id and a field to set');
              const contact = db.tget('contacts', tenantId, contactId);
              if (!contact) throw new Error(`contact ${contactId} not found`);
              db.update('contacts', contactId, patch);
              done = true;
              break;
            }
            case 'wait': {
              // Dev engine: recorded, non-blocking. BullMQ cutover uses real delays.
              done = true;
              break;
            }
            case 'webhook_out': {
              // Declared unconfigured in this environment (no egress allowlist
              // entry, no endpoint) — intentionally fails → exercises DLQ.
              throw new Error('webhook_out: no egress configured in this environment');
            }
          }
        } catch (e: any) {
          lastError = e?.message ?? String(e);
          if (attempt >= 2) {
            db.insert('workflow_steps', { tenant_id: tenantId, run_id: run.id, node_id: s.id, kind: s.type, status: 'dead', attempt, error: lastError });
            db.insert('dlq_entries', { tenant_id: tenantId, queue: 'workflow-steps', payload: { run_id: run.id, step: s.id, event }, error: lastError });
            db.update('workflow_runs', run.id, { status: 'failed', finished_at: new Date().toISOString() });
            return { run_id: run.id, status: 'failed', steps: def.steps.length };
          }
        }
      }
      if (done && s.type !== 'condition') {
        db.insert('workflow_steps', { tenant_id: tenantId, run_id: run.id, node_id: s.id, kind: s.type, status: 'succeeded', attempt: 1 });
      }
    }

    db.update('workflow_runs', run.id, { status: 'completed', finished_at: new Date().toISOString() });
    this.tenancy.audit(db, tenantId, null, 'workflow.completed', 'workflow_run', run.id, { workflow: wf.name });
    return { run_id: run.id, status: 'completed', steps: def.steps.length };
  }

  private ownerId(db: Db, tenantId: string): string {
    const owner = db.tone('memberships', tenantId, (m) => m.roles.includes('owner') && m.status === 'active');
    return owner?.user_id as string;
  }
}

// ---------------- controllers ----------------
@Controller('api/v1/workflows')
export class WorkflowsController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
    @Inject(WorkflowService) private workflows: WorkflowService,
  ) {}

  @Post()
  async create(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    name: z.string().min(1).max(80),
    definition: definitionSchema,
    active: z.boolean().default(true),
  }))) body: { name: string; definition: Definition; active: boolean }) {
    this.tenancy.requirePerm(ctx, 'operations.write');
    return this.st.tx((db) => {
      const wf = db.insert('workflows', { tenant_id: ctx.tenantId, name: body.name, trigger_event: body.definition.trigger, version: 1, active: body.active, definition: body.definition });
      const version = db.insert('workflow_versions', { tenant_id: ctx.tenantId, workflow_id: wf.id, version: 1, definition: body.definition, created_by: ctx.userId });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'workflow.created', 'workflow', wf.id, { name: body.name, trigger: body.definition.trigger });
      return { status: 201 as const, workflow: wf, version: version.version };
    });
  }

  // New version: previous runs keep their pinned version; new runs use this.
  @Post(':id/versions')
  async addVersion(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({ definition: definitionSchema }))) body: { definition: Definition }) {
    this.tenancy.requirePerm(ctx, 'operations.write');
    return this.st.tx((db) => {
      const wf = db.tget('workflows', ctx.tenantId, id);
      if (!wf) throw notFound('Workflow not found');
      const nextVersion = (wf.version as number) + 1;
      db.insert('workflow_versions', { tenant_id: ctx.tenantId, workflow_id: id, version: nextVersion, definition: body.definition, created_by: ctx.userId });
      db.update('workflows', id, { version: nextVersion, trigger_event: body.definition.trigger, definition: body.definition });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'workflow.version_added', 'workflow', id, { version: nextVersion });
      return { status: 201 as const, version: nextVersion };
    });
  }

  @Post(':id/dry-run')
  @HttpCode(200)
  async dryRun(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({
    event: z.object({ key: z.string().max(60), payload: z.record(z.string(), z.unknown()).default({}) }),
  }))) body: { event: { key: string; payload: Record<string, unknown> } }) {
    this.tenancy.requirePerm(ctx, 'operations.write');
    return this.st.tx((db) => this.workflows.execute(db, ctx.tenantId, id, body.event, `dryrun:${Date.now()}:${Math.random()}`, true));
  }

  @Get()
  async list(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'operations.read');
    return this.st.tx((db) => ({
      workflows: db.tfind('workflows', ctx.tenantId, () => true).map((w) => ({
        ...w, runs: db.tfind('workflow_runs', ctx.tenantId, (r) => r.workflow_id === w.id).length,
      })),
    }));
  }

  @Get('runs')
  async runs(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'operations.read');
    return this.st.tx((db) => ({
      runs: db.tfind('workflow_runs', ctx.tenantId, () => true).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0, 50)
        .map((r) => ({ ...r, steps: db.tfind('workflow_steps', ctx.tenantId, (s) => s.run_id === r.id) })),
    }));
  }

  // Direct event injection (integrations/tests); also the documented manual
  // replay path with a caller-supplied idempotency key.
  @Post('events')
  @HttpCode(200)
  async emitEvent(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    key: z.string().max(60),
    payload: z.record(z.string(), z.unknown()).default({}),
    idempotency_key: z.string().max(120).optional(),
  }))) body: { key: string; payload: Record<string, unknown>; idempotency_key?: string }) {
    this.tenancy.requirePerm(ctx, 'operations.write');
    return this.st.tx((db) => {
      const results: Array<Record<string, unknown>> = [];
      const wfs = db.tfind('workflows', ctx.tenantId, (w) => w.active && w.trigger_event === body.key);
      const key = body.idempotency_key ?? `${body.key}:${Date.now()}:${Math.random()}`;
      for (const wf of wfs) {
        results.push({ workflow: wf.name, ...this.workflows.execute(db, ctx.tenantId, wf.id, { key: body.key, payload: body.payload }, `${key}:${wf.id}`) });
      }
      return { matched: wfs.length, results };
    });
  }
}

@Module({
  controllers: [WorkflowsController],
  providers: [TenancyService, WorkflowService, { provide: STORE_TOKEN, useValue: store }],
})
export class WorkflowModule {
  // Subscribe to domain events emitted anywhere in the API.
  constructor(@Inject(WorkflowService) workflows: WorkflowService) {
    onDomainEvent((e: DomainEvent) => {
      void store.tx((db) => {
        const wfs = db.tfind('workflows', e.tenant_id, (w) => w.active && w.trigger_event === e.key);
        const idem = e.idempotency_key ?? `${e.key}:${JSON.stringify(e.payload).slice(0, 80)}`;
        for (const wf of wfs) {
          workflows.execute(db, e.tenant_id, wf.id, { key: e.key, payload: e.payload }, `${idem}:${wf.id}`);
        }
        return null;
      }).catch((err) => console.error('[workflow] event execution failed', err));
    });
  }
}
