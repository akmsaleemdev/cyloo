// Phase 3 — Scheduling Hub (module I): staff calendars, availability rules,
// booking pages, timezone-aware slots (GCC fixed offsets — no DST), concurrency-
// safe double-booking prevention, reschedule/cancel/no-show, queued reminders.
// Google/Microsoft calendar sync is Phase 5 and stays unconfigured (declared).
import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Db, badRequest, conflict, notFound, unprocessable, uuidSchema } from '@crm/shared';
import { z } from 'zod';
import { Ctx, CtxOf } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';

// GCC timezones are UTC+3/+4 year-round (no DST) — fixed offsets are exact here.
export const TZ_OFFSET_HOURS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Riyadh': 3, 'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3, 'Asia/Muscat': 4,
};

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

@Injectable()
export class SchedulingService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  // Booked/hold statuses that occupy a slot. cancelled + no_show free the slot.
  static BLOCKING = new Set(['confirmed', 'rescheduled', 'completed']);

  async assertFree(db: Db, tenantId: string, staffId: string, startsAt: string, endsAt: string, ignoreId?: string) {
    const booked = db.tfind('appointments', tenantId, (a) =>
      a.staff_id === staffId && SchedulingService.BLOCKING.has(a.status as string) && a.id !== ignoreId);
    for (const b of booked) {
      if (overlaps(startsAt, endsAt, b.starts_at as string, b.ends_at as string)) {
        throw conflict('SLOT_TAKEN', 'That time overlaps another appointment for this staff member.', { appointment_id: b.id });
      }
    }
  }

  addReminders(db: Db, tenantId: string, appointmentId: string, startsAt: string) {
    const start = new Date(startsAt).getTime();
    for (const [label, deltaMs] of [['24h', 24 * 3600_000], ['1h', 3600_000]] as const) {
      const sendAt = new Date(start - deltaMs).toISOString();
      if (sendAt > new Date().toISOString()) {
        db.insert('appointment_reminders', { tenant_id: tenantId, appointment_id: appointmentId, channel_kind: 'webchat', send_at: sendAt, status: 'queued', meta: { label } });
      }
    }
  }

  // Open slots for a date, in staff-local time, excluding blocked appointments.
  slotsFor(db: Db, tenantId: string, staff: any, rules: any[], dateStr: string, durationMin: number, timezone: string) {
    const offset = TZ_OFFSET_HOURS[timezone] ?? 4;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) throw badRequest('date must be YYYY-MM-DD');
    const localNoon = new Date(Date.UTC(y, m - 1, d, 12) - offset * 3600_000);
    const weekday = localNoon.getUTCDay(); // 0=Sun
    const dayRules = rules.filter((r) => r.weekday === weekday);
    const booked = db.tfind('appointments', tenantId, (a) =>
      a.staff_id === staff.id && SchedulingService.BLOCKING.has(a.status as string));
    const slots: Array<{ starts_at: string; ends_at: string; local: string }> = [];
    for (const rule of dayRules) {
      const [sh, sm] = String(rule.start_time).split(':').map(Number);
      const [eh, em] = String(rule.end_time).split(':').map(Number);
      let t = Date.UTC(y, m - 1, d, sh, sm) - offset * 3600_000;
      const end = Date.UTC(y, m - 1, d, eh, em) - offset * 3600_000;
      while (t + durationMin * 60_000 <= end) {
        const startsAt = new Date(t).toISOString();
        const endsAt = new Date(t + durationMin * 60_000).toISOString();
        const clash = booked.some((b) => overlaps(startsAt, endsAt, b.starts_at as string, b.ends_at as string));
        if (!clash) {
          const localDate = new Date(t + offset * 3600_000);
          slots.push({ starts_at: startsAt, ends_at: endsAt, local: localDate.toISOString().slice(11, 16) });
        }
        t += durationMin * 60_000;
      }
    }
    return slots;
  }
}

