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
const CODE_MINUTES = 10;

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
  return email.split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || email;
}

async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes(email, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.role, u.active, s.id AS session_id
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.active = 1`).bind(tokenHash).first();
  if (!row) return null;
  await env.DB.prepare('UPDATE sessions SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').bind(row.session_id).run();
  return { id: row.id, email: row.email, name: row.name, role: row.role, sessionId: row.session_id };
}

async function sendLoginCode(email, code, env) {
  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) {
    throw new Error('Email provider is not configured');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: env.AUTH_FROM_EMAIL,
      to: [email],
      subject: 'Přihlašovací kód do DFM',
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#102033"><h1 style="margin:0 0 12px">DFM</h1><p>Váš jednorázový přihlašovací kód:</p><div style="font-size:36px;font-weight:800;letter-spacing:8px;padding:18px 0">${code}</div><p>Kód platí ${CODE_MINUTES} minut. Pokud jste o něj nežádali, e-mail ignorujte.</p></div>`
    })
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') return json({ ok: true }, 200, origin);

    try {
      await ensureSchema(env);
      const url = new URL(request.url);

      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, service: 'DFM Cloud API', auth: 'email-pin' }, 200, origin);
      }

      if (url.pathname === '/auth/request' && request.method === 'POST') {
        const body = await readBody(request);
        const email = normalizeEmail(body?.email);
        if (!validCompanyEmail(email, env)) return json({ error: 'Použijte firemní e-mail @dronetech.cz.' }, 400, origin);

        const recent = await env.DB.prepare(`SELECT created_at FROM login_codes WHERE email = ?
          AND created_at > datetime('now', '-60 seconds') ORDER BY created_at DESC LIMIT 1`).bind(email).first();
        if (recent) return json({ error: 'Nový kód lze poslat nejdříve za minutu.' }, 429, origin);

        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
        const codeHash = await sha256(`${email}:${code}`);
        const expiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000).toISOString();
        await env.DB.prepare('INSERT INTO login_codes (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)')
          .bind(crypto.randomUUID(), email, codeHash, expiresAt).run();
        await sendLoginCode(email, code, env);
        return json({ ok: true, expiresInMinutes: CODE_MINUTES }, 200, origin);
      }

      if (url.pathname === '/auth/verify' && request.method === 'POST') {
        const body = await readBody(request);
        const email = normalizeEmail(body?.email);
        const code = String(body?.code || '').trim();
        if (!validCompanyEmail(email, env) || !/^\d{6}$/.test(code)) return json({ error: 'Neplatný e-mail nebo PIN.' }, 400, origin);

        const codeHash = await sha256(`${email}:${code}`);
        const loginCode = await env.DB.prepare(`SELECT id FROM login_codes WHERE email = ? AND code_hash = ?
          AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`).bind(email, codeHash).first();
        if (!loginCode) return json({ error: 'PIN není platný nebo už vypršel.' }, 401, origin);
        await env.DB.prepare('UPDATE login_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(loginCode.id).run();

        let user = await env.DB.prepare('SELECT id, email, name, role, active FROM users WHERE email = ?').bind(email).first();
        if (!user) {
          const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();
          const role = email === normalizeEmail(env.ADMIN_EMAIL) || Number(count?.total || 0) === 0 ? 'admin' : 'user';
          const id = crypto.randomUUID();
          const name = displayNameFromEmail(email);
          await env.DB.prepare('INSERT INTO users (id, email, name, role, last_login) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
            .bind(id, email, name, role).run();
          user = { id, email, name, role, active: 1 };
        } else {
          if (!user.active) return json({ error: 'Účet je deaktivovaný.' }, 403, origin);
          await env.DB.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id).run();
        }

        const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
        const tokenHash = await sha256(token);
        const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS).toISOString();
        await env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
          .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt).run();
        return json({ token, expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role } }, 200, origin);
      }

      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return json({ error: 'Přihlášení je vyžadováno.' }, 401, origin);

      if (url.pathname === '/auth/me' && request.method === 'GET') {
        return json({ user: { id: currentUser.id, email: currentUser.email, name: currentUser.name, role: currentUser.role } }, 200, origin);
      }

      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(currentUser.sessionId).run();
        return json({ ok: true }, 200, origin);
      }

      if (url.pathname === '/state' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT data, updated_at FROM app_state WHERE id = 1').first();
        return json({ data: row ? JSON.parse(row.data) : { drones: [], pilots: [], flights: [], tasks: [] }, updatedAt: row?.updated_at || null }, 200, origin);
      }

      if (url.pathname === '/state' && request.method === 'PUT') {
        const body = await readBody(request);
        if (!body || typeof body.data !== 'object') return json({ error: 'Invalid state payload' }, 400, origin);
        const encoded = JSON.stringify(body.data);
        if (encoded.length > 2_000_000) return json({ error: 'State is too large' }, 413, origin);
        await env.DB.prepare(`INSERT INTO app_state (id, data, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`).bind(encoded).run();
        return json({ ok: true }, 200, origin);
      }

      if (url.pathname === '/chat' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT id, author, message, created_at FROM chat_messages ORDER BY created_at DESC LIMIT 100').all();
        return json({ messages: (rows.results || []).reverse() }, 200, origin);
      }

      if (url.pathname === '/chat' && request.method === 'POST') {
        const body = await readBody(request);
        const message = String(body?.message || '').trim().slice(0, 2000);
        if (!message) return json({ error: 'Zpráva je prázdná.' }, 400, origin);
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO chat_messages (id, author, message) VALUES (?, ?, ?)')
          .bind(id, currentUser.name || currentUser.email, message).run();
        return json({ ok: true, id }, 201, origin);
      }

      if (url.pathname.startsWith('/chat/') && request.method === 'DELETE') {
        const id = decodeURIComponent(url.pathname.slice('/chat/'.length));
        if (currentUser.role !== 'admin') return json({ error: 'Pouze administrátor může mazat zprávy.' }, 403, origin);
        await env.DB.prepare('DELETE FROM chat_messages WHERE id = ?').bind(id).run();
        return json({ ok: true }, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (error) {
      console.error(error);
      const message = error?.message === 'Email provider is not configured'
        ? 'Odesílání PINů zatím není nastavené.'
        : 'Cloud API error';
      return json({ error: message }, 500, origin);
    }
  }
};
