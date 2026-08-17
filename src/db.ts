import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'trainer.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  profile_photo_url TEXT,
  initials TEXT NOT NULL,
  goal TEXT NOT NULL,
  age INTEGER NOT NULL,
  weight REAL NOT NULL,
  height INTEGER NOT NULL,
  fitness_level TEXT NOT NULL,
  condition TEXT NOT NULL,
  limitations TEXT NOT NULL DEFAULT '',
  equipment TEXT NOT NULL,
  preferences TEXT NOT NULL,
  days_per_week INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'on_track',
  last_active TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'hr',
  trainer_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  week_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  workouts_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  status TEXT NOT NULL,
  duration INTEGER,
  difficulty INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  performance_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  recorded_date TEXT NOT NULL,
  weight REAL,
  waist REAL,
  body_fat REAL,
  squat_max REAL,
  feedback TEXT NOT NULL DEFAULT '',
  photo_url TEXT
);
CREATE TABLE IF NOT EXISTS plan_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL UNIQUE REFERENCES plans(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  available_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  sent_at TEXT,
  viewed_at TEXT,
  confirmed_at TEXT,
  feedback TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  profile_photo_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'hr',
  trainer_bio TEXT NOT NULL DEFAULT '',
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK(role IN ('admin','trainer','client')),
  client_id INTEGER UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_login TEXT,
  password_reset_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
`);

// Existing installations used a two-role CHECK constraint. SQLite cannot alter it in place,
// so migrate the account table while preserving ids referenced by sessions and auth codes.
const usersSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql?: string } | undefined)?.sql || '';
const requiresAdminRoleMigration = !usersSql.includes("'admin'");
if (requiresAdminRoleMigration) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    BEGIN;
    CREATE TABLE users_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      profile_photo_url TEXT,
      preferred_language TEXT NOT NULL DEFAULT 'hr',
      trainer_bio TEXT NOT NULL DEFAULT '',
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL CHECK(role IN ('admin','trainer','client')),
      client_id INTEGER UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      password_reset_required INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users_next (id,email,display_name,role,client_id,password_hash,created_at)
      SELECT id,email,display_name,role,client_id,password_hash,created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_next RENAME TO users;
    COMMIT;
  `);
  db.pragma('foreign_keys = ON');
}
const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
if (!userColumns.some((column) => column.name === 'active')) db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
if (!userColumns.some((column) => column.name === 'last_login')) db.exec('ALTER TABLE users ADD COLUMN last_login TEXT');
if (!userColumns.some((column) => column.name === 'password_reset_required')) db.exec('ALTER TABLE users ADD COLUMN password_reset_required INTEGER NOT NULL DEFAULT 0');
if (!userColumns.some((column) => column.name === 'first_name')) db.exec("ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''");
if (!userColumns.some((column) => column.name === 'last_name')) db.exec("ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''");
if (!userColumns.some((column) => column.name === 'phone')) db.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
if (!userColumns.some((column) => column.name === 'profile_photo_url')) db.exec('ALTER TABLE users ADD COLUMN profile_photo_url TEXT');
if (!userColumns.some((column) => column.name === 'preferred_language')) db.exec("ALTER TABLE users ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'hr'");
if (!userColumns.some((column) => column.name === 'trainer_bio')) db.exec("ALTER TABLE users ADD COLUMN trainer_bio TEXT NOT NULL DEFAULT ''");
if (!userColumns.some((column) => column.name === 'onboarding_completed')) {
  db.exec('ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0');
  // Keep people already using an upgraded workspace out of the first-sign-in flow.
  db.prepare('UPDATE users SET onboarding_completed = 1').run();
}
if (requiresAdminRoleMigration) db.prepare('UPDATE users SET onboarding_completed = 1').run();

