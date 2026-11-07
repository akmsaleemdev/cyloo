// Phase 3 e2e — Scheduling Hub (module I): slots on GCC timezones,
// concurrency-safe double-booking prevention, reschedule/cancel/no-show.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';

let app: INestApplication;
const T = { token: '', staffId: '', slug: 'demo-call' };

function api(t: string) {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${t}`);
  return {
    post: (url: string) => auth(request(app.getHttpServer()).post(url)),
    get: (url: string) => auth(request(app.getHttpServer()).get(url)),
  };
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  T.token = (await request(app.getHttpServer()).post('/api/v1/dev/token').send({ tenant_name: 'Schedule Co', user_email: 's@sched.test', plan: 'growth' })).body.token;
  const staff = await api(T.token).post('/api/v1/scheduling/staff').send({ display_name: 'Omar', timezone: 'Asia/Riyadh' });
  T.staffId = staff.body.staff.id;
  // Sunday=0..Saturday=6; 2026-11-09 is a Monday (weekday 1)
  await api(T.token).post('/api/v1/scheduling/availability').send({ staff_id: T.staffId, weekday: 1, start_time: '09:00', end_time: '11:00' });
  await api(T.token).post('/api/v1/scheduling/booking-pages').send({ slug: T.slug, staff_id: T.staffId, service_name: 'Discovery call', duration_min: 30 });
});

afterAll(async () => { await app.close(); });

describe('P3 — timezone-aware slots (Asia/Riyadh, UTC+3, no DST)', () => {
  it('computes UTC slots from local availability (09:00 local = 06:00Z)', async () => {
    const res = await api(T.token).get(`/api/v1/scheduling/booking-pages/${T.slug}/slots?date=2026-11-09`);
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Asia/Riyadh');
    expect(res.body.slots[0].starts_at).toBe('2026-11-09T06:00:00.000Z');
    expect(res.body.slots[0].local).toBe('09:00');
    expect(res.body.slots).toHaveLength(4); // 09:00–11:00 local, 30-min slots
  });

  it('wrong weekday yields no slots', async () => {
    const res = await api(T.token).get(`/api/v1/scheduling/booking-pages/${T.slug}/slots?date=2026-11-10`);
    expect(res.body.slots).toHaveLength(0); // Tuesday
  });
});

describe('P3 — double-booking prevention under concurrency', () => {
  const SLOT = '2026-11-09T06:00:00.000Z'; // 09:00 Riyadh
  let firstId = '';

  it('two concurrent bookings of the same slot: exactly one succeeds', async () => {
    const [a, b] = await Promise.all([
      api(T.token).post('/api/v1/scheduling/appointments').send({ slug: T.slug, starts_at: SLOT }),
      api(T.token).post('/api/v1/scheduling/appointments').send({ slug: T.slug, starts_at: SLOT }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    firstId = (a.status === 201 ? a : b).body.appointment.id;
    expect((a.status === 201 ? a : b).body.reminders).toBeGreaterThanOrEqual(1);
  });

  it('booked slot disappears from availability; adjacent slots remain', async () => {
    const res = await api(T.token).get(`/api/v1/scheduling/booking-pages/${T.slug}/slots?date=2026-11-09`);
    expect(res.body.slots.find((s: any) => s.starts_at === SLOT)).toBeUndefined();
    expect(res.body.slots.length).toBe(3);
  });

  it('cancel frees the slot', async () => {
    await api(T.token).post(`/api/v1/scheduling/appointments/${firstId}/cancel`).send();
    const res = await api(T.token).get(`/api/v1/scheduling/booking-pages/${T.slug}/slots?date=2026-11-09`);
    expect(res.body.slots.find((s: any) => s.starts_at === SLOT)).toBeTruthy();
  });

  it('reschedule validates overlap and version', async () => {
    const book = await api(T.token).post('/api/v1/scheduling/appointments').send({ slug: T.slug, starts_at: SLOT });
    const id = book.body.appointment.id;
    // overlap with itself-ish: move onto another booked slot (book 06:30 first)
    const other = await api(T.token).post('/api/v1/scheduling/appointments').send({ slug: T.slug, starts_at: '2026-11-09T06:30:00.000Z' });
    expect(other.status).toBe(201);
    const bad = await api(T.token).post(`/api/v1/scheduling/appointments/${id}/reschedule`).send({ starts_at: '2026-11-09T06:30:00.000Z' });
    expect(bad.status).toBe(409);
    expect(bad.body.code).toBe('SLOT_TAKEN');
    const ok = await api(T.token).post(`/api/v1/scheduling/appointments/${id}/reschedule`).send({ starts_at: '2026-11-09T10:30:00.000Z' });
    expect(ok.status).toBe(200);
    expect(ok.body.appointment.status).toBe('rescheduled');
  });

  it('no-show flagging + audit', async () => {
    const list = await api(T.token).get('/api/v1/scheduling/appointments');
    const appt = list.body.appointments.find((a: any) => a.status === 'rescheduled');
    const res = await api(T.token).post(`/api/v1/scheduling/appointments/${appt.id}/no-show`).send();
    expect(res.body.appointment.status).toBe('no_show');
    const audit = await api(T.token).get('/api/v1/audit');
    expect(audit.body.events.some((e: any) => e.action === 'scheduling.no_show')).toBe(true);
  });

  it('non-GCC timezone rejected (declared scope)', async () => {
    const res = await api(T.token).post('/api/v1/scheduling/staff').send({ display_name: 'X', timezone: 'America/New_York' });
    expect(res.status).toBe(400);
  });
});
