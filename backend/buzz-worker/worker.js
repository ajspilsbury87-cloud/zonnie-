/**
 * Zonnie terrace-buzz worker — anonymous, aggregate-only check-in counters
 * (community Phase B, FEATURE-RESEARCH-community-Jul2026.md).
 *
 * Privacy by design:
 *   - Stores ONLY aggregate counters per terrace (week bucket + all-time).
 *   - No accounts, no names, no coordinates, no user records. The device id
 *     is used solely for a 24h dedupe key that EXPIRES (KV TTL) — after a
 *     day, nothing ties a device to a check-in.
 *   - Responses never expose anything but counts.
 *
 * Abuse limits:
 *   - One counted check-in per device per terrace per Amsterdam day
 *     (KV dedupe key, 26h TTL).
 *   - Soft per-device daily cap (10 terraces/day) — nobody "visits" more.
 *   - terraceId must be a positive integer < 100000.
 *
 * Endpoints:
 *   POST /checkin   {terraceId: number, device: string}
 *     -> 200 {week, total, counted: boolean}
 *   GET  /buzz/:id  -> 200 {week, total}
 *
 * Bindings (wrangler.toml): BUZZ — a KV namespace.
 * Keys: b:<id>:w:<isoWeek> (weekly), b:<id>:all (all-time),
 *       s:<device>:<id>:<day> (dedupe, TTL), d:<device>:<day> (daily cap, TTL).
 */

const MAX_TERRACE_ID = 100000;
const DAILY_DEVICE_CAP = 10;

/** Amsterdam day + ISO-week strings (DST-correct via Intl). */
function amsterdamParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const day = fmt.format(now); // YYYY-MM-DD
  const [y, m, d] = day.split('-').map(Number);
  // ISO week from the calendar date (UTC math on the local date — DST-safe).
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { day, week: `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}` };
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // The app is the only intended client, but CORS-open GET lets the website
  // show buzz later with no changes here.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });

async function getCounts(env, id, week) {
  const [w, all] = await Promise.all([
    env.BUZZ.get(`b:${id}:w:${week}`),
    env.BUZZ.get(`b:${id}:all`),
  ]);
  return { week: Number(w) || 0, total: Number(all) || 0 };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });

    const buzzMatch = url.pathname.match(/^\/buzz\/(\d{1,6})$/);
    if (request.method === 'GET' && buzzMatch) {
      const id = Number(buzzMatch[1]);
      if (!(id > 0 && id < MAX_TERRACE_ID)) return json({ error: 'bad id' }, 400);
      const { week } = amsterdamParts();
      return json(await getCounts(env, id, week));
    }

    if (request.method === 'POST' && url.pathname === '/checkin') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const id = Number(body?.terraceId);
      const device = String(body?.device ?? '');
      if (!(Number.isInteger(id) && id > 0 && id < MAX_TERRACE_ID)) return json({ error: 'bad id' }, 400);
      if (!/^[0-9a-f-]{16,64}$/i.test(device)) return json({ error: 'bad device' }, 400);

      const { day, week } = amsterdamParts();

      // Dedupe: one counted check-in per device+terrace per day.
      const seenKey = `s:${device}:${id}:${day}`;
      if (await env.BUZZ.get(seenKey)) {
        return json({ ...(await getCounts(env, id, week)), counted: false });
      }

      // Soft daily cap per device across all terraces.
      const capKey = `d:${device}:${day}`;
      const used = Number(await env.BUZZ.get(capKey)) || 0;
      if (used >= DAILY_DEVICE_CAP) {
        return json({ ...(await getCounts(env, id, week)), counted: false });
      }

      // KV has no atomic increment; racing devices may lose the odd count.
      // Fine for a vibe-counter — never for anything transactional.
      const weekKey = `b:${id}:w:${week}`;
      const allKey = `b:${id}:all`;
      const [w, all] = await Promise.all([env.BUZZ.get(weekKey), env.BUZZ.get(allKey)]);
      await Promise.all([
        env.BUZZ.put(weekKey, String((Number(w) || 0) + 1), { expirationTtl: 60 * 60 * 24 * 21 }),
        env.BUZZ.put(allKey, String((Number(all) || 0) + 1)),
        env.BUZZ.put(seenKey, '1', { expirationTtl: 60 * 60 * 26 }),
        env.BUZZ.put(capKey, String(used + 1), { expirationTtl: 60 * 60 * 26 }),
      ]);
      return json({ week: (Number(w) || 0) + 1, total: (Number(all) || 0) + 1, counted: true });
    }

    return json({ error: 'not found' }, 404);
  },
};