const initialClientColumns = db.prepare("PRAGMA table_info(clients)").all() as { name: string }[];
if (!initialClientColumns.some((column) => column.name === 'trainer_id')) db.exec('ALTER TABLE clients ADD COLUMN trainer_id INTEGER');
const authSessionColumns = db.prepare("PRAGMA table_info(auth_sessions)").all() as { name: string }[];
if (!authSessionColumns.some((column) => column.name === 'is_preview')) db.exec('ALTER TABLE auth_sessions ADD COLUMN is_preview INTEGER NOT NULL DEFAULT 0');

type Account = { id: number; email: string; display_name: string; first_name: string; last_name: string; phone: string; profile_photo_url: string | null; preferred_language: 'hr' | 'en'; trainer_bio: string; onboarding_completed: number; role: 'admin' | 'trainer' | 'client'; client_id: number | null; password_hash: string; active: number; last_login: string | null; password_reset_required: number };
export type AuthUser = Omit<Account, 'password_hash'> & { is_preview?: number };

const hashPassword = (password: string, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password: string, stored: string) => {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString('hex');
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
};

export function seedAccounts(): void {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  const add = db.prepare('INSERT INTO users (email,display_name,role,client_id,password_hash) VALUES (?,?,?,?,?)');
  // Keep the initial administrator present on fresh and existing installations.
  db.prepare(`INSERT INTO users (email,display_name,role,client_id,password_hash)
    VALUES (?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET role = excluded.role, client_id = NULL, active = 1`)
    .run('zmilosevich@gmail.com', 'ZMilosevich', 'admin', null, hashPassword('Trainer2026!'));
  if (!existing.n) {
    const seed = db.transaction(() => {
      add.run('trainer@letsdoit.app', 'Kiki Obra', 'trainer', null, hashPassword('Trainer2026!'));
      const clients = db.prepare('SELECT id,name,email FROM clients ORDER BY id').all() as { id: number; name: string; email: string }[];
      clients.forEach((client) => add.run(client.email || `client${client.id}@letsdoit.app`, client.name, 'client', client.id, hashPassword('Client2026!')));
    });
    seed();
  }
  const defaultTrainer = db.prepare("SELECT id FROM users WHERE role='trainer' AND active=1 ORDER BY id LIMIT 1").get() as { id: number } | undefined;
  if (defaultTrainer) db.prepare('UPDATE clients SET trainer_id=? WHERE trainer_id IS NULL').run(defaultTrainer.id);
}

export function createClientAccount(client: { id: number; name: string; email: string }): void {
  if (!client.email) return;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(client.email);
  if (!existing) db.prepare('INSERT INTO users (email,display_name,role,client_id,password_hash) VALUES (?,?,?,?,?)').run(client.email, client.name, 'client', client.id, hashPassword('Client2026!'));
}

export function authenticate(email: string, password: string): AuthUser | null {
  const account = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as Account | undefined;
  if (!account || !account.active || !verifyPassword(password, account.password_hash)) return null;
  const { password_hash: _passwordHash, ...user } = account;
  return user;
}

export function issueSession(userId: number, recordLogin = true, isPreview = false): string {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = scryptSync(token, 'letsdoit-session', 64).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('INSERT INTO auth_sessions (token_hash,user_id,expires_at,is_preview) VALUES (?,?,?,?)').run(tokenHash, userId, expiresAt, isPreview ? 1 : 0);
  if (recordLogin) db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), userId);
  return token;
}

export function userForToken(token: string): AuthUser | null {
  if (!token) return null;
  const hash = scryptSync(token, 'letsdoit-session', 64).toString('hex');
  const user = db.prepare(`SELECT users.id,users.email,users.display_name,users.first_name,users.last_name,users.phone,users.profile_photo_url,users.preferred_language,users.trainer_bio,users.onboarding_completed,users.role,users.client_id,users.active,users.last_login,users.password_reset_required,auth_sessions.is_preview
    FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ? AND users.active = 1`).get(hash, new Date().toISOString()) as AuthUser | undefined;
  return user || null;
}

export function revokeSession(token: string): void {
  if (!token) return;
  const hash = scryptSync(token, 'letsdoit-session', 64).toString('hex');
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hash);
}

