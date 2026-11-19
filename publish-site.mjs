// Lets a signed-in owner/editor trigger a site rebuild so published CMS content goes live.
const json = (s, b) => ({ statusCode: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(b) });
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  const h = event.headers || {};
  const origin = h.origin || h.Origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (allowed.length && origin && !allowed.includes(origin)) return json(403, { error: 'Origin not allowed.' });
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, BUILD_HOOK_URL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !BUILD_HOOK_URL) return json(503, { error: 'Publishing is not configured (missing environment variables).' });
  const token = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Sign in first.' });
  const base = SUPABASE_URL.replace(/\/$/, '');
  try {
    const u = await fetch(`${base}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!u.ok) return json(401, { error: 'Session expired. Sign in again.' });
    const user = await u.json();
    const p = await fetch(`${base}/rest/v1/admin_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
    const role = (await p.json())[0]?.role;
    if (!['owner', 'editor'].includes(role)) return json(403, { error: 'Not allowed.' });
    const b = await fetch(BUILD_HOOK_URL, { method: 'POST' });
    if (!b.ok) return json(502, { error: 'Could not start the site build.' });
    return json(200, { ok: true });
  } catch (e) { console.error('publish-site error:', e?.message || 'unknown'); return json(502, { error: 'Could not start the site build.' }); }
};
