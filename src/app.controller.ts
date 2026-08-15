import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, AuthUser, buildPlan, consumeAuthCode, consumeOauthState, createAuthCode, createClientAccount, createOauthState, db, findUserByEmail, issueSession, localizeWorkouts, revokeSession, seedAccounts, seedCalendarSessions, seedDeliveries, seedIfEmpty, userForToken } from './db';

seedIfEmpty();
seedDeliveries();
seedCalendarSessions();
seedAccounts();

const parse = <T>(value: string): T => JSON.parse(value) as T;
const GOOGLE_CLIENT_ID = '104438311483-qv0m9d3lmuq29nbefgo9bjuagg448ft7.apps.googleusercontent.com';

const calendarSelect = `SELECT sessions.*, clients.name AS client_name, clients.initials AS client_initials
  FROM sessions JOIN clients ON clients.id = sessions.client_id`;

function sessionOverlap(clientId: number, date: string, startTime: string, duration: number, excludeId?: number): any | undefined {
  const start = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
  const end = start + duration;
  const rows = db.prepare(`${calendarSelect} WHERE sessions.client_id = ? AND sessions.scheduled_date = ? AND sessions.status != 'cancelled'${excludeId ? ' AND sessions.id != ?' : ''}`).all(...(excludeId ? [clientId, date, excludeId] : [clientId, date])) as any[];
  return rows.find((row) => {
    const rowStart = Number(row.start_time.slice(0, 2)) * 60 + Number(row.start_time.slice(3, 5));
    const rowEnd = rowStart + Number(row.duration || 0);
    return start < rowEnd && end > rowStart;
  });
}

function releaseScheduledDeliveries(): void {
  db.prepare("UPDATE plan_deliveries SET status = 'sent', sent_at = COALESCE(sent_at, available_at) WHERE status = 'scheduled' AND available_at <= ?")
    .run(new Date().toISOString());
}

function tokenFrom(request: FastifyRequest): string {
  const value = request.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}
function requireUser(request: FastifyRequest): AuthUser {
  const user = userForToken(tokenFrom(request));
  if (!user) throw new UnauthorizedException('Please sign in to continue.');
  return user;
}
function requireTrainer(request: FastifyRequest): AuthUser {
  const user = requireUser(request);
  if (user.role !== 'trainer') throw new UnauthorizedException('Trainer access is required.');
  return user;
}
function appOrigin(request: FastifyRequest): string {
  const protocol = String(request.headers['x-forwarded-proto'] || request.protocol || 'http').split(',')[0];
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || 'localhost:3000').split(',')[0];
  return `${protocol}://${host}`;
}

@Controller('api')
export class AppController {
  @Get('health')
  health() {
    return { ok: true };
  }

  @Post('auth/login')
  login(@Body() body: { email?: string; password?: string }) {
    const user = authenticate(String(body?.email || ''), String(body?.password || ''));
    if (!user) throw new UnauthorizedException('Email or password is incorrect.');
    return { token: issueSession(user.id), user };
  }

