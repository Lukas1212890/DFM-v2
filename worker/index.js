const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'cache-control': 'no-store'
  }
});

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '*';
  if (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === '*') return '*';
  return origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validCompanyEmail(email, env) {
  const domain = String(env.AUTH_DOMAIN || 'dronetech.cz').trim().toLowerCase();
  return email.endsWith(`@${domain}`) && email.length <= 254;
}

function displayNameFromEmail(email) {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || email;
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint8Array(10));
  return [...values].map(value => alphabet[value % alphabet.length]).join('');
}

async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS invite_codes (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'user', expires_at TEXT NOT NULL,
      used_at TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_invite_email ON invite_codes(email, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)`)
  ]);
}

async function getSessionUser(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id,u.email,u.name,u.role,u.active,s.id AS session_id
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.active=1`).bind(tokenHash).first();
  if (!row) return null;
  await env.DB.prepare('UPDATE sessions SET last_seen=CURRENT_TIMESTAMP WHERE id=?').bind(row.session_id).run();
  return { id: row.id, email: row.email, name: row.name, role: row.role, sessionId: row.session_id };
}

async function createSession(user, env) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)')
    .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt).run();
  return { token, expiresAt };
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') return json({ ok: true }, 200, origin);
    try {
      await ensureSchema(env);
      const url = new URL(request.url);

      if (url.pathname === '/health' && request.method === 'GET') {
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();
        return json({ ok: true, service: 'DFM Cloud API', auth: 'invite-code', initialized: Number(count?.total || 0) > 0 }, 200, origin);
      }

      if (url.pathname === '/auth/login' && request.method === 'POST') {
        const body = await readBody(request);
        const email = normalizeEmail(body?.email);
        const code = String(body?.code || '').trim().toUpperCase();
        if (!validCompanyEmail(email, env) || code.length < 6) return json({ error: 'Zadejte firemní e-mail a platný přístupový kód.' }, 400, origin);

        let user = await env.DB.prepare('SELECT id,email,name,role,active FROM users WHERE email=?').bind(email).first();
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();
        const isFirstUser = Number(count?.total || 0) === 0;

        if (isFirstUser) {
          if (!env.BOOTSTRAP_CODE || code !== String(env.BOOTSTRAP_CODE).trim().toUpperCase()) {
            return json({ error: 'Nesprávný startovací kód administrátora.' }, 401, origin);
          }
          const id = crypto.randomUUID();
          const name = String(body?.name || '').trim().slice(0, 100) || displayNameFromEmail(email);
          await env.DB.prepare(`INSERT INTO users (id,email,name,role,last_login)
            VALUES (?,?,?,'admin',CURRENT_TIMESTAMP)`).bind(id, email, name).run();
          user = { id, email, name, role: 'admin', active: 1 };
        } else if (!user) {
          const codeHash = await sha256(code);
          const invite = await env.DB.prepare(`SELECT id,role FROM invite_codes WHERE email=? AND code_hash=?
            AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`).bind(email, codeHash).first();
          if (!invite) return json({ error: 'Pozvánka není platná nebo už vypršela.' }, 401, origin);
          const id = crypto.randomUUID();
          const name = String(body?.name || '').trim().slice(0, 100) || displayNameFromEmail(email);
          await env.DB.prepare('INSERT INTO users (id,email,name,role,last_login) VALUES (?,?,?,?,CURRENT_TIMESTAMP)')
            .bind(id, email, name, invite.role).run();
          await env.DB.prepare('UPDATE invite_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?').bind(invite.id).run();
          user = { id, email, name, role: invite.role, active: 1 };
        } else {
          if (!user.active) return json({ error: 'Účet je deaktivovaný.' }, 403, origin);
          const codeHash = await sha256(code);
          const invite = await env.DB.prepare(`SELECT id FROM invite_codes WHERE email=? AND code_hash=?
            AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`).bind(email, codeHash).first();
          if (!invite) return json({ error: 'Přístupový kód není platný.' }, 401, origin);
          await env.DB.prepare('UPDATE invite_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?').bind(invite.id).run();
          await env.DB.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?').bind(user.id).run();
        }

        const session = await createSession(user, env);
        return json({ ...session, user: { id: user.id, email: user.email, name: user.name, role: user.role } }, 200, origin);
      }

      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return json({ error: 'Přihlášení je vyžadováno.' }, 401, origin);

      if (url.pathname === '/auth/me' && request.method === 'GET') {
        return json({ user: { id: currentUser.id, email: currentUser.email, name: currentUser.name, role: currentUser.role } }, 200, origin);
      }
      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(currentUser.sessionId).run();
        return json({ ok: true }, 200, origin);
      }

      if (url.pathname === '/admin/users' && request.method === 'GET') {
        if (currentUser.role !== 'admin') return json({ error: 'Pouze administrátor.' }, 403, origin);
        const rows = await env.DB.prepare('SELECT id,email,name,role,active,created_at,last_login FROM users ORDER BY name').all();
        return json({ users: rows.results || [] }, 200, origin);
      }

      if (url.pathname === '/admin/invites' && request.method === 'POST') {
        if (currentUser.role !== 'admin') return json({ error: 'Pouze administrátor.' }, 403, origin);
        const body = await readBody(request);
        const email = normalizeEmail(body?.email);
        const role = ['admin','pilot','technician','user'].includes(body?.role) ? body.role : 'user';
        if (!validCompanyEmail(email, env)) return json({ error: 'Použijte e-mail @dronetech.cz.' }, 400, origin);
        const code = randomCode();
        const codeHash = await sha256(code);
        const expiresAt = new Date(Date.now() + 7 * DAY_MS).toISOString();
        await env.DB.prepare('INSERT INTO invite_codes (id,email,code_hash,role,expires_at,created_by) VALUES (?,?,?,?,?,?)')
          .bind(crypto.randomUUID(), email, codeHash, role, expiresAt, currentUser.id).run();
        return json({ ok: true, code, email, role, expiresAt }, 201, origin);
      }

      if (url.pathname.startsWith('/admin/users/') && request.method === 'PUT') {
        if (currentUser.role !== 'admin') return json({ error: 'Pouze administrátor.' }, 403, origin);
        const id = decodeURIComponent(url.pathname.slice('/admin/users/'.length));
        const body = await readBody(request);
        const name = String(body?.name || '').trim().slice(0, 100);
        const role = ['admin','pilot','technician','user'].includes(body?.role) ? body.role : 'user';
        const active = body?.active ? 1 : 0;
        if (!name) return json({ error: 'Jméno je povinné.' }, 400, origin);
        if (id === currentUser.id && !active) return json({ error: 'Nemůžete deaktivovat vlastní účet.' }, 400, origin);
        await env.DB.prepare('UPDATE users SET name=?,role=?,active=? WHERE id=?').bind(name, role, active, id).run();
        return json({ ok: true }, 200, origin);
      }

      if (url.pathname === '/state' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT data,updated_at FROM app_state WHERE id=1').first();
        return json({ data: row ? JSON.parse(row.data) : { drones: [], pilots: [], flights: [], tasks: [] }, updatedAt: row?.updated_at || null }, 200, origin);
      }
      if (url.pathname === '/state' && request.method === 'PUT') {
        const body = await readBody(request);
        if (!body || typeof body.data !== 'object') return json({ error: 'Invalid state payload' }, 400, origin);
        const encoded = JSON.stringify(body.data);
        if (encoded.length > 2000000) return json({ error: 'State is too large' }, 413, origin);
        await env.DB.prepare(`INSERT INTO app_state (id,data,updated_at) VALUES (1,?,CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=CURRENT_TIMESTAMP`).bind(encoded).run();
        return json({ ok: true }, 200, origin);
      }

      if (url.pathname === '/chat' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT id,author,message,created_at FROM chat_messages ORDER BY created_at DESC LIMIT 100').all();
        return json({ messages: (rows.results || []).reverse() }, 200, origin);
      }
      if (url.pathname === '/chat' && request.method === 'POST') {
        const body = await readBody(request);
        const message = String(body?.message || '').trim().slice(0, 2000);
        if (!message) return json({ error: 'Zpráva je prázdná.' }, 400, origin);
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO chat_messages (id,author,message) VALUES (?,?,?)')
          .bind(id, currentUser.name || currentUser.email, message).run();
        return json({ ok: true, id }, 201, origin);
      }
      if (url.pathname.startsWith('/chat/') && request.method === 'DELETE') {
        if (currentUser.role !== 'admin') return json({ error: 'Pouze administrátor může mazat zprávy.' }, 403, origin);
        const id = decodeURIComponent(url.pathname.slice('/chat/'.length));
        await env.DB.prepare('DELETE FROM chat_messages WHERE id=?').bind(id).run();
        return json({ ok: true }, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (error) {
      console.error(error);
      return json({ error: 'Cloud API error' }, 500, origin);
    }
  }
};