const staffBody = z.object({ display_name: z.string().min(1).max(80), timezone: z.string().max(40).default('Asia/Dubai') });

@Controller('api/v1/scheduling')
export class SchedulingController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
    @Inject(SchedulingService) private sched: SchedulingService,
  ) {}

  @Post('staff')
  async addStaff(@CtxOf() ctx: Ctx, @Body(new ZodPipe(staffBody)) body: z.infer<typeof staffBody>) {
    this.tenancy.requirePerm(ctx, 'scheduling.write');
    if (!TZ_OFFSET_HOURS[body.timezone]) throw badRequest(`Unsupported timezone ${body.timezone} (GCC timezones only in this build)`);
    return this.st.tx((db) => ({ status: 201 as const, staff: db.insert('staff', { tenant_id: ctx.tenantId, ...body }) }));
  }

  @Post('availability')
  async addAvailability(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    staff_id: uuidSchema,
    weekday: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
  }))) body: { staff_id: string; weekday: number; start_time: string; end_time: string }) {
    this.tenancy.requirePerm(ctx, 'scheduling.write');
    return this.st.tx((db) => {
      const staff = db.tget('staff', ctx.tenantId, body.staff_id);
      if (!staff) throw badRequest('staff_id not found');
      if (body.start_time >= body.end_time) throw unprocessable('INVALID_RANGE', 'start_time must be before end_time');
      return { status: 201 as const, rule: db.insert('availability_rules', { tenant_id: ctx.tenantId, ...body }) };
    });
  }

  @Post('booking-pages')
  async createPage(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
    staff_id: uuidSchema,
    service_name: z.string().min(1).max(80),
    duration_min: z.number().int().min(10).max(480).default(30),
  }))) body: { slug: string; staff_id: string; service_name: string; duration_min: number }) {
    this.tenancy.requirePerm(ctx, 'scheduling.write');
    return this.st.tx((db) => {
      const staff = db.tget('staff', ctx.tenantId, body.staff_id);
      if (!staff) throw badRequest('staff_id not found');
      return { status: 201 as const, page: db.insert('booking_pages', { tenant_id: ctx.tenantId, ...body, is_active: true }) };
    });
  }

  @Get('booking-pages/:slug/slots')
  async slots(@CtxOf() ctx: Ctx, @Param('slug') slug: string, @Query('date') date: string) {
    this.tenancy.requirePerm(ctx, 'scheduling.read');
    return this.slotsImpl(ctx.tenantId, slug, date ?? '');
  }

  private async slotsImpl(tenantId: string, slug: string, date: string) {
    return this.st.tx((db) => {
      const page = db.tone('booking_pages', tenantId, (p) => p.slug === slug && p.is_active);
      if (!page) throw notFound('Booking page not found');
      const staff = db.tget('staff', tenantId, page.staff_id as string);
      if (!staff) throw notFound('Staff not found');
      const rules = db.tfind('availability_rules', tenantId, (r) => r.staff_id === staff.id);
      return { page: { slug: page.slug, service_name: page.service_name, duration_min: page.duration_min }, timezone: staff.timezone, slots: this.sched.slotsFor(db, tenantId, staff, rules, date, page.duration_min as number, staff.timezone as string) };
    });
  }

  @Post('appointments')
  async book(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    slug: z.string().max(40),
    starts_at: z.string().datetime(),
    contact_id: uuidSchema.optional(),
    notes: z.string().max(500).optional(),
  }))) body: { slug: string; starts_at: string; contact_id?: string; notes?: string }) {
    this.tenancy.requirePerm(ctx, 'scheduling.write');
    return this.st.tx(async (db) => {
      const page = db.tone('booking_pages', ctx.tenantId, (p) => p.slug === body.slug && p.is_active);
      if (!page) throw notFound('Booking page not found');
      const staff = db.tget('staff', ctx.tenantId, page.staff_id as string);
      const duration = (page.duration_min as number) * 60_000;
      const startsAt = new Date(body.starts_at).toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + duration).toISOString();
      // Serialized tx (PgStore: SELECT … FOR UPDATE / unique exclusion at cutover):
      // double-booking is impossible under concurrency.
      await this.sched.assertFree(db, ctx.tenantId, staff!.id, startsAt, endsAt);
      const appt = db.insert('appointments', {
        tenant_id: ctx.tenantId, booking_page_id: page.id, contact_id: body.contact_id ?? null,
        staff_id: staff!.id, starts_at: startsAt, ends_at: endsAt, status: 'confirmed',
        timezone: staff!.timezone, notes: body.notes ?? null,
      });
      this.sched.addReminders(db, ctx.tenantId, appt.id, startsAt);
      this.tenancy.audit(db, ctx.tenantId, ctx, 'scheduling.booked', 'appointment', appt.id, { slug: body.slug });
      return { status: 201 as const, appointment: appt, reminders: db.tfind('appointment_reminders', ctx.tenantId, (r) => r.appointment_id === appt.id).length };
    });
  }

  @HttpCode(200)
  @Post('appointments/:id/reschedule')
  async reschedule(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({ starts_at: z.string().datetime(), row_version: z.number().int().optional() }))) body: { starts_at: string; row_version?: number }) {
    this.tenancy.requirePerm(ctx, 'scheduling.write');
    return this.st.tx(async (db) => {
      const appt = db.tget('appointments', ctx.tenantId, id);
      if (!appt) throw notFound('Appointment not found');
      if (appt.status === 'cancelled') throw conflict('CANCELLED', 'Reschedule a cancelled appointment by booking again.');
      const duration = new Date(appt.ends_at as string).getTime() - new Date(appt.starts_at as string).getTime();
      const startsAt = new Date(body.starts_at).toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + duration).toISOString();
      await this.sched.assertFree(db, ctx.tenantId, appt.staff_id as string, startsAt, endsAt, id);
      const updated = db.update('appointments', id, { starts_at: startsAt, ends_at: endsAt, status: 'rescheduled' }, body.row_version);
      // re-queue reminders for the new time
      this.sched.addReminders(db, ctx.tenantId, id, startsAt);
      this.tenancy.audit(db, ctx.tenantId, ctx, 'scheduling.rescheduled', 'appointment', id, { starts_at: startsAt });
      return { appointment: updated };
    });
  }

  @Post('appointments/:id/cancel')
  async cancel(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'scheduling.write');
    return this.st.tx((db) => {
      const appt = db.tget('appointments', ctx.tenantId, id);
      if (!appt) throw notFound('Appointment not found');
      if (appt.status === 'cancelled') throw conflict('ALREADY_CANCELLED', 'Appointment already cancelled');
      const updated = db.update('appointments', id, { status: 'cancelled' });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'scheduling.cancelled', 'appointment', id, {});
      return { appointment: updated };
    });
  }

  @Post('appointments/:id/no-show')
  async noShow(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'scheduling.write');
    return this.st.tx((db) => {
      const appt = db.tget('appointments', ctx.tenantId, id);
      if (!appt) throw notFound('Appointment not found');
      if (!['confirmed', 'rescheduled'].includes(appt.status as string)) throw conflict('INVALID_STATE', `Cannot mark ${appt.status} as no-show`);
      const updated = db.update('appointments', id, { status: 'no_show' });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'scheduling.no_show', 'appointment', id, {});
      return { appointment: updated };
    });
  }

  @Get('appointments')
  async list(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'scheduling.read');
    return this.st.tx((db) => ({ appointments: db.tfind('appointments', ctx.tenantId, () => true).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))) }));
  }
}

@Module({
  controllers: [SchedulingController],
  providers: [TenancyService, SchedulingService, { provide: STORE_TOKEN, useValue: store }],
})
export class SchedulingModule {}
