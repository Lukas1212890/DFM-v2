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

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '*';
  if (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === '*') return '*';
  return origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
}

function authorized(request, env) {
  if (!env.APP_TOKEN) return true;
  return request.headers.get('authorization') === `Bearer ${env.APP_TOKEN}`;
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') return json({ ok: true }, 200, origin);
    if (!authorized(request, env)) return json({ error: 'Unauthorized' }, 401, origin);

    const url = new URL(request.url);
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, service: 'DFM Cloud API' }, 200, origin);
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
        const author = String(body?.author || '').trim().slice(0, 80);
        const message = String(body?.message || '').trim().slice(0, 2000);
        if (!author || !message) return json({ error: 'Author and message are required' }, 400, origin);
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO chat_messages (id, author, message) VALUES (?, ?, ?)').bind(id, author, message).run();
        return json({ ok: true, id }, 201, origin);
      }

      if (url.pathname.startsWith('/chat/') && request.method === 'DELETE') {
        const id = decodeURIComponent(url.pathname.slice('/chat/'.length));
        await env.DB.prepare('DELETE FROM chat_messages WHERE id = ?').bind(id).run();
        return json({ ok: true }, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (error) {
      console.error(error);
      return json({ error: 'Cloud API error' }, 500, origin);
    }
  }
};
