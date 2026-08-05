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

const DAY_MS = 86400000;
const SESSION_DAYS = 365;
const PASSWORD_ITERATIONS = 120000;

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '*';
  if (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === '*') return '*';
  return origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
}
async function readBody(request) { try { return await request.json(); } catch { return null; } }
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function normalizeCode(v) { return String(v || '').normalize('NFKC').trim().toUpperCase().replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, ''); }
function validCompanyEmail(email, env) {
  const domain = String(env.AUTH_DOMAIN || 'dronetech.cz').trim().toLowerCase();
  return email.endsWith(`@${domain}`) && email.length <= 254;
}
function validPassword(p) { return typeof p === 'string' && p.length >= 10 && p.length <= 128; }
function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint8Array(10));
  return [...values].map(v => alphabet[v % alphabet.length]).join('');
}
function toBase64(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
}
function fromBase64(s) {
  const raw = atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function passwordHash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return { hash: toBase64(new Uint8Array(bits)), salt: toBase64(salt) };
}
async function verifyPassword(password, salt64, hash64) {
  if (!salt64 || !hash64) return false;
  const result = await passwordHash(password, fromBase64(salt64));
  return result.hash === hash64;
}
async function addColumn(env, sql) { try { await env.DB.prepare(sql).run(); } catch (e) { if (!String(e).includes('duplicate column')) throw e; } }

async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login TEXT,
      password_hash TEXT, password_salt TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS invite_codes (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'user', expires_at TEXT NOT NULL,
      used_at TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS reset_codes (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, used_at TEXT, created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_invite_email ON invite_codes(email, created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_reset_email ON reset_codes(email, created_at)')
  ]);
  await addColumn(env, 'ALTER TABLE users ADD COLUMN password_hash TEXT');
  await addColumn(env, 'ALTER TABLE users ADD COLUMN password_salt TEXT');
}

