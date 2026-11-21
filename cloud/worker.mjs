// One private deployment per owner. The server stores ciphertext only.
const LIMIT = 1500000;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
function constantEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return diff === 0;
}
async function bodyOf(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const parts = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > LIMIT) { await reader.cancel(); throw new Error('size'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function validPayload(p) {
  return p && p.v === 1 && typeof p.iv === 'string' && /^[\w-]{16}$/.test(p.iv) && typeof p.data === 'string' && /^[\w-]{22,1400000}$/.test(p.data);
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health' && request.method === 'GET') return json({ name: '巷子日程同步', protocol: 1 });
      const match = /^\/v1\/vaults\/([a-f0-9-]{36})$/.exec(url.pathname);
      if (!match || !['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) return json({ error: 'not_found' }, 404);
      const token = /^Bearer ([\w-]{43})$/.exec(request.headers.get('Authorization') || '')?.[1];
      if (!token) return json({ error: 'unauthorized' }, 401);
      const id = match[1];
      const authHash = await hash(token);
      // Always read primary: CAS and initial pairing must not use a stale replica.
      const db = env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
      if (request.method === 'POST') {
        const setup = request.headers.get('X-Setup-Token') || '';
        if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 24 || !constantEqual(await hash(setup), await hash(env.SETUP_TOKEN))) return json({ error: 'unauthorized' }, 401);
        const body = await bodyOf(request);
        if (!validPayload(body.payload)) return json({ error: 'invalid_payload' }, 400);
        const inserted = await db.prepare('INSERT OR IGNORE INTO vaults (id, auth_hash, payload, updated_at) VALUES (?, ?, ?, ?)').bind(id, authHash, JSON.stringify(body.payload), new Date().toISOString()).run();
        return inserted.meta.changes ? json({ protocol: 1, revision: 1 }, 201) : json({ error: 'conflict' }, 409);
      }
      const row = await db.prepare('SELECT auth_hash, revision, payload FROM vaults WHERE id = ?').bind(id).first();
      if (!row || !constantEqual(row.auth_hash, authHash)) return json({ error: 'unauthorized' }, 401);
      if (request.method === 'GET') return json({ protocol: 1, revision: row.revision, payload: JSON.parse(row.payload) });
      if (request.method === 'DELETE') {
        await db.prepare('DELETE FROM vaults WHERE id = ? AND auth_hash = ?').bind(id, authHash).run();
        return json({ protocol: 1, revision: row.revision });
      }
      const body = await bodyOf(request);
      if (!Number.isSafeInteger(body.revision) || body.revision < 1 || !validPayload(body.payload)) return json({ error: 'invalid_payload' }, 400);
      const updated = await db.prepare('UPDATE vaults SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND auth_hash = ? AND revision = ?')
        .bind(JSON.stringify(body.payload), new Date().toISOString(), id, authHash, body.revision).run();
      return updated.meta.changes ? json({ protocol: 1, revision: body.revision + 1 }) : json({ error: 'conflict' }, 409);
    } catch (error) {
      if (error.message === 'size') return json({ error: 'too_large' }, 413);
      if (error instanceof SyntaxError || error instanceof TypeError || error.message === 'body') return json({ error: 'invalid_body' }, 400);
      // Do not log request headers, URLs containing credentials, or body data.
      return json({ error: 'service_unavailable' }, 503);
    }
  }
};