const opaqueHash = (value: string) => scryptSync(value, 'letsdoit-opaque', 64).toString('hex');

export function createOauthState(redirectUri: string): string {
  const state = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO oauth_states (state_hash,redirect_uri,expires_at) VALUES (?,?,?)').run(opaqueHash(state), redirectUri, new Date(Date.now() + 1000 * 60 * 10).toISOString());
  return state;
}

export function consumeOauthState(state: string): string | null {
  const hash = opaqueHash(state);
  const row = db.prepare('SELECT * FROM oauth_states WHERE state_hash = ? AND expires_at > ?').get(hash, new Date().toISOString()) as { redirect_uri: string } | undefined;
  db.prepare('DELETE FROM oauth_states WHERE state_hash = ?').run(hash);
  return row?.redirect_uri || null;
}

export function findUserByEmail(email: string): AuthUser | null {
  const user = db.prepare('SELECT id,email,display_name,first_name,last_name,phone,profile_photo_url,preferred_language,trainer_bio,onboarding_completed,role,client_id,active,last_login,password_reset_required FROM users WHERE email = ? AND active = 1').get(email) as AuthUser | undefined;
  return user || null;
}

export function createAuthCode(userId: number): string {
  const code = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM auth_codes WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('INSERT INTO auth_codes (code_hash,user_id,expires_at) VALUES (?,?,?)').run(opaqueHash(code), userId, new Date(Date.now() + 1000 * 60).toISOString());
  return code;
}

export function consumeAuthCode(code: string): AuthUser | null {
  const hash = opaqueHash(code);
  const row = db.prepare('SELECT user_id FROM auth_codes WHERE code_hash = ? AND expires_at > ?').get(hash, new Date().toISOString()) as { user_id: number } | undefined;
  db.prepare('DELETE FROM auth_codes WHERE code_hash = ?').run(hash);
  if (!row) return null;
  return db.prepare('SELECT id,email,display_name,first_name,last_name,phone,profile_photo_url,preferred_language,trainer_bio,onboarding_completed,role,client_id,active,last_login,password_reset_required FROM users WHERE id = ? AND active = 1').get(row.user_id) as AuthUser || null;
}

export function createPassword(): string {
  return `${randomBytes(5).toString('base64url')}!7a`;
}

export function setAccountPassword(userId: number, password: string, requireReset = true): void {
  db.prepare('UPDATE users SET password_hash = ?, password_reset_required = ? WHERE id = ?').run(hashPassword(password), requireReset ? 1 : 0, userId);
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
}

// Lightweight migration for workspaces created before client language preference existed.
const clientColumns = db.prepare("PRAGMA table_info(clients)").all() as { name: string }[];
if (!clientColumns.some((column) => column.name === 'gender')) db.exec("ALTER TABLE clients ADD COLUMN gender TEXT NOT NULL DEFAULT ''");
if (!clientColumns.some((column) => column.name === 'profile_photo_url')) db.exec('ALTER TABLE clients ADD COLUMN profile_photo_url TEXT');
if (!clientColumns.some((column) => column.name === 'language')) {
  db.exec("ALTER TABLE clients ADD COLUMN language TEXT NOT NULL DEFAULT 'hr'");
}

// Calendar fields were added after the original workout log, so keep existing workspaces intact.
const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
if (!sessionColumns.some((column) => column.name === 'start_time')) db.exec("ALTER TABLE sessions ADD COLUMN start_time TEXT NOT NULL DEFAULT '09:00'");
if (!sessionColumns.some((column) => column.name === 'training_type')) db.exec("ALTER TABLE sessions ADD COLUMN training_type TEXT NOT NULL DEFAULT 'Strength'");
if (!sessionColumns.some((column) => column.name === 'recurrence_rule')) db.exec("ALTER TABLE sessions ADD COLUMN recurrence_rule TEXT NOT NULL DEFAULT ''");