  @Get('auth/google')
  beginGoogle(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!process.env.GOOGLE_CLIENT_SECRET) throw new BadRequestException('Google sign-in is not configured yet.');
    const redirectUri = `${appOrigin(request)}/api/auth/google/callback`;
    const state = createOauthState(redirectUri);
    const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    target.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    target.searchParams.set('redirect_uri', redirectUri);
    target.searchParams.set('response_type', 'code');
    target.searchParams.set('scope', 'openid email profile');
    target.searchParams.set('state', state);
    target.searchParams.set('prompt', 'select_account');
    return reply.code(302).redirect(target.toString());
  }

  @Get('auth/google/callback')
  async finishGoogle(@Req() request: FastifyRequest, @Res() reply: FastifyReply, @Query('code') code?: string, @Query('state') state?: string, @Query('error') error?: string) {
    const redirectUri = state ? consumeOauthState(state) : null;
    const loginUrl = new URL('/login', appOrigin(request));
    if (!redirectUri || !code || error) { loginUrl.searchParams.set('sso_error', 'cancelled'); return reply.code(302).redirect(loginUrl.toString()); }
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET || '', redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
    if (!tokenResponse.ok) { loginUrl.searchParams.set('sso_error', 'failed'); return reply.code(302).redirect(loginUrl.toString()); }
    const tokens = await tokenResponse.json() as { access_token?: string };
    if (!tokens.access_token) { loginUrl.searchParams.set('sso_error', 'failed'); return reply.code(302).redirect(loginUrl.toString()); }
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json() as { email?: string; email_verified?: boolean };
    const user = profile.email && profile.email_verified ? findUserByEmail(profile.email) : null;
    if (!user) { loginUrl.searchParams.set('sso_error', 'not_allowed'); return reply.code(302).redirect(loginUrl.toString()); }
    loginUrl.searchParams.set('code', createAuthCode(user.id));
    return reply.code(302).redirect(loginUrl.toString());
  }

  @Post('auth/exchange')
  exchange(@Body() body: { code?: string }) {
    const user = consumeAuthCode(String(body?.code || ''));
    if (!user) throw new UnauthorizedException('This sign-in link has expired.');
    return { token: issueSession(user.id), user };
  }

  @Get('auth/me')
  me(@Req() request: FastifyRequest) { return requireUser(request); }

  @Post('auth/logout')
  logout(@Req() request: FastifyRequest) { revokeSession(tokenFrom(request)); return { ok: true }; }

  @Get('state')
  getState(@Req() request: FastifyRequest) {
    requireTrainer(request);
    releaseScheduledDeliveries();
    const clients = db.prepare('SELECT * FROM clients ORDER BY name').all() as any[];
    const sessionRows = db.prepare('SELECT client_id, status, COUNT(*) count FROM sessions GROUP BY client_id, status').all() as any[];
    const summaries = new Map<number, Record<string, number>>();
    sessionRows.forEach((row) => summaries.set(row.client_id, { ...(summaries.get(row.client_id) || {}), [row.status]: row.count }));
    const plans = db.prepare('SELECT id, client_id, status, week_label FROM plans WHERE id IN (SELECT MAX(id) FROM plans GROUP BY client_id)').all() as any[];
    const deliveries = db.prepare('SELECT client_id, plan_id, status, available_at, viewed_at, confirmed_at FROM plan_deliveries').all() as any[];
    const today = new Date().toISOString().slice(0, 10);
    const todaySchedule = db.prepare(`${calendarSelect} WHERE sessions.scheduled_date = ? ORDER BY sessions.start_time`).all(today);
    return { clients: clients.map((client) => ({ ...client, sessions: summaries.get(client.id) || {}, plan: plans.find((plan) => plan.client_id === client.id) || null, delivery: deliveries.find((delivery) => delivery.client_id === client.id) || null })), todaySchedule };
  }

  @Get('schedule')
  getSchedule(@Req() request: FastifyRequest) {
    requireTrainer(request);
    return db.prepare(`${calendarSelect} ORDER BY sessions.scheduled_date, sessions.start_time`).all();
  }

  @Post('schedule')
  createSchedule(@Req() request: FastifyRequest, @Body() body: any) {
    requireTrainer(request);
    const clientId = Number(body.client_id);
    const date = String(body.scheduled_date || '');
    const startTime = /^\d{2}:\d{2}$/.test(String(body.start_time)) ? body.start_time : '09:00';
    const duration = Math.max(15, Number(body.duration) || 60);
    if (!clientId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !body.title?.trim()) throw new BadRequestException('Please complete the client, session name, date, and time.');
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
    if (!client) throw new NotFoundException('Client not found');
    const overlap = sessionOverlap(clientId, date, startTime, duration);
    if (overlap) throw new BadRequestException(`This overlaps with ${overlap.title} at ${overlap.start_time}.`);
    const status = ['upcoming', 'completed', 'cancelled'].includes(body.status) ? body.status : 'upcoming';
    const recurrence = String(body.recurrence_rule || '');
    const requestedDays = recurrence.startsWith('weekly:') ? recurrence.slice(7).split(',').map(Number).filter((day) => day >= 0 && day <= 6) : [];
    const dates = [date];
    if (requestedDays.length) {
      const cursor = new Date(`${date}T12:00:00`);
      for (let offset = 0; offset < 56; offset += 1) {
        const candidate = new Date(cursor.getTime() + offset * 86_400_000);
        if (offset > 0 && requestedDays.includes(candidate.getDay())) dates.push(candidate.toISOString().slice(0, 10));
      }
    }
    const insert = db.prepare('INSERT INTO sessions (client_id,title,scheduled_date,start_time,training_type,status,duration,difficulty,notes,performance_json,recurrence_rule) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const create = db.transaction(() => dates.map((sessionDate) => {
      const conflict = sessionOverlap(clientId, sessionDate, startTime, duration);
      if (conflict) throw new BadRequestException(`This overlaps with ${conflict.title} at ${conflict.start_time}.`);
      return insert.run(clientId, body.title.trim(), sessionDate, startTime, body.training_type || 'Strength', status, duration, null, body.notes || '', '[]', recurrence).lastInsertRowid;
    }));
    const ids = create();
    return { created: ids.length, session: db.prepare(`${calendarSelect} WHERE sessions.id = ?`).get(ids[0]) };
  }

  @Get('clients/:id')
  getClient(@Req() request: FastifyRequest, @Param('id') id: string) {
    requireTrainer(request);
    releaseScheduledDeliveries();
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(id)) as any;
    if (!client) throw new NotFoundException('Client not found');
    const plan = db.prepare('SELECT * FROM plans WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(client.id) as any;
    const delivery = plan ? db.prepare('SELECT * FROM plan_deliveries WHERE plan_id = ?').get(plan.id) as any : null;
    const sessions = db.prepare('SELECT * FROM sessions WHERE client_id = ? ORDER BY scheduled_date DESC').all(client.id) as any[];
    const progress = db.prepare('SELECT * FROM progress WHERE client_id = ? ORDER BY recorded_date').all(client.id);
    const completed = sessions.filter((s) => s.status === 'completed');
    const missed = sessions.filter((s) => s.status === 'missed');
    const completion = sessions.length ? Math.round((completed.length / sessions.length) * 100) : 0;
    const avgDifficulty = completed.length ? completed.reduce((n, s) => n + (s.difficulty || 0), 0) / completed.length : 0;
    const suggestion = avgDifficulty > 7.5 || missed.length > 0
      ? 'Reduce one working set on high-fatigue movements and check recovery before progressing load.'
      : 'Recovery and execution are strong. Increase primary lift load by 2.5% next week.';
    return { client, plan: plan ? { ...plan, workouts: localizeWorkouts(parse(plan.workouts_json), client.language || 'hr') } : null, delivery, sessions: sessions.map((s) => ({ ...s, performance: parse(s.performance_json) })), progress, analysis: { completion, avgDifficulty: Number(avgDifficulty.toFixed(1)), suggestion } };
  }

  @Post('clients')
  createClient(@Req() request: FastifyRequest, @Body() body: any) {
    requireTrainer(request);
    if (!body?.name?.trim()) throw new BadRequestException('Name is required');
    const initials = body.name.trim().split(/\s+/).map((x: string) => x[0]).join('').slice(0, 2).toUpperCase();
    const language = body.language === 'en' ? 'en' : 'hr';
    const info = db.prepare(`INSERT INTO clients (name,email,initials,goal,age,weight,height,fitness_level,condition,limitations,equipment,preferences,days_per_week,status,last_active,language) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'needs_plan','Just now',?)`).run(
      body.name.trim(), body.email || '', initials, body.goal || 'Build general fitness', Number(body.age) || 30, Number(body.weight) || 70, Number(body.height) || 170, body.fitness_level || 'Beginner', body.condition || 'Ready to begin', body.limitations || 'None', body.equipment || 'Bodyweight', body.preferences || 'Strength training', Number(body.days_per_week) || 3, language,
    );
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid) as any;
    const workouts = buildPlan(client.days_per_week, client.fitness_level, client.goal, client.limitations, client.language);
    db.prepare('INSERT INTO plans (client_id,week_label,status,workouts_json,rationale) VALUES (?,?,?,?,?)').run(client.id, 'Next week', 'draft', JSON.stringify(workouts), 'Created from the initial assessment. Review exercise selection, volume, and intensity before assigning.');
    createClientAccount(client);
    return client;
  }

  @Patch('plans/:id')
  updatePlan(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: any) {
    requireTrainer(request);
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(id)) as any;
    if (!plan) throw new NotFoundException('Plan not found');
    db.prepare('UPDATE plans SET status = ?, workouts_json = ? WHERE id = ?').run(body.status || plan.status, body.workouts ? JSON.stringify(body.workouts) : plan.workouts_json, plan.id);
    return { ...plan, status: body.status || plan.status, workouts: body.workouts || parse(plan.workouts_json) };
  }

  @Post('plans/:id/delivery')
  deliverPlan(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: { channel?: string; available_at?: string }) {
    requireTrainer(request);
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(id)) as any;
    if (!plan) throw new NotFoundException('Plan not found');
    const availableAt = body.available_at || new Date().toISOString();
    const status = new Date(availableAt).getTime() <= Date.now() ? 'sent' : 'scheduled';
    const channel = body.channel === 'email_and_in_app' ? 'email_and_in_app' : 'in_app';
    db.prepare(`INSERT INTO plan_deliveries (plan_id, client_id, channel, available_at, status, sent_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(plan_id) DO UPDATE SET channel=excluded.channel, available_at=excluded.available_at, status=excluded.status, sent_at=excluded.sent_at`)
      .run(plan.id, plan.client_id, channel, availableAt, status, status === 'sent' ? new Date().toISOString() : null);
    db.prepare("UPDATE plans SET status = 'assigned' WHERE id = ?").run(plan.id);
    return db.prepare('SELECT * FROM plan_deliveries WHERE plan_id = ?').get(plan.id);
  }

  @Post('plans/deliveries/bulk')
  deliverPlans(@Req() request: FastifyRequest, @Body() body: { clientIds?: number[]; channel?: string; available_at?: string }) {
    requireTrainer(request);
    const clientIds = [...new Set((body.clientIds || []).map(Number).filter(Boolean))];
    if (!clientIds.length) throw new BadRequestException('Select at least one client');
    const availableAt = body.available_at || new Date().toISOString();
    const status = new Date(availableAt).getTime() <= Date.now() ? 'sent' : 'scheduled';
    const channel = body.channel === 'email_and_in_app' ? 'email_and_in_app' : 'in_app';
    const send = db.transaction(() => clientIds.map((clientId) => {
      const plan = db.prepare('SELECT * FROM plans WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(clientId) as any;
      if (!plan) return null;
      db.prepare(`INSERT INTO plan_deliveries (plan_id, client_id, channel, available_at, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(plan_id) DO UPDATE SET channel=excluded.channel, available_at=excluded.available_at, status=excluded.status, sent_at=excluded.sent_at`)
        .run(plan.id, clientId, channel, availableAt, status, status === 'sent' ? new Date().toISOString() : null);
      db.prepare("UPDATE plans SET status = 'assigned' WHERE id = ?").run(plan.id);
      return clientId;
    }).filter(Boolean));
    return { sent: send(), status };
  }

  @Post('deliveries/:id/view')
  viewDelivery(@Req() request: FastifyRequest, @Param('id') id: string) {
    const user = requireUser(request);
    const delivery = db.prepare('SELECT * FROM plan_deliveries WHERE id = ?').get(Number(id)) as any;
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (user.role === 'client' && user.client_id !== delivery.client_id) throw new UnauthorizedException('This plan belongs to another client.');
    db.prepare("UPDATE plan_deliveries SET status = 'viewed', viewed_at = COALESCE(viewed_at, ?) WHERE id = ?").run(new Date().toISOString(), delivery.id);
    return { ok: true };
  }

  @Post('deliveries/:id/confirm')
  confirmDelivery(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: { feedback?: string }) {
    const user = requireUser(request);
    const delivery = db.prepare('SELECT * FROM plan_deliveries WHERE id = ?').get(Number(id)) as any;
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (user.role === 'client' && user.client_id !== delivery.client_id) throw new UnauthorizedException('This plan belongs to another client.');
    db.prepare("UPDATE plan_deliveries SET status = 'confirmed', confirmed_at = ?, feedback = ? WHERE id = ?").run(new Date().toISOString(), body.feedback || '', delivery.id);
    return { ok: true };
  }

  @Patch('sessions/:id')
  updateSession(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: any) {
    requireTrainer(request);
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(Number(id)) as any;
    if (!session) throw new NotFoundException('Session not found');
    const scheduledDate = body.scheduled_date || session.scheduled_date;
    const startTime = body.start_time || session.start_time || '09:00';
    const duration = Number(body.duration ?? session.duration ?? 60);
    if (body.scheduled_date || body.start_time || body.duration) {
      const overlap = sessionOverlap(session.client_id, scheduledDate, startTime, duration, session.id);
      if (overlap) throw new BadRequestException(`This overlaps with ${overlap.title} at ${overlap.start_time}.`);
    }
    db.prepare('UPDATE sessions SET title = ?, scheduled_date = ?, start_time = ?, training_type = ?, recurrence_rule = ?, status = ?, duration = ?, difficulty = ?, notes = ?, performance_json = ? WHERE id = ?').run(body.title ?? session.title, scheduledDate, startTime, body.training_type ?? session.training_type ?? 'Strength', body.recurrence_rule ?? session.recurrence_rule ?? '', body.status || session.status, duration, body.difficulty ?? session.difficulty, body.notes ?? session.notes, body.performance ? JSON.stringify(body.performance) : session.performance_json, session.id);
    return db.prepare(`${calendarSelect} WHERE sessions.id = ?`).get(session.id);
  }

  @Post('clients/:id/progress')
  addProgress(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: any) {
    requireTrainer(request);
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(Number(id));
    if (!client) throw new NotFoundException('Client not found');
    const info = db.prepare('INSERT INTO progress (client_id,recorded_date,weight,waist,body_fat,squat_max,feedback) VALUES (?,?,?,?,?,?,?)').run(Number(id), body.recorded_date || new Date().toISOString().slice(0,10), body.weight || null, body.waist || null, body.body_fat || null, body.squat_max || null, body.feedback || '');
    return db.prepare('SELECT * FROM progress WHERE id = ?').get(info.lastInsertRowid);
  }

  @Get('client/me')
  clientWorkspace(@Req() request: FastifyRequest) {
    releaseScheduledDeliveries();
    const user = requireUser(request);
    if (user.role !== 'client' || !user.client_id) throw new UnauthorizedException('Client access is required.');
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(user.client_id) as any;
    const plan = db.prepare('SELECT * FROM plans WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(user.client_id) as any;
    const delivery = plan ? db.prepare('SELECT * FROM plan_deliveries WHERE plan_id = ?').get(plan.id) as any : null;
    const sessions = db.prepare('SELECT * FROM sessions WHERE client_id = ? ORDER BY scheduled_date DESC, start_time DESC').all(user.client_id) as any[];
    const progress = db.prepare('SELECT * FROM progress WHERE client_id = ? ORDER BY recorded_date DESC').all(user.client_id);
    const visiblePlan = plan && delivery && ['sent', 'viewed', 'confirmed'].includes(delivery.status)
      ? { ...plan, workouts: localizeWorkouts(parse(plan.workouts_json), client.language || 'hr') } : null;
    return { client, plan: visiblePlan, delivery, sessions: sessions.map((session) => ({ ...session, performance: parse(session.performance_json) })), progress };
  }

  @Post('client/sessions/:id/complete')
  completeOwnSession(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: any) {
    const user = requireUser(request);
    if (user.role !== 'client' || !user.client_id) throw new UnauthorizedException('Client access is required.');
    const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND client_id = ?').get(Number(id), user.client_id) as any;
    if (!session) throw new NotFoundException('Workout not found.');
    const performance = Array.isArray(body.performance) ? body.performance.slice(0, 30).map((item: any) => ({
      exercise: String(item.exercise || '').slice(0, 120), sets: String(item.sets || '').slice(0, 60), load: String(item.load || '').slice(0, 60), reps: String(item.reps || '').slice(0, 60),
    })) : parse(session.performance_json);
    db.prepare("UPDATE sessions SET status = 'completed', duration = ?, difficulty = ?, notes = ?, performance_json = ? WHERE id = ?")
      .run(Math.max(1, Number(body.duration) || Number(session.duration) || 0), Math.min(10, Math.max(1, Number(body.difficulty) || 5)), String(body.notes || '').slice(0, 2000), JSON.stringify(performance), session.id);
    return { ok: true };
  }

  @Post('client/progress')
  addOwnProgress(@Req() request: FastifyRequest, @Body() body: any) {
    const user = requireUser(request);
    if (user.role !== 'client' || !user.client_id) throw new UnauthorizedException('Client access is required.');
    const info = db.prepare('INSERT INTO progress (client_id,recorded_date,weight,waist,body_fat,squat_max,feedback,photo_url) VALUES (?,?,?,?,?,?,?,?)')
      .run(user.client_id, new Date().toISOString().slice(0, 10), body.weight || null, body.waist || null, body.body_fat || null, body.squat_max || null, String(body.feedback || '').slice(0, 2000), String(body.photo_url || '').slice(0, 500) || null);
    return db.prepare('SELECT * FROM progress WHERE id = ?').get(info.lastInsertRowid);
  }
}