async function getSessionUser(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const tokenHash = await sha256(auth.slice(7).trim());
  const row = await env.DB.prepare(`SELECT u.id,u.email,u.name,u.role,u.active,u.password_hash,
    s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.active=1`).bind(tokenHash).first();
  if (!row) return null;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS).toISOString();
  await env.DB.prepare('UPDATE sessions SET last_seen=CURRENT_TIMESTAMP,expires_at=? WHERE id=?').bind(expiresAt, row.session_id).run();
  return { id: row.id, email: row.email, name: row.name, role: row.role, sessionId: row.session_id, hasPassword: Boolean(row.password_hash) };
}
async function createSession(user, env) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)')
    .bind(crypto.randomUUID(), user.id, await sha256(token), expiresAt).run();
  return { token, expiresAt };
}
function publicUser(u) { return { id: u.id, email: u.email, name: u.name, role: u.role, hasPassword: Boolean(u.password_hash ?? u.hasPassword) }; }

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') return json({ ok: true }, 200, origin);
    try {
      await ensureSchema(env);
      const url = new URL(request.url);

      if (url.pathname === '/health' && request.method === 'GET') {
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();
        return json({ ok: true, initialized: Number(count?.total || 0) > 0, auth: 'password' }, 200, origin);
      }

      if (url.pathname === '/auth/bootstrap' && request.method === 'POST') {
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();
        if (Number(count?.total || 0) > 0) return json({ error: 'Aplikace už byla inicializována.' }, 409, origin);
        const body = await readBody(request);
        const email = normalizeEmail(body?.email);
        const name = String(body?.name || '').trim().slice(0,100);
        const code = normalizeCode(body?.code);
        const password = String(body?.password || '');
        if (!validCompanyEmail(email, env) || !name || !validPassword(password)) return json({ error: 'Vyplňte jméno, firemní e-mail a heslo alespoň 10 znaků.' }, 400, origin);
        if (!normalizeCode(env.BOOTSTRAP_CODE) || code !== normalizeCode(env.BOOTSTRAP_CODE)) return json({ error: 'Nesprávný startovací kód administrátora.' }, 401, origin);
        const pwd = await passwordHash(password);
        const user = { id: crypto.randomUUID(), email, name, role: 'admin', password_hash: pwd.hash };
        await env.DB.prepare(`INSERT INTO users(id,email,name,role,password_hash,password_salt,last_login)
          VALUES(?,?,?,'admin',?,?,CURRENT_TIMESTAMP)`).bind(user.id,email,name,pwd.hash,pwd.salt).run();
        const session = await createSession(user, env);
        return json({ ...session, user: publicUser(user) }, 201, origin);
      }

      if (url.pathname === '/auth/register' && request.method === 'POST') {
        const body = await readBody(request);
        const email = normalizeEmail(body?.email);
        const name = String(body?.name || '').trim().slice(0,100);
        const code = normalizeCode(body?.code);
        const password = String(body?.password || '');
        if (!validCompanyEmail(email, env) || !name || !validPassword(password)) return json({ error: 'Vyplňte jméno, firemní e-mail a heslo alespoň 10 znaků.' }, 400, origin);
        if (await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first()) return json({ error: 'Účet s tímto e-mailem už existuje.' }, 409, origin);
        const invite = await env.DB.prepare(`SELECT id,role FROM invite_codes WHERE email=? AND code_hash=?
          AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`)
          .bind(email, await sha256(code)).first();
        if (!invite) return json({ error: 'Pozvánka není platná nebo už vypršela.' }, 401, origin);
        const pwd = await passwordHash(password);
        const user = { id: crypto.randomUUID(), email, name, role: invite.role, password_hash: pwd.hash };
        await env.DB.prepare(`INSERT INTO users(id,email,name,role,password_hash,password_salt,last_login)
          VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(user.id,email,name,invite.role,pwd.hash,pwd.salt).run();
        await env.DB.prepare('UPDATE invite_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?').bind(invite.id).run();
        const session = await createSession(user, env);
        return json({ ...session, user: publicUser(user) }, 201, origin);
      }

      if (url.pathname === '/auth/login' && request.method === 'POST') {
        const body = await readBody(request);
        const email = normalizeEmail(body?.email);
        const password = String(body?.password || '');
        const user = await env.DB.prepare('SELECT id,email,name,role,active,password_hash,password_salt FROM users WHERE email=?').bind(email).first();
        if (!user || !user.active || !await verifyPassword(password,user.password_salt,user.password_hash)) return json({ error: 'Nesprávný e-mail nebo heslo.' }, 401, origin);
        await env.DB.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?').bind(user.id).run();
        const session = await createSession(user, env);
        return json({ ...session, user: publicUser(user) }, 200, origin);
      }

      if (url.pathname === '/auth/reset' && request.method === 'POST') {
        const body = await readBody(request);
        const email = normalizeEmail(body?.email);
        const code = normalizeCode(body?.code);
        const password = String(body?.password || '');
        if (!validPassword(password)) return json({ error: 'Heslo musí mít alespoň 10 znaků.' }, 400, origin);
        const reset = await env.DB.prepare(`SELECT id FROM reset_codes WHERE email=? AND code_hash=?
          AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`)
          .bind(email, await sha256(code)).first();
        if (!reset) return json({ error: 'Resetovací kód není platný nebo vypršel.' }, 401, origin);
        const pwd = await passwordHash(password);
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE email=?').bind(pwd.hash,pwd.salt,email),
          env.DB.prepare('UPDATE reset_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?').bind(reset.id),
          env.DB.prepare('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)').bind(email)
        ]);
        return json({ ok: true }, 200, origin);
      }

      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return json({ error: 'Přihlášení je vyžadováno.' }, 401, origin);

      if (url.pathname === '/auth/me' && request.method === 'GET') return json({ user: publicUser(currentUser) }, 200, origin);
      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(currentUser.sessionId).run();
        return json({ ok: true }, 200, origin);
      }
      if (url.pathname === '/auth/password' && request.method === 'POST') {
        const body = await readBody(request);
        const password = String(body?.password || '');
        if (!validPassword(password)) return json({ error: 'Heslo musí mít alespoň 10 znaků.' }, 400, origin);
        const pwd = await passwordHash(password);
        await env.DB.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').bind(pwd.hash,pwd.salt,currentUser.id).run();
        return json({ ok: true }, 200, origin);
      }

      if (url.pathname === '/admin/users' && request.method === 'GET') {
        if (currentUser.role !== 'admin') return json({ error: 'Pouze administrátor.' }, 403, origin);
        const rows = await env.DB.prepare(`SELECT u.id,u.email,u.name,u.role,u.active,u.created_at,u.last_login,
          COUNT(s.id) AS sessions,MAX(s.last_seen) AS last_seen FROM users u LEFT JOIN sessions s
          ON s.user_id=u.id AND s.expires_at>CURRENT_TIMESTAMP GROUP BY u.id ORDER BY u.name`).all();
        return json({ users: rows.results || [] }, 200, origin);
      }
      if (url.pathname === '/admin/invites' && request.method === 'POST') {
        if (currentUser.role !== 'admin') return json({ error: 'Pouze administrátor.' }, 403, origin);
        const body = await readBody(request);
        const email = normalizeEmail(body?.email);
        const role = ['admin','pilot','technician','user'].includes(body?.role) ? body.role : 'user';
        if (!validCompanyEmail(email,env)) return json({ error: 'Použijte e-mail @dronetech.cz.' },400,origin);
        const code = randomCode();
        const expiresAt = new Date(Date.now()+7*DAY_MS).toISOString();
        await env.DB.prepare('INSERT INTO invite_codes(id,email,code_hash,role,expires_at,created_by) VALUES(?,?,?,?,?,?)')
          .bind(crypto.randomUUID(),email,await sha256(code),role,expiresAt,currentUser.id).run();
        return json({ ok:true,code,email,role,expiresAt },201,origin);
      }
      if (url.pathname.startsWith('/admin/users/') && url.pathname.endsWith('/logout') && request.method === 'POST') {
        if (currentUser.role !== 'admin') return json({ error:'Pouze administrátor.' },403,origin);
        const id = decodeURIComponent(url.pathname.slice('/admin/users/'.length,-'/logout'.length));
        if (id === currentUser.id) return json({ error:'Vlastní relaci ukončete tlačítkem Odhlásit se.' },400,origin);
        await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
        return json({ ok:true },200,origin);
      }
      if (url.pathname.startsWith('/admin/users/') && url.pathname.endsWith('/reset-code') && request.method === 'POST') {
        if (currentUser.role !== 'admin') return json({ error:'Pouze administrátor.' },403,origin);
        const id = decodeURIComponent(url.pathname.slice('/admin/users/'.length,-'/reset-code'.length));
        const target = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(id).first();
        if (!target) return json({ error:'Uživatel nebyl nalezen.' },404,origin);
        const code = randomCode();
        const expiresAt = new Date(Date.now()+24*60*60*1000).toISOString();
        await env.DB.prepare('INSERT INTO reset_codes(id,email,code_hash,expires_at,created_by) VALUES(?,?,?,?,?)')
          .bind(crypto.randomUUID(),target.email,await sha256(code),expiresAt,currentUser.id).run();
        return json({ ok:true,code,email:target.email,expiresAt },201,origin);
      }
      if (url.pathname.startsWith('/admin/users/') && request.method === 'PUT') {
        if (currentUser.role !== 'admin') return json({ error:'Pouze administrátor.' },403,origin);
        const id = decodeURIComponent(url.pathname.slice('/admin/users/'.length));
        const body = await readBody(request);
        const name = String(body?.name||'').trim().slice(0,100);
        const role = ['admin','pilot','technician','user'].includes(body?.role)?body.role:'user';
        const active = body?.active ? 1 : 0;
        if (!name) return json({ error:'Jméno je povinné.' },400,origin);
        if (id===currentUser.id && !active) return json({ error:'Nemůžete deaktivovat vlastní účet.' },400,origin);
        await env.DB.prepare('UPDATE users SET name=?,role=?,active=? WHERE id=?').bind(name,role,active,id).run();
        if (!active) await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
        return json({ ok:true },200,origin);
      }

      if (url.pathname === '/state' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT data,updated_at FROM app_state WHERE id=1').first();
        return json({ data:row?JSON.parse(row.data):{drones:[],pilots:[],flights:[],tasks:[]},updatedAt:row?.updated_at||null },200,origin);
      }
      if (url.pathname === '/state' && request.method === 'PUT') {
        const body = await readBody(request);
        if (!body || typeof body.data!=='object') return json({error:'Invalid state payload'},400,origin);
        const encoded=JSON.stringify(body.data);
        if(encoded.length>2000000)return json({error:'State is too large'},413,origin);
        await env.DB.prepare(`INSERT INTO app_state(id,data,updated_at) VALUES(1,?,CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=CURRENT_TIMESTAMP`).bind(encoded).run();
        return json({ok:true},200,origin);
      }
      if (url.pathname === '/chat' && request.method === 'GET') {
        const rows=await env.DB.prepare('SELECT id,author,message,created_at FROM chat_messages ORDER BY created_at DESC LIMIT 100').all();
        return json({messages:(rows.results||[]).reverse()},200,origin);
      }
      if (url.pathname === '/chat' && request.method === 'POST') {
        const body=await readBody(request); const message=String(body?.message||'').trim().slice(0,2000);
        if(!message)return json({error:'Zpráva je prázdná.'},400,origin);
        const id=crypto.randomUUID();
        await env.DB.prepare('INSERT INTO chat_messages(id,author,message) VALUES(?,?,?)').bind(id,currentUser.name||currentUser.email,message).run();
        return json({ok:true,id},201,origin);
      }
      return json({error:'Not found'},404,origin);
    } catch(error) {
      console.error(error);
      return json({error:'Cloud API error'},500,origin);
    }
  }
};