db.prepare("UPDATE sessions SET start_time = CASE id WHEN 1 THEN '08:00' WHEN 2 THEN '17:00' WHEN 3 THEN '09:00' WHEN 4 THEN '07:30' WHEN 5 THEN '09:30' WHEN 6 THEN '18:00' WHEN 7 THEN '16:30' ELSE start_time END WHERE start_time = '09:00'").run();
db.prepare("UPDATE sessions SET training_type = CASE WHEN title LIKE '%Mobility%' THEN 'Recovery' WHEN title LIKE '%run%' OR title LIKE '%interval%' THEN 'Conditioning' ELSE 'Strength' END WHERE training_type = 'Strength'").run();

export type OnboardingInput = {
  role: 'trainer' | 'client';
  first_name: string;
  last_name: string;
  phone?: string;
  profile_photo_url?: string;
  preferred_language: 'hr' | 'en';
  basic_info?: string;
  age?: number;
  gender?: string;
  height?: number;
  weight?: number;
  fitness_level?: string;
  goal?: string;
  limitations?: string;
  days_per_week?: number;
  equipment?: string;
};

export function completeOnboarding(userId: number, input: OnboardingInput): AuthUser {
  const account = db.prepare('SELECT id,email,client_id FROM users WHERE id = ? AND active = 1').get(userId) as { id: number; email: string; client_id: number | null } | undefined;
  if (!account) throw new Error('Active account not found.');

  const firstName = input.first_name.trim();
  const lastName = input.last_name.trim();
  const displayName = `${firstName} ${lastName}`.trim();
  const language = input.preferred_language === 'en' ? 'en' : 'hr';
  const profilePhoto = input.profile_photo_url?.trim() || null;
  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  const update = db.transaction(() => {
    let clientId: number | null = null;
    if (input.role === 'client') {
      const condition = language === 'hr' ? 'Početna procjena dovršena' : 'Initial assessment completed';
      const preferences = language === 'hr' ? 'Nije navedeno' : 'Not specified';
      const clientValues = [displayName, account.email, input.gender || '', profilePhoto, initials, input.goal || '', Number(input.age), Number(input.weight), Number(input.height), input.fitness_level || 'Beginner', condition, input.limitations || '', input.equipment || '', preferences, Number(input.days_per_week), language] as const;
      if (account.client_id) {
        clientId = account.client_id;
        db.prepare(`UPDATE clients SET name=?,email=?,gender=?,profile_photo_url=?,initials=?,goal=?,age=?,weight=?,height=?,fitness_level=?,condition=?,limitations=?,equipment=?,preferences=?,days_per_week=?,language=?,last_active='Just now' WHERE id=?`)
          .run(...clientValues, clientId);
      } else {
        const info = db.prepare(`INSERT INTO clients (name,email,gender,profile_photo_url,initials,goal,age,weight,height,fitness_level,condition,limitations,equipment,preferences,days_per_week,status,last_active,language,trainer_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'needs_plan','Just now',?,NULL)`)
          .run(...clientValues);
        clientId = Number(info.lastInsertRowid);
      }

      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as any;
      const workouts = buildPlan(client.days_per_week, client.fitness_level, client.goal, client.limitations, client.language);
      const rationale = language === 'hr'
        ? 'Izrađeno iz početne procjene. Pregledajte odabir vježbi, volumen i intenzitet prije objave.'
        : 'Created from the initial assessment. Review exercise selection, volume, and intensity before assigning.';
      const latestPlan = db.prepare('SELECT id,status FROM plans WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(clientId) as { id: number; status: string } | undefined;
      if (!latestPlan) db.prepare('INSERT INTO plans (client_id,week_label,status,workouts_json,rationale) VALUES (?,?,?,?,?)').run(clientId, language === 'hr' ? 'Sljedeći tjedan' : 'Next week', 'draft', JSON.stringify(workouts), rationale);
      else if (latestPlan.status === 'draft') db.prepare('UPDATE plans SET workouts_json = ?, rationale = ? WHERE id = ?').run(JSON.stringify(workouts), rationale, latestPlan.id);
    }

    db.prepare(`UPDATE users SET display_name=?,first_name=?,last_name=?,phone=?,profile_photo_url=?,preferred_language=?,trainer_bio=?,role=?,client_id=?,onboarding_completed=1 WHERE id=?`)
      .run(displayName, firstName, lastName, input.phone?.trim() || '', profilePhoto, language, input.role === 'trainer' ? input.basic_info?.trim() || '' : '', input.role, clientId, userId);
  });
  update();
  return db.prepare('SELECT id,email,display_name,first_name,last_name,phone,profile_photo_url,preferred_language,trainer_bio,onboarding_completed,role,client_id,active,last_login,password_reset_required FROM users WHERE id = ? AND active = 1').get(userId) as AuthUser;
}

type Exercise = { name: string; sets: number; reps: string; intensity: string; rest: string; duration?: string; instructions: string };
type Workout = { id: string; day: string; title: string; focus: string; duration: number; exercises: Exercise[] };

export function localizeWorkouts(workouts: Workout[], language = 'hr'): Workout[] {
  if (language !== 'hr') return workouts;
  const words: Record<string, string> = {
    Monday: 'Ponedjeljak', Wednesday: 'Srijeda', Friday: 'Petak', Saturday: 'Subota',
    'Lower body strength': 'Snaga donjeg dijela tijela', 'Upper body build': 'Snaga gornjeg dijela tijela',
    'Full body power': 'Snaga cijelog tijela', 'Aerobic capacity': 'Aerobni kapacitet', 'Mobility and recovery': 'Mobilnost i oporavak',
    Strength: 'Snaga', Conditioning: 'Kondicija', Recovery: 'Oporavak',
  };
  const instructions: Record<string, string> = {
    'Brace before each rep. Keep pressure through the whole foot.': 'Učvrstite trup prije svakog ponavljanja. Zadržite oslonac cijelim stopalom.',
    'Hinge at the hips and keep the load close.': 'Pregib započnite iz kukova i držite opterećenje blizu tijela.',
    'Use a range that stays pain free.': 'Koristite opseg pokreta bez boli.',
    'Keep shoulder blades gently set throughout.': 'Tijekom cijelog pokreta lagano držite lopatice stabilnima.',
    'Lead with the elbow without rotating.': 'Vodite laktom bez rotacije trupa.',
    'Stack ribs over hips and move smoothly.': 'Rebra držite iznad kukova i krećite se kontrolirano.',
    'Drive the floor away and finish tall.': 'Gurajte podlogu od sebe i završite uspravno.',
    'Keep a straight line from shoulders to heels.': 'Zadržite ravnu liniju od ramena do peta.',
    'Keep output repeatable across all intervals.': 'Održavajte ujednačen intenzitet kroz sve intervale.',
    'Stay at an easy, sustainable pace.': 'Održavajte lagani, održivi tempo.',
    'Move slowly and avoid pinching or pain.': 'Krećite se polako i izbjegavajte nelagodu ili bol.',
  };
  return workouts.map((workout) => ({ ...workout, day: words[workout.day] || workout.day, title: words[workout.title] || workout.title, focus: words[workout.focus] || workout.focus, exercises: workout.exercises.map((exercise) => ({ ...exercise, instructions: instructions[exercise.instructions] || exercise.instructions })) }));
}

export function buildPlan(days: number, level: string, goal: string, limitations: string, language = 'hr'): Workout[] {
  const base: Workout[] = [
    { id: 'mon', day: 'Monday', title: 'Lower body strength', focus: 'Strength', duration: 55, exercises: [
      { name: limitations.toLowerCase().includes('knee') ? 'Box squat' : 'Back squat', sets: 4, reps: '6', intensity: level === 'Beginner' ? 'RPE 6' : '72.5% 1RM', rest: '2 min', instructions: 'Brace before each rep. Keep pressure through the whole foot.' },
      { name: 'Romanian deadlift', sets: 3, reps: '8', intensity: 'RPE 7', rest: '90 sec', instructions: 'Hinge at the hips and keep the load close.' },
      { name: 'Reverse lunge', sets: 3, reps: '10 / side', intensity: 'Controlled', rest: '60 sec', instructions: 'Use a range that stays pain free.' },
    ]},
    { id: 'wed', day: 'Wednesday', title: 'Upper body build', focus: 'Strength', duration: 50, exercises: [
      { name: 'Dumbbell bench press', sets: 4, reps: '8', intensity: 'RPE 7', rest: '90 sec', instructions: 'Keep shoulder blades gently set throughout.' },
      { name: 'Single-arm cable row', sets: 3, reps: '10 / side', intensity: 'RPE 7', rest: '60 sec', instructions: 'Lead with the elbow without rotating.' },
      { name: 'Half-kneeling press', sets: 3, reps: '10 / side', intensity: 'Moderate', rest: '60 sec', instructions: 'Stack ribs over hips and move smoothly.' },
    ]},
    { id: 'fri', day: 'Friday', title: goal.toLowerCase().includes('endurance') ? 'Aerobic capacity' : 'Full body power', focus: 'Conditioning', duration: 45, exercises: [
      { name: 'Kettlebell deadlift', sets: 4, reps: '10', intensity: 'RPE 7', rest: '60 sec', instructions: 'Drive the floor away and finish tall.' },
      { name: 'Incline push-up', sets: 3, reps: '12', intensity: '2 reps in reserve', rest: '45 sec', instructions: 'Keep a straight line from shoulders to heels.' },
      { name: 'Bike intervals', sets: 6, reps: '45 sec work', intensity: 'RPE 8', rest: '75 sec easy', duration: '12 min', instructions: 'Keep output repeatable across all intervals.' },
    ]},
    { id: 'sat', day: 'Saturday', title: 'Mobility and recovery', focus: 'Recovery', duration: 30, exercises: [
      { name: 'Zone 2 cardio', sets: 1, reps: '20 min', intensity: 'Conversational', rest: 'None', duration: '20 min', instructions: 'Stay at an easy, sustainable pace.' },
      { name: 'Mobility flow', sets: 2, reps: '5 movements', intensity: 'Easy', rest: 'As needed', duration: '10 min', instructions: 'Move slowly and avoid pinching or pain.' },
    ]},
  ];
  return localizeWorkouts(base.slice(0, Math.max(2, Math.min(days, 4))), language);
}

export function seedIfEmpty(): void {
  const count = db.prepare('SELECT COUNT(*) AS n FROM clients').get() as { n: number };
  if (count.n > 0) return;
  const addClient = db.prepare(`INSERT INTO clients
    (name,email,initials,goal,age,weight,height,fitness_level,condition,limitations,equipment,preferences,days_per_week,status,last_active,language)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const addPlan = db.prepare('INSERT INTO plans (client_id,week_label,status,workouts_json,rationale) VALUES (?,?,?,?,?)');
  const addSession = db.prepare('INSERT INTO sessions (client_id,title,scheduled_date,status,duration,difficulty,notes,performance_json) VALUES (?,?,?,?,?,?,?,?)');
  const addProgress = db.prepare('INSERT INTO progress (client_id,recorded_date,weight,waist,body_fat,squat_max,feedback) VALUES (?,?,?,?,?,?,?)');
  const seed = db.transaction(() => {
    const clients = [
      ['Maya Chen','maya@example.com','MC','Build strength and confidence',34,67.4,168,'Intermediate','Good baseline, occasional fatigue','Previous right knee irritation','Full gym, bands','Strength training, cycling',3,'on_track','Today','hr'],
      ['Jordan Blake','jordan@example.com','JB','Improve endurance for a 10K',29,78.2,181,'Beginner','Returning after a long break','None','Dumbbells, treadmill','Running, circuits',4,'attention','Yesterday','hr'],
      ['Elena Ruiz','elena@example.com','ER','Body composition and energy',42,71.8,164,'Intermediate','Consistent, sleep varies','Sensitive lower back','Home gym, bands','Pilates, strength',3,'needs_plan','2 days ago','hr'],
      ['Marcus Lee','marcus@example.com','ML','Athletic performance',25,86.1,187,'Advanced','Strong and well conditioned','Left shoulder overhead discomfort','Full gym','Strength, rowing',4,'missed','4 days ago','hr'],
    ];
    const ids = clients.map((c) => Number(addClient.run(...c).lastInsertRowid));
    ids.forEach((id, i) => addPlan.run(id, 'Aug 10–16', i === 2 ? 'draft' : 'assigned', JSON.stringify(buildPlan(Number(clients[i][12]), String(clients[i][7]), String(clients[i][3]), String(clients[i][9]), String(clients[i][15]))), i === 0 ? 'Volume stays moderate this week while squat load increases by 2.5%. Recovery and completion are both strong.' : 'Balanced around current capacity, preferred training style, and available equipment.'));
    const sessions = [
      [ids[0],'Lower body strength','2026-08-10','completed',54,6,'Knee felt good throughout.',JSON.stringify([{exercise:'Back squat',sets:'4 × 6',load:'52.5 kg'},{exercise:'Romanian deadlift',sets:'3 × 8',load:'42.5 kg'}])],
      [ids[0],'Upper body build','2026-08-12','completed',48,5,'Strong session.',JSON.stringify([{exercise:'Dumbbell bench press',sets:'4 × 8',load:'16 kg'}])],
      [ids[0],'Full body power','2026-08-14','upcoming',null,null,'','[]'],
      [ids[1],'Easy run + strides','2026-08-11','completed',38,8,'Pace dropped late.','[]'],
      [ids[1],'Aerobic intervals','2026-08-13','missed',null,null,'','[]'],
      [ids[2],'Full body strength','2026-08-12','completed',51,7,'Low back felt tight after rows.','[]'],
      [ids[3],'Upper strength','2026-08-11','missed',null,null,'','[]'],
    ];
    sessions.forEach((s) => addSession.run(...s));
    [[ids[0],'2026-06-01',70.2,76,25.1,55,'Energy improving'],[ids[0],'2026-07-01',68.8,73,23.9,60,'Sleep has been solid'],[ids[0],'2026-08-10',67.4,71,22.8,67.5,'Feeling strong'],[ids[1],'2026-08-10',78.2,82,20.4,80,'Legs felt heavy']].forEach((p) => addProgress.run(...p));
  });
  seed();
}

export function seedDeliveries(): void {
  const count = db.prepare('SELECT COUNT(*) AS n FROM plan_deliveries').get() as { n: number };
  if (count.n > 0) return;
  const plan = db.prepare('SELECT id, client_id FROM plans WHERE client_id = 1 ORDER BY id DESC LIMIT 1').get() as { id: number; client_id: number } | undefined;
  if (!plan) return;
  db.prepare('INSERT INTO plan_deliveries (plan_id, client_id, channel, available_at, status, sent_at, viewed_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(plan.id, plan.client_id, 'in_app', '2026-08-10T08:00:00.000Z', 'viewed', '2026-08-10T08:00:00.000Z', '2026-08-10T09:14:00.000Z', '2026-08-10T09:16:00.000Z');
}

/** A couple of same-day appointments make the calendar useful on a fresh workspace. */
export function seedCalendarSessions(): void {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE scheduled_date = '2026-08-13' AND title = 'Mobility review'").get() as { n: number };
  if (existing.n) return;
  const insert = db.prepare('INSERT INTO sessions (client_id,title,scheduled_date,start_time,training_type,status,duration,difficulty,notes,performance_json,recurrence_rule) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const clients = db.prepare('SELECT id FROM clients ORDER BY id').all() as { id: number }[];
  if (clients.length < 3) return;
  insert.run(clients[0].id, 'Strength technique', '2026-08-13', '14:00', 'Strength', 'upcoming', 60, null, '', '[]', 'weekly:1,3');
  insert.run(clients[2].id, 'Mobility review', '2026-08-13', '17:30', 'Recovery', 'upcoming', 45, null, '', '[]', '');
}
