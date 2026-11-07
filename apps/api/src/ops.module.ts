// Module L — Operations: tasks, notifications, audit search.
import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { badRequest, notFound, taskCreate, uuidSchema } from '@crm/shared';
import { z } from 'zod';
import { Inject } from '@nestjs/common';
import { Ctx, CtxOf } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';

const taskPatch = z.object({ status: z.enum(['open', 'done', 'cancelled']), row_version: z.number().int().optional() });

@Controller('api/v1')
export class OpsController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Post('tasks')
  async create(@CtxOf() ctx: Ctx, @Body(new ZodPipe(taskCreate)) body: z.infer<typeof taskCreate>) {
    this.tenancy.requirePerm(ctx, 'operations.write');
    return this.st.tx((db) => {
      if (body.related_entity && body.related_id) {
        const relatedResource = {
          contact: ['contacts', 'crm'],
          company: ['companies', 'crm'],
          lead: ['leads', 'leads'],
          opportunity: ['opportunities', 'sales'],
          ticket: ['tickets', 'service'],
        } as const;
        const [table, resource] = relatedResource[body.related_entity];
        const related = db.tget(table, ctx.tenantId, body.related_id);
        if (!related) throw badRequest('Related record not found in this workspace');
        this.tenancy.requireRecordAccess(ctx, resource, related, 'read');
      }
      const assigneeId = body.assignee_id ?? ctx.membershipId;
      this.tenancy.requireAssignableMember(db, ctx, assigneeId);
      const assignee = db.tget('memberships', ctx.tenantId, assigneeId);
      const task = db.insert('tasks', {
        tenant_id: ctx.tenantId, ...body, assignee_id: assigneeId,
        department_id: ctx.departmentId ?? null, team_id: ctx.teamIds?.[0] ?? null, status: 'open',
      });
      if (assignee && assignee.id !== ctx.membershipId) {
        db.insert('notifications', { tenant_id: ctx.tenantId, user_id: assignee.user_id, kind: 'task_assigned', payload: { task_id: task.id, title: task.title, by: ctx.userId } });
      }
      this.tenancy.audit(db, ctx.tenantId, ctx, 'ops.task_created', 'task', task.id, { title: task.title });
      return { status: 201 as const, task };
    });
  }

  @Get('tasks')
  async list(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'operations.read');
    return this.st.tx((db) => ({
      tasks: this.tenancy.filterByScope(ctx, 'operations', db.tfind('tasks', ctx.tenantId, () => true))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }));
  }

  @Patch('tasks/:id')
  async updateStatus(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(taskPatch)) body: z.infer<typeof taskPatch>) {
    this.tenancy.requirePerm(ctx, 'operations.write');
    return this.st.tx((db) => {
      const task = db.tget('tasks', ctx.tenantId, id);
      if (!task) throw notFound('Task not found');
      this.tenancy.requireRecordAccess(ctx, 'operations', task, 'write');
      const updated = db.update('tasks', id, { status: body.status }, body.row_version);
      if (body.status === 'done' && task.assignee_id && ![ctx.userId, ctx.membershipId].includes(task.assignee_id as string)) {
        // notify the assignee that their task was completed by someone else
        const assignee = db.tget('memberships', ctx.tenantId, task.assignee_id as string);
        if (assignee) db.insert('notifications', { tenant_id: ctx.tenantId, user_id: assignee.user_id, kind: 'task_completed', payload: { task_id: id } });
      }
      return { task: updated };
    });
  }

  @Get('notifications')
  async myNotifications(@CtxOf() ctx: Ctx) {
    return this.st.tx((db) => ({ notifications: db.tfind('notifications', ctx.tenantId, (n) => n.user_id === ctx.userId).sort((a, b) => b.created_at.localeCompare(a.created_at)) }));
  }

  @Get('audit')
  async auditSearch(@CtxOf() ctx: Ctx, @Param() _p: Record<string, string>) {
    this.tenancy.requirePerm(ctx, 'operations.read');
    return this.st.tx((db) => ({ events: db.tfind('audit_events', ctx.tenantId, () => true).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100) }));
  }
}

@Module({
  controllers: [OpsController],
  providers: [TenancyService, { provide: STORE_TOKEN, useValue: store }],
})
export class OpsModule {}
